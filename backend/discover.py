import os
import re
import json
import time
import asyncio
import urllib.request
import urllib.parse
from typing import AsyncIterator, List, Optional, Dict
from fastapi import APIRouter, Query, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth_routes import get_current_company
from auth_models import Company

# ─── Import helpers from email_outreach.py ───────────────────────────────────
from email_outreach import (
    fetch_url_content,
    compute_relevance_score
)

discover_router = APIRouter()

# ─── Noise Filter Sets ────────────────────────────────────────────────────────
EXCLUDE_DOMAINS = {
    'wikipedia.org', 'reddit.com', 'quora.com', 'youtube.com',
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
    'forbes.com', 'fortune.com', 'inc.com', 'businessinsider.com', 'bloomberg.com',
    'reuters.com', 'techcrunch.com', 'entrepreneur.com', 'fastcompany.com',
    'crunchbase.com', 'glassdoor.com', 'indeed.com', 'g2.com', 'capterra.com',
    'clutch.co', 'yelp.com', 'bbb.org', 'dnb.com', 'zoominfo.com',
    'lusha.com', 'apollo.io', 'statista.com', 'ibisworld.com',
    'yellowpages.com', 'manta.com', 'hoovers.com', 'pitchbook.com',
    'dribbble.com', 'behance.net', 'awwwards.com', 'themeforest.net',
    'envato.com', 'wix.com', 'squarespace.com', 'webflow.com',
    'getlatka.com', 'cloud-awards.com', 'saastr.com', 'saasgenius.com',
    'jobtoday.com', 'monster.com', 'simplyhired.com', 'ziprecruiter.com',
    'upwork.com', 'fiverr.com', 'medium.com', 'github.com', 'trustpilot.com',
    'f6s.com', 'designrush.com', 'goodfirms.co', 'sortlist.com', 'topdevelopers.co',
    'builtin.com', 'ensun.io', 'ainewsera.com'
}

SKIP_PATTERNS = [
    '/list', '/top-', '/best-', '/ranking', '/directory', '/category',
    '/blog/', '/news/', '/article', '/search?', 'list-of', 'companies-in',
    'agencies-in', 'software-in', 'suppliers-in', 'manufacturers-in'
]

# Simple in-memory evaluation cache to avoid duplicate LLM calls per domain
_EVALUATION_CACHE: Dict[str, dict] = {}

def get_cached_evaluation(domain: str) -> Optional[dict]:
    return _EVALUATION_CACHE.get(domain.lower())

def set_cached_evaluation(domain: str, result: dict):
    if domain and result:
        _EVALUATION_CACHE[domain.lower()] = result

def clean_domain(raw_url: str) -> str:
    if not raw_url:
        return ""
    try:
        from urllib.parse import urlparse
        netloc = urlparse(raw_url).netloc if raw_url.startswith("http") else raw_url.split('/')[0]
        netloc = netloc.lower().split(':')[0]
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc
    except Exception:
        return ""


# ─── Pydantic Request Schema ──────────────────────────────────────────────────
class DiscoverRequest(BaseModel):
    keyword: str
    country: Optional[str] = ""
    city: Optional[str] = ""
    minTrustScore: Optional[float] = None
    min_trust_score: Optional[float] = None
    min_confidence: Optional[int] = 60
    pageno: Optional[int] = 1
    page: Optional[int] = 1
    target_count: Optional[int] = 10
    reset_cursor: Optional[bool] = False
    our_company: Optional[str] = None
    our_services: Optional[str] = None


# ─── Search Provider Helpers ──────────────────────────────────────────────────
async def search_searxng_or_ddg(query: str, page: int = 1) -> List[dict]:
    """
    Attempts SearXNG search first. If unavailable/empty, falls back to DuckDuckGo HTML scraping.
    """
    searxng_url = os.getenv("SEARXNG_URL", "http://localhost:8080")
    results = []

    # Attempt 1: SearXNG
    try:
        params = urllib.parse.urlencode({
            "q": query, "format": "json", "pageno": page, "language": "en"
        })
        req = urllib.request.Request(
            f"{searxng_url}/search?{params}",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        loop = asyncio.get_event_loop()
        def _fetch():
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    return data.get('results', [])
                return []
        results = await loop.run_in_executor(None, _fetch)
    except Exception as e:
        print(f"[Discover Search] SearXNG unavailable ({e}) — switching to DDG fallback...")

    if results:
        return results

    # Attempt 2: DuckDuckGo HTML Scrape
    try:
        params = urllib.parse.urlencode({"q": query, "s": (page - 1) * 10})
        req = urllib.request.Request(
            f"https://html.duckduckgo.com/html/?{params}",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            }
        )
        loop = asyncio.get_event_loop()
        def _fetch_ddg():
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                if resp.status == 200:
                    html = resp.read().decode('utf-8', errors='ignore')
                    items = []
                    blocks = html.split('class="result__body"')
                    for b in blocks[1:]:
                        try:
                            url_match = re.search(r'href="([^"]+)"', b)
                            title_match = re.search(r'class="result__snippet[^"]*">([^<]+)<', b) or re.search(r'>([^<]{10,80})</a>', b)
                            snippet_match = re.search(r'class="result__snippet[^"]*">([\s\S]*?)</span>', b)
                            if url_match:
                                raw_u = url_match.group(1)
                                if "uddg=" in raw_u:
                                    raw_u = urllib.parse.unquote(raw_u.split("uddg=")[1].split("&")[0])
                                items.append({
                                    "url": raw_u,
                                    "title": re.sub(r'<[^>]+>', '', title_match.group(1)).strip() if title_match else "",
                                    "content": re.sub(r'<[^>]+>', '', snippet_match.group(1)).strip() if snippet_match else ""
                                })
                        except Exception:
                            continue
                    return items
                return []
        results = await loop.run_in_executor(None, _fetch_ddg)
    except Exception as e:
        print(f"[Discover Search] DDG Fallback failed: {e}")

    return results


# ─── Local Ollama Fit Decision ────────────────────────────────────────────────
async def call_ollama_fit_decision(
    company_name: str, domain: str, snippet: str, scraped_text: str,
    our_company: str, our_services: str, timeout: float = 7.0
) -> Optional[dict]:
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    model_name = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:3b")
    text_sample = (scraped_text or snippet)[:1500].strip()

    prompt = f"""Evaluate prospect fit for {our_company} ({our_services}).
Candidate: {company_name} ({domain})
Content: {text_sample}

Is this candidate a valid B2B prospect for {our_company}?
Reject B2C, news, directories, job boards.

Return JSON:
{{"is_potential_client": true/false, "confidence": 0-100, "reason": "short clear sentence"}}"""

    payload = {
        "model": model_name,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 120}
    }

    loop = asyncio.get_event_loop()
    def _invoke():
        try:
            req_data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                f"{ollama_url}/api/generate",
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode('utf-8'))
                    raw_res = body.get("response", "").strip()
                    parsed = json.loads(raw_res)
                    parsed["source"] = "local-ollama"
                    return parsed
        except Exception:
            return None

    try:
        return await loop.run_in_executor(None, _invoke)
    except Exception as e:
        print(f"[Local Ollama LLM] Executor error for {domain}: {e}")
        return None


# ─── Dynamic Groq Cloud LLM Evaluation ──────────────────────────────────────
async def evaluate_client_fit_groq(
    company_name: str, domain: str, snippet: str, scraped_text: str,
    our_company: str, our_services: str, target_customers: str = "",
    description: str = "", industry: str = ""
) -> Optional[dict]:
    apiKey = os.getenv("GROQ_API_KEY")
    if not apiKey:
        print(f"[Groq Fallback] GROQ_API_KEY missing.")
        return None

    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    text_sample = (scraped_text or snippet)[:1500].strip()

    company_name_str = our_company or "Our Company"
    services_str = our_services or "B2B Products & Services"

    prompt = f"""You are an expert B2B sales intelligence analyst evaluating lead fit for {company_name_str}.
Our Company: {company_name_str}
Industry: {industry or 'B2B Industry'}
Services & Solutions: {services_str}
Target Customers: {target_customers or 'B2B Business Customers'}
Company Description: {description or services_str}

Candidate Prospect Company:
Name: {company_name}
Domain: {domain}
Website Content Snippet:
{text_sample}

Determine strictly if this prospect company is a realistic potential customer for {company_name_str}'s products/services.
Reject (is_potential_client: false) any candidate that is consumer-only (B2C), news outlet, directory, job board, or has no relevant commercial/business needs.

Return ONLY a single valid JSON object:
{{
  "is_potential_client": true or false,
  "confidence": integer between 0 and 100,
  "reason": "One clear sentence explaining WHY this candidate could become a customer of {company_name_str}, referencing what the prospect actually does."
}}"""

    print(f"\n--- [GROQ PROMPT DEBUG FOR {domain}] ---")
    print(f"Evaluator Target Company: {company_name_str}")
    print(f"Evaluator Services      : {services_str}")
    print(f"Evaluator Target Clients : {target_customers}")
    print("------------------------------------------\n")

    headers = {
        "Authorization": f"Bearer {apiKey}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a strict B2B sales intelligence classifier. Output strictly valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2, "max_tokens": 200
    }

    loop = asyncio.get_event_loop()

    def _call_groq():
        try:
            req_data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=req_data, headers=headers, method="POST"
            )
            with urllib.request.urlopen(req, timeout=6.0) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode('utf-8'))
                    raw_content = body["choices"][0]["message"]["content"].strip()
                    raw_content = re.sub(r'^```(?:json)?\s*', '', raw_content)
                    raw_content = re.sub(r'\s*```$', '', raw_content)
                    parsed = json.loads(raw_content)
                    parsed["source"] = "groq-fallback"
                    return parsed
        except Exception as e:
            print(f"[Groq Fallback] Evaluation failed for {domain}: {e}")
            return None

    try:
        return await loop.run_in_executor(None, _call_groq)
    except Exception as e:
        print(f"[Groq Fallback] Executor error for {domain}: {e}")
        return None


# ─── Dual-Engine Dispatcher ───────────────────────────────────────────────────
async def evaluate_client_fit_dual_engine(
    company_name: str, domain: str, snippet: str, scraped_text: str,
    our_company: str, our_services: str, target_customers: str = "",
    description: str = "", industry: str = ""
) -> Optional[dict]:
    res = await call_ollama_fit_decision(
        company_name=company_name, domain=domain, snippet=snippet,
        scraped_text=scraped_text, our_company=our_company, our_services=our_services, timeout=7.0
    )
    if res and isinstance(res, dict) and "is_potential_client" in res:
        return res

    print(f"[LLM Dispatcher] Local Ollama failed/unavailable for {domain} — initiating Groq dynamic evaluation for '{our_company}'...")
    return await evaluate_client_fit_groq(
        company_name=company_name, domain=domain, snippet=snippet,
        scraped_text=scraped_text, our_company=our_company, our_services=our_services,
        target_customers=target_customers, description=description, industry=industry
    )


# ─── Streaming Discovery Generator ───────────────────────────────────────────
async def stream_discovery(
    keyword: str,
    country: str = "",
    city: str = "",
    min_trust: float = 0.0,
    min_confidence: int = 60,
    start_page: int = 1,
    target_count: int = 10,
    max_pages: int = 5,
    our_company: str = "",
    our_services: str = "",
    target_customers: str = "",
    description: str = "",
    industry: str = "",
    company_id: int = 1
) -> AsyncIterator[str]:
    """
    Async generator that yields NDJSON lines. Evaluates leads using authenticated company profile.
    """
    clean_keyword = keyword.strip()
    clean_country = country.strip()
    clean_city = city.strip()
    company_name_context = our_company
    services_context = our_services

    effective_min_confidence = int(min_confidence or 60)
    if min_trust and min_trust > 0:
        effective_min_confidence = max(effective_min_confidence, int(min_trust))

    location_str = f"{clean_city}, {clean_country}".strip(", ")
    query_text = f"{clean_keyword} companies"
    if location_str:
        query_text += f" in {location_str}"

    yield json.dumps({"type": "start", "query": query_text, "target": target_count}) + "\n"

    print(f"\n==================== [DYNAMIC DISCOVERY START] ====================")
    print(f"[Discover] Authenticated Company: '{company_name_context}' | Services: '{services_context}'")
    print(f"[Discover] Query: '{query_text}' | Target: {target_count} | Min Confidence: {effective_min_confidence}%")

    qualified_total = 0
    seen_domains: set = set()
    semaphore = asyncio.Semaphore(5)
    total_ollama = 0
    total_groq = 0
    total_raw = 0
    total_noise_passed = 0
    total_tfidf_passed = 0

    for current_page in range(start_page, start_page + max_pages):
        if qualified_total >= target_count:
            break

        raw_results = await search_searxng_or_ddg(query_text, page=current_page)
        total_raw += len(raw_results)

        if not raw_results:
            print(f"[Discover] Page {current_page} — zero results returned. Search exhausted.")
            break

        page_candidates = []
        for item in raw_results:
            url = item.get('url', '')
            domain = clean_domain(url)
            if (not domain
                    or domain in EXCLUDE_DOMAINS
                    or any(ext in domain for ext in ['.gov', '.edu'])
                    or any(p in url.lower() for p in SKIP_PATTERNS)
                    or domain in seen_domains):
                continue
            seen_domains.add(domain)
            page_candidates.append(item)

        total_noise_passed += len(page_candidates)

        page_candidates_trimmed = page_candidates[:20]

        async def evaluate_and_emit(idx: int, item: dict):
            nonlocal qualified_total, total_ollama, total_groq
            async with semaphore:
                url = item.get('url', '')
                title = item.get('title', '')
                snippet = item.get('content', '') or item.get('snippet', '')
                domain = clean_domain(url)

                company_name = title.split('|')[0].split(' - ')[0].split(' : ')[0].strip()
                if not company_name or len(company_name) > 60:
                    company_name = domain.split('.')[0].capitalize()

                if "cached_evaluation" in item:
                    eval_res = item["cached_evaluation"]
                else:
                    scraped = item.get("scraped_content", "")
                    eval_res = await evaluate_client_fit_dual_engine(
                        company_name=company_name, domain=domain, snippet=snippet,
                        scraped_text=scraped, our_company=company_name_context,
                        our_services=services_context, target_customers=target_customers,
                        description=description, industry=industry
                    )

                if not eval_res or not isinstance(eval_res, dict):
                    return None

                is_client = bool(eval_res.get("is_potential_client"))
                confidence = int(eval_res.get("confidence", 0))
                reason = str(eval_res.get("reason", "")).strip()
                source = str(eval_res.get("source", "local-ollama"))

                if source == "local-ollama":
                    total_ollama += 1
                elif source == "groq-fallback":
                    total_groq += 1

                set_cached_evaluation(domain, {
                    "is_potential_client": is_client, "confidence": confidence,
                    "reason": reason, "source": source
                })

                if is_client and confidence >= effective_min_confidence:
                    qualified_total += 1
                    print(f"[{source.upper()} LLM] ACCEPTED {domain} ({confidence}%). {qualified_total}/{target_count}")
                    return {
                        "type": "company",
                        "id": f"co-{int(time.time() * 1000)}-{idx}-{domain[:6]}",
                        "name": company_name,
                        "website": url,
                        "displayUrl": domain,
                        "domain": domain,
                        "industry": clean_keyword,
                        "country": clean_country or "Global",
                        "city": clean_city,
                        "snippet": snippet[:280] if snippet else f"{company_name} operates in the {clean_keyword} sector.",
                        "matchReason": reason or f"Plausible prospect for {services_context}.",
                        "matchConfidence": confidence,
                        "trustScore": confidence,
                        "trustStatus": "High Fit" if confidence >= 80 else "Medium Fit",
                        "source": source
                    }
                return None

        tasks = [evaluate_and_emit(i, item) for i, item in enumerate(page_candidates_trimmed)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if res and isinstance(res, dict):
                yield json.dumps(res) + "\n"
                # Automatically persist discovered lead with company_id scoping
                if res.get("type") == "company":
                    try:
                        database.save_lead(
                            lead_id=res.get("id", f"lead-{time.time()}"),
                            name=res.get("name", "Unknown Company"),
                            description=res.get("snippet", ""),
                            email=f"contact@{res.get('domain', 'company.com')}",
                            subject=f"Outreach opportunity for {res.get('name')}",
                            sent_at=None,
                            action=res.get("matchReason", "AI Qualified Prospect"),
                            email_source_context=json.dumps(res),
                            company_id=company_id
                        )
                    except Exception as db_err:
                        print(f"[Discover DB Save Error]: {db_err}")
                if qualified_total >= target_count:
                    break

        yield json.dumps({
            "type": "progress", "page": current_page, "qualified": qualified_total,
            "target": target_count, "processed": total_noise_passed
        }) + "\n"

    yield json.dumps({
        "type": "complete", "totalQualified": qualified_total,
        "summary": f"Discovery finished. Found {qualified_total} qualified prospects for {company_name_context}."
    }) + "\n"


# ─── Streaming POST /discover-companies (JWT Protected) ──────────────────────
@discover_router.post("/discover-companies")
async def post_discover_companies(
    req: DiscoverRequest,
    current_company: Company = Depends(get_current_company)
):
    if not req.keyword or not req.keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword is required.")

    min_trust = req.minTrustScore if req.minTrustScore is not None else (req.min_trust_score or 0.0)
    conf = int(req.min_confidence or min_trust or 60)
    page_num = int(req.pageno or req.page or 1)

    return StreamingResponse(
        stream_discovery(
            keyword=req.keyword,
            country=req.country or "",
            city=req.city or "",
            min_trust=float(min_trust),
            min_confidence=conf,
            start_page=page_num,
            target_count=int(req.target_count or 10),
            max_pages=5,
            our_company=current_company.name,
            our_services=current_company.services or current_company.description or "B2B Products & Services",
            target_customers=current_company.target_customers or "",
            description=current_company.description or "",
            industry=current_company.industry or "",
            company_id=current_company.id
        ),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
    )

# ─── Streaming GET /discover-companies (JWT Protected) ──────────────────────
@discover_router.get("/discover-companies")
async def get_discover_companies(
    keyword: str = Query(...),
    country: Optional[str] = Query(""),
    city: Optional[str] = Query(""),
    minTrustScore: Optional[float] = Query(None),
    min_trust_score: Optional[float] = Query(None),
    min_confidence: Optional[int] = Query(None),
    pageno: Optional[int] = Query(1),
    page: Optional[int] = Query(1),
    target_count: Optional[int] = Query(10),
    current_company: Company = Depends(get_current_company)
):
    if not keyword or not keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword is required.")

    min_trust = minTrustScore if minTrustScore is not None else (min_trust_score or 0.0)
    conf = int(min_confidence or min_trust or 60)
    page_num = int(pageno or page or 1)

    return StreamingResponse(
        stream_discovery(
            keyword=keyword,
            country=country or "",
            city=city or "",
            min_trust=float(min_trust),
            min_confidence=conf,
            start_page=page_num,
            target_count=int(target_count or 10),
            max_pages=5,
            our_company=current_company.name,
            our_services=current_company.services or current_company.description or "B2B Products & Services",
            target_customers=current_company.target_customers or "",
            description=current_company.description or "",
            industry=current_company.industry or "",
            company_id=current_company.id
        ),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
    )

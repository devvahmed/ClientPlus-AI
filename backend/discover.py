import os
import re
import json
import time
import asyncio
import urllib.request
import urllib.parse
from typing import AsyncIterator, List, Optional, Dict
from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ─── Import helpers from email_outreach.py ───────────────────────────────────
from email_outreach import (
    fetch_url_content,
    compute_relevance_score,
    OUR_COMPANY_NAME,
    OUR_SERVICES,
    OUR_VALUE_PROP
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
    '/jobs/', '/careers/', '/hiring/', '/vacancy/'
]

# ─── In-Memory TTL Cache for LLM Fit Decisions ───────────────────────────────
_CACHE: Dict[str, dict] = {}
_CACHE_TTL = 3600  # 1 Hour TTL in seconds

def get_cached_evaluation(domain: str) -> Optional[dict]:
    domain = domain.lower().strip()
    if domain in _CACHE:
        entry = _CACHE[domain]
        if time.time() - entry['timestamp'] < _CACHE_TTL:
            return entry['data']
        else:
            del _CACHE[domain]
    return None

def set_cached_evaluation(domain: str, data: dict):
    domain = domain.lower().strip()
    _CACHE[domain] = {
        'timestamp': time.time(),
        'data': data
    }

class DiscoverRequest(BaseModel):
    keyword: str
    country: Optional[str] = ""
    city: Optional[str] = ""
    minTrustScore: Optional[float] = None
    min_trust_score: Optional[float] = None
    min_confidence: Optional[int] = None
    pageno: Optional[int] = 1
    page: Optional[int] = 1
    target_count: Optional[int] = 10
    reset_cursor: Optional[bool] = False
    clearCache: Optional[bool] = False
    our_company: Optional[str] = None
    our_services: Optional[str] = None

def clean_domain(url_str: str) -> str:
    try:
        if not url_str.startswith(('http://', 'https://')):
            url_str = 'https://' + url_str
        parsed = urllib.parse.urlparse(url_str)
        domain = parsed.hostname or ''
        return domain.lower().replace('www.', '')
    except Exception:
        return ''

def get_initials(name: str) -> str:
    words = [w for w in name.split() if w and w[0].isalnum()] if name else []
    if not words:
        return "CO"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[1][0]).upper()

async def search_searxng_or_ddg(query: str, page: int = 1) -> list:
    results = []
    searxng_url = os.getenv("SEARXNG_URL", "http://localhost:8085")

    # Try SearXNG first
    try:
        params = urllib.parse.urlencode({
            'q': query, 'format': 'json', 'pageno': page, 'language': 'en'
        })
        req = urllib.request.Request(
            f"{searxng_url}/search?{params}",
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                results = data.get('results', [])
    except Exception as e:
        print(f"[Discover Search] SearXNG unavailable ({e}) — switching to DDG fallback...")

    # Fallback to DuckDuckGo HTML POST
    if not results:
        loop = asyncio.get_event_loop()
        def _ddg_html_search():
            try:
                from bs4 import BeautifulSoup
                data = urllib.parse.urlencode({'q': query, 's': (page - 1) * 30}).encode('utf-8')
                req = urllib.request.Request(
                    'https://html.duckduckgo.com/html/',
                    data=data,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Referer': 'https://html.duckduckgo.com/'
                    }
                )
                with urllib.request.urlopen(req, timeout=6) as resp:
                    if resp.status == 200:
                        html = resp.read().decode('utf-8', errors='ignore')
                        soup = BeautifulSoup(html, 'html.parser')
                        ddg_results = []
                        for res in soup.select('div.result'):
                            a_tag = res.select_one('a.result__a')
                            if not a_tag or not a_tag.get('href'):
                                continue
                            raw_href = a_tag['href']
                            if 'uddg=' in raw_href:
                                raw_href = urllib.parse.unquote(raw_href.split('uddg=')[1].split('&')[0])
                            snippet_tag = res.select_one('a.result__snippet')
                            snippet_text = snippet_tag.get_text(strip=True) if snippet_tag else ''
                            ddg_results.append({
                                'url': raw_href,
                                'title': a_tag.get_text(strip=True),
                                'content': snippet_text
                            })
                        return ddg_results
            except Exception as ex:
                print(f"[Discover Search] DDG HTML search error: {ex}")
                return []
            return []
        results = await loop.run_in_executor(None, _ddg_html_search)

    return results

# ─── PRIMARY: Local Ollama LLM Fit Evaluator ─────────────────────────────────
async def call_ollama_fit_decision(
    company_name: str, domain: str, snippet: str, scraped_text: str,
    our_company: str, our_services: str, timeout: float = 7.0
) -> Optional[dict]:
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    model_name = os.getenv("OLLAMA_MODEL", "llama3.2")
    text_sample = (scraped_text or snippet)[:1500].strip()

    # Resolve installed model name to prevent 500 on missing model
    try:
        req = urllib.request.Request(f"{ollama_url.rstrip('/')}/api/tags")
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.status == 200:
                tags = json.loads(resp.read().decode('utf-8'))
                installed = [m["name"] for m in tags.get("models", [])]
                if installed:
                    if model_name not in installed:
                        if (model_name + ":latest") in installed:
                            model_name = model_name + ":latest"
                        else:
                            print(f"[Local Ollama LLM] Model '{model_name}' not found. Falling back to: '{installed[0]}'")
                            model_name = installed[0]
    except Exception as e:
        print(f"[Local Ollama LLM] Tags check failed: {e}")

    prompt = f"""System: You are an expert B2B sales intelligence analyst evaluating lead fit for {our_company}.
Our Company: {our_company}
Our Services & Product: {our_services}. {OUR_VALUE_PROP}

Candidate Prospect Company:
Name: {company_name}
Domain: {domain}
Website Snippet:
{text_sample}

Determine strictly if this prospect company is a realistic potential customer for {our_services}.
Reject (is_potential_client: false) if candidate is consumer-only (B2C), a news/blog outlet, job board, directory, or has no digital transformation/AI/software/automation needs.

Output JSON format strictly matching:
{{
  "is_potential_client": true/false,
  "confidence": number 0-100,
  "reason": "One clear sentence explaining WHY this company could become a customer of {our_services}, referencing what the company actually does."
}}"""

    payload = {
        "model": model_name, "prompt": prompt, "format": "json", "stream": False,
        "options": {"temperature": 0.2, "num_predict": 180}
    }

    loop = asyncio.get_event_loop()

    def _invoke():
        try:
            req_data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                f"{ollama_url.rstrip('/')}/api/generate",
                data=req_data, headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode('utf-8'))
                    response_str = body.get("response", "").strip()
                    parsed = json.loads(response_str)
                    parsed["source"] = "local-ollama"
                    return parsed
        except urllib.error.HTTPError as he:
            err_body = he.read().decode('utf-8', errors='ignore')
            print(f"[Local Ollama LLM] HTTP Error {he.code} for {domain}: {err_body}")
            return None
        except Exception as e:
            print(f"[Local Ollama LLM] Request failed for {domain} ({e})")
            return None

    try:
        return await loop.run_in_executor(None, _invoke)
    except Exception as e:
        print(f"[Local Ollama LLM] Executor error for {domain}: {e}")
        return None

# ─── EMERGENCY FALLBACK: Groq Cloud LLM ──────────────────────────────────────
async def evaluate_client_fit_groq(
    company_name: str, domain: str, snippet: str, scraped_text: str,
    our_company: str, our_services: str
) -> Optional[dict]:
    apiKey = os.getenv("GROQ_API_KEY")
    if not apiKey:
        print(f"[Groq Fallback] GROQ_API_KEY missing.")
        return None

    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    text_sample = (scraped_text or snippet)[:1500].strip()

    prompt = f"""You are an expert B2B sales intelligence analyst evaluating lead fit for {our_company}.
Our Company: {our_company}
Our Services & Product: {our_services}. {OUR_VALUE_PROP}

Candidate Prospect Company:
Name: {company_name}
Domain: {domain}
Website Content Snippet:
{text_sample}

Determine strictly if this prospect company is a realistic potential customer for {our_company}'s services.
Reject (is_potential_client: false) any candidate that is consumer-only (B2C), news outlet, directory, job board, or has no digital transformation/automation/software needs.

Return ONLY a single valid JSON object:
{{
  "is_potential_client": true or false,
  "confidence": integer between 0 and 100,
  "reason": "One clear sentence explaining WHY this company could become a customer of {our_services}, referencing what the company actually does."
}}"""

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
    our_company: str, our_services: str
) -> Optional[dict]:
    res = await call_ollama_fit_decision(
        company_name=company_name, domain=domain, snippet=snippet,
        scraped_text=scraped_text, our_company=our_company, our_services=our_services, timeout=7.0
    )
    if res and isinstance(res, dict) and "is_potential_client" in res:
        return res

    print(f"[LLM Dispatcher] Local Ollama failed for {domain} — initiating Groq emergency fallback...")
    return await evaluate_client_fit_groq(
        company_name=company_name, domain=domain, snippet=snippet,
        scraped_text=scraped_text, our_company=our_company, our_services=our_services
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
    our_company: Optional[str] = None,
    our_services: Optional[str] = None
) -> AsyncIterator[str]:
    """
    Async generator that yields NDJSON lines. Each qualified company is yielded
    immediately as it passes the LLM gate, without waiting for the full batch.
    Also yields progress events so the frontend can show a live counter.
    """
    clean_keyword = keyword.strip()
    clean_country = country.strip()
    clean_city = city.strip()
    company_name_context = our_company or OUR_COMPANY_NAME
    services_context = our_services or OUR_SERVICES

    effective_min_confidence = int(min_confidence or 60)
    if min_trust and min_trust > 0:
        effective_min_confidence = max(effective_min_confidence, int(min_trust))

    location_str = f"{clean_city}, {clean_country}".strip(", ")
    query_text = f"{clean_keyword} companies"
    if location_str:
        query_text += f" in {location_str}"

    # Yield a stream-start event so the frontend knows the stream opened
    yield json.dumps({"type": "start", "query": query_text, "target": target_count}) + "\n"

    print(f"\n==================== [DISCOVERY START] ====================")
    print(f"[Discover] Query: '{query_text}' | Start Page: {start_page} | Target: {target_count} | Max Pages: {max_pages} | Min Confidence: {effective_min_confidence}%")

    qualified_total = 0
    seen_domains: set = set()
    semaphore = asyncio.Semaphore(5)  # GPU concurrency cap
    total_ollama = 0
    total_groq = 0
    total_raw = 0
    total_noise_passed = 0
    total_tfidf_passed = 0

    for current_page in range(start_page, start_page + max_pages):
        if qualified_total >= target_count:
            break

        # ── Fetch one search page ─────────────────────────────────────────────
        raw_results = await search_searxng_or_ddg(query_text, page=current_page)
        total_raw += len(raw_results)

        if not raw_results:
            print(f"[Discover] Page {current_page} — zero results returned. Search exhausted.")
            break

        # ── Noise filter (domain-level dedup across all pages) ────────────────
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
        print(f"[Discover] Page {current_page} — {len(raw_results)} raw → {len(page_candidates)} passed noise filter → {qualified_total}/{target_count} qualified so far")

        # Emit page progress event
        yield json.dumps({
            "type": "page_start",
            "page": current_page,
            "raw": len(raw_results),
            "candidates": len(page_candidates),
            "qualified_so_far": qualified_total,
            "target": target_count
        }) + "\n"

        # ── TF-IDF pre-filter ─────────────────────────────────────────────────
        tfidf_passed = []
        for item in page_candidates:
            url = item.get('url', '')
            snippet = item.get('content', '') or item.get('snippet', '')
            domain = clean_domain(url)

            cached = get_cached_evaluation(domain)
            if cached:
                item["cached_evaluation"] = cached
                tfidf_passed.append(item)
                continue

            scraped_content = ""
            try:
                scraped_content = await fetch_url_content(url, timeout=2.5)
            except Exception:
                pass

            text_for_scoring = scraped_content or snippet or domain
            score = compute_relevance_score(text_for_scoring)
            if score < 0.05:
                print(f"[TF-IDF Filter] REJECTED {domain} — score {score:.3f}")
                continue

            item["scraped_content"] = scraped_content
            tfidf_passed.append(item)
            print(f"[TF-IDF Filter] PASSED {domain} — score {score:.3f}")

        total_tfidf_passed += len(tfidf_passed)

        # Cap LLM candidates per page at 20
        llm_candidates = tfidf_passed[:20]

        # ── Per-candidate evaluation + immediate streaming ────────────────────
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
                    print(f"[Cache Hit] {domain} from cache ({eval_res.get('source','cache')})")
                else:
                    scraped = item.get("scraped_content", "")
                    eval_res = await evaluate_client_fit_dual_engine(
                        company_name=company_name, domain=domain, snippet=snippet,
                        scraped_text=scraped, our_company=company_name_context, our_services=services_context
                    )

                if not eval_res or not isinstance(eval_res, dict):
                    print(f"[LLM Evaluator] EXCLUDED {domain} — both LLMs failed.")
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
                        "initials": get_initials(company_name),
                        "logoUrl": f"https://logo.clearbit.com/{domain}",
                        "email": f"info@{domain}",
                        "phone": None,
                        "linkedin": f"https://linkedin.com/company/{domain.split('.')[0]}",
                        "enriched": True,
                        "llmSource": source
                    }
                else:
                    print(f"[{source.upper()} LLM] REJECTED {domain} (is_client={is_client}, conf={confidence}%)")
                    return None

        # Run LLM evals concurrently for this page, but yield results as they come in
        tasks = [evaluate_and_emit(i, item) for i, item in enumerate(llm_candidates)]
        pending = {asyncio.ensure_future(t): t for t in tasks}
        futures = list(pending.keys())

        # Yield each result as it completes (real streaming)
        for coro in asyncio.as_completed(futures):
            try:
                result = await coro
                if result and isinstance(result, dict) and result.get("type") == "company":
                    yield json.dumps(result) + "\n"
                    # Check if target reached mid-page
                    if qualified_total >= target_count:
                        break
            except Exception as e:
                print(f"[Stream] Evaluation task error: {e}")

        # Emit page-end progress
        yield json.dumps({
            "type": "page_end",
            "page": current_page,
            "qualified_so_far": qualified_total,
            "target": target_count
        }) + "\n"

        if qualified_total >= target_count:
            break

    # Final summary log
    print(f"\n-------------------- [DISCOVERY SUMMARY] --------------------")
    print(f"Search Query            : {query_text}")
    print(f"Total Raw Candidates   : {total_raw}")
    print(f"Noise Filter Passed    : {total_noise_passed}")
    print(f"TF-IDF Pre-filter Passed: {total_tfidf_passed}")
    print(f"Local Ollama Evaluated : {total_ollama}")
    print(f"Groq Fallbacks Used    : {total_groq}")
    print(f"Final Count Returned   : {qualified_total}")
    print(f"==================== [DISCOVERY END] ====================\n")

    # Emit stream-end with final summary
    yield json.dumps({
        "type": "done",
        "total": qualified_total,
        "query": query_text,
        "message": (
            f"Found {qualified_total} strictly qualified companies for '{clean_keyword}'."
            if qualified_total > 0
            else f"No verified prospects found for '{clean_keyword}' at {effective_min_confidence}%+ confidence."
        )
    }) + "\n"

# ─── Streaming POST /discover-companies ──────────────────────────────────────
@discover_router.post("/discover-companies")
async def post_discover_companies(req: DiscoverRequest):
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
            our_company=req.our_company,
            our_services=req.our_services
        ),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
    )

# ─── Streaming GET /discover-companies ───────────────────────────────────────
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
        ),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
    )

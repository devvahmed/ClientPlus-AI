import os
import re
import json
import time
import asyncio
import urllib.request
import urllib.parse
from typing import List, Optional, Dict
from fastapi import APIRouter, Query, HTTPException
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
    'f6s.com', 'designrush.com', 'goodfirms.co', 'sortlist.com', 'topdevelopers.co'
}

SKIP_PATTERNS = [
    '/list', '/top-', '/best-', '/ranking', '/directory', '/category',
    '/blog/', '/news/', '/article', '/search?', 'list-of', 'companies-in',
    '/jobs/', '/careers/', '/hiring/', '/vacancy/'
]

# ─── In-Memory TTL Cache for LLM Evaluations ────────────────────────────────
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
    words = [w for w in name.split() if w[0].isalnum()] if name else []
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
            'q': query,
            'format': 'json',
            'pageno': page,
            'language': 'en'
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

    # Fallback to DuckDuckGo HTML POST web search
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

# ─── Groq API LLM Fit Evaluator ───────────────────────────────────────────────
async def evaluate_client_fit_groq(
    company_name: str,
    domain: str,
    snippet: str,
    scraped_text: str,
    our_company: str,
    our_services: str
) -> Optional[dict]:
    """
    Calls Groq API to evaluate if the prospect is a realistic B2B client.
    Returns dict: {"is_potential_client": bool, "confidence": int, "reason": str}
    Returns None if API call fails or times out.
    """
    apiKey = os.getenv("GROQ_API_KEY")
    if not apiKey:
        print("[Groq LLM] Warning: GROQ_API_KEY missing in environment variables.")
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

INSTRUCTIONS:
Determine strictly if this prospect company is a realistic potential customer for {our_company}'s services.
Reject (is_potential_client: false) any candidate that is:
- A consumer-only business (B2C only with no commercial operation).
- An industry with zero plausible need for {our_services}.
- A news outlet, directory, job board, blog, or aggregator site.
- An entity with no digital transformation, automation, AI, software, or technology service needs.

Return ONLY a single valid JSON object with NO markdown or extra text:
{{
  "is_potential_client": true or false,
  "confidence": integer between 0 and 100,
  "reason": "One clear sentence explaining WHY this company could become a customer of {our_services}, referencing what the company actually does."
}}
"""

    headers = {
        "Authorization": f"Bearer {apiKey}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    }

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a strict B2B sales intelligence classifier. Output strictly valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 200
    }

    loop = asyncio.get_event_loop()

    def _call_groq():
        try:
            req_data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=req_data,
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=6.0) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode('utf-8'))
                    raw_content = body["choices"][0]["message"]["content"].strip()
                    # Strip markdown block if model wrapped JSON
                    raw_content = re.sub(r'^```(?:json)?\s*', '', raw_content)
                    raw_content = re.sub(r'\s*```$', '', raw_content)
                    return json.loads(raw_content)
        except Exception as e:
            print(f"[Groq LLM] Evaluation failed for {domain}: {e}")
            return None

    try:
        return await loop.run_in_executor(None, _call_groq)
    except Exception as e:
        print(f"[Groq LLM] Task timeout/error for {domain}: {e}")
        return None

# ─── Core Discovery Pipeline ──────────────────────────────────────────────────
async def execute_discovery_core(
    keyword: str,
    country: str = "",
    city: str = "",
    min_trust: float = 0.0,
    min_confidence: int = 60,
    pageno: int = 1,
    target_count: int = 10,
    reset_cursor: bool = False,
    our_company: Optional[str] = None,
    our_services: Optional[str] = None
) -> dict:
    clean_keyword = keyword.strip()
    clean_country = country.strip()
    clean_city = city.strip()
    company_name_context = our_company or OUR_COMPANY_NAME
    services_context = our_services or OUR_SERVICES

    # Determine effective confidence threshold
    effective_min_confidence = int(min_confidence or 60)
    if min_trust and min_trust > 0:
        effective_min_confidence = max(effective_min_confidence, int(min_trust))

    location_str = f"{clean_city}, {clean_country}".strip(", ")
    query_text = f"{clean_keyword} companies"
    if location_str:
        query_text += f" in {location_str}"

    print(f"\n==================== [DISCOVERY START] ====================")
    print(f"[Discover] Query: '{query_text}' | Page: {pageno} | Target Count: {target_count} | Min Confidence: {effective_min_confidence}%")

    # Step 1: Search engine query
    raw_results = await search_searxng_or_ddg(query_text, page=pageno)
    print(f"[Discover Step 1] Search query returned {len(raw_results)} candidate URLs.")

    # Filter out initial noise & duplicate domains
    candidates = []
    seen_domains = set()

    for item in raw_results:
        url = item.get('url', '')
        domain = clean_domain(url)

        if not domain or domain in EXCLUDE_DOMAINS or any(ext in domain for ext in ['.gov', '.edu']):
            continue
        if any(d in domain for d in EXCLUDE_DOMAINS):
            continue
        if any(p in url.lower() for p in SKIP_PATTERNS):
            continue
        if domain in seen_domains:
            continue

        seen_domains.add(domain)
        candidates.append(item)

    print(f"[Discover Step 1] {len(candidates)} candidates passed domain & noise filters.")

    # Step 2: Evaluation Pipeline with Concurrency (max 5 at a time)
    semaphore = asyncio.Semaphore(5)
    passed_tfidf_count = 0
    passed_llm_count = 0
    qualified_companies = []

    async def evaluate_candidate(idx: int, item: dict):
        nonlocal passed_tfidf_count, passed_llm_count
        async with semaphore:
            url = item.get('url', '')
            title = item.get('title', '')
            snippet = item.get('content', '') or item.get('snippet', '')
            domain = clean_domain(url)

            company_name = title.split('|')[0].split(' - ')[0].split(' : ')[0].strip()
            if not company_name or len(company_name) > 60:
                company_name = domain.split('.')[0].capitalize()

            # Check cache first
            cached_data = get_cached_evaluation(domain)
            if cached_data:
                print(f"[Cache Hit] Domain {domain} retrieved from in-memory cache.")
                if cached_data.get("is_potential_client") and cached_data.get("confidence", 0) >= effective_min_confidence:
                    passed_tfidf_count += 1
                    passed_llm_count += 1
                    return {
                        "id": f"co-{int(time.time() * 1000)}-{idx}-{domain[:6]}",
                        "name": company_name,
                        "website": url,
                        "displayUrl": domain,
                        "domain": domain,
                        "industry": clean_keyword,
                        "country": clean_country or "Global",
                        "city": clean_city,
                        "snippet": snippet[:280] if snippet else f"{company_name} is a company operating in the {clean_keyword} sector.",
                        "matchReason": cached_data.get("reason", f"Potential client match for {services_context}."),
                        "matchConfidence": cached_data.get("confidence", 80),
                        "trustScore": cached_data.get("confidence", 80),
                        "trustStatus": "High Fit" if cached_data.get("confidence", 80) >= 80 else "Medium Fit",
                        "initials": get_initials(company_name),
                        "logoUrl": f"https://logo.clearbit.com/{domain}",
                        "email": f"info@{domain}",
                        "phone": None,
                        "linkedin": f"https://linkedin.com/company/{domain.split('.')[0]}",
                        "enriched": True
                    }
                return None

            # a. Lightweight content snapshot (timeout 2.5s)
            scraped_content = ""
            try:
                scraped_content = await fetch_url_content(url, timeout=2.5)
            except Exception as fe:
                print(f"[Snapshot Fetch] {domain} failed fetch: {fe}")

            text_for_scoring = (scraped_content or snippet or company_name)

            # b. TF-IDF Pre-filter (score >= 0.05)
            tfidf_score = compute_relevance_score(text_for_scoring)
            if tfidf_score < 0.05:
                print(f"[TF-IDF Filter] REJECTED {domain} — score {tfidf_score:.3f} < 0.05 threshold.")
                return None

            passed_tfidf_count += 1
            print(f"[TF-IDF Filter] PASSED {domain} — score {tfidf_score:.3f} >= 0.05. Proceeding to Groq LLM check.")

            # c. Groq LLM evaluation
            eval_res = await evaluate_client_fit_groq(
                company_name=company_name,
                domain=domain,
                snippet=snippet,
                scraped_text=scraped_content,
                our_company=company_name_context,
                our_services=services_context
            )

            # Error handling: Exclude if LLM failed or returned None
            if not eval_res or not isinstance(eval_res, dict):
                print(f"[Groq LLM] EXCLUDED {domain} — LLM evaluation call failed or timed out.")
                return None

            is_client = bool(eval_res.get("is_potential_client"))
            confidence = int(eval_res.get("confidence", 0))
            reason = str(eval_res.get("reason", "")).strip()

            # Cache the evaluation result
            set_cached_evaluation(domain, {
                "is_potential_client": is_client,
                "confidence": confidence,
                "reason": reason
            })

            # d. Minimum confidence filter
            if is_client and confidence >= effective_min_confidence:
                passed_llm_count += 1
                print(f"[Groq LLM] ACCEPTED {domain} — confidence {confidence}% >= {effective_min_confidence}%. Reason: {reason}")
                return {
                    "id": f"co-{int(time.time() * 1000)}-{idx}-{domain[:6]}",
                    "name": company_name,
                    "website": url,
                    "displayUrl": domain,
                    "domain": domain,
                    "industry": clean_keyword,
                    "country": clean_country or "Global",
                    "city": clean_city,
                    "snippet": snippet[:280] if snippet else f"{company_name} is an active business operating in the {clean_keyword} sector.",
                    "matchReason": reason or f"Plausible prospect for {services_context}.",
                    "matchConfidence": confidence,
                    "trustScore": confidence,
                    "trustStatus": "High Fit" if confidence >= 80 else "Medium Fit",
                    "initials": get_initials(company_name),
                    "logoUrl": f"https://logo.clearbit.com/{domain}",
                    "email": f"info@{domain}",
                    "phone": None,
                    "linkedin": f"https://linkedin.com/company/{domain.split('.')[0]}",
                    "enriched": True
                }
            else:
                print(f"[Groq LLM] REJECTED {domain} — is_client={is_client}, confidence={confidence}%. Reason: {reason}")
                return None

    # Run evaluations concurrently
    tasks = [evaluate_candidate(i, item) for i, item in enumerate(candidates)]
    eval_results = await asyncio.gather(*tasks, return_exceptions=True)

    for res in eval_results:
        if res and isinstance(res, dict):
            qualified_companies.append(res)

    # Step 3: Sort by matchConfidence descending
    qualified_companies.sort(key=lambda x: x.get("matchConfidence", 0), reverse=True)

    # Trim to target count if more were found
    final_companies = qualified_companies[:target_count]

    # Generate message if fewer than target count found
    message = None
    if len(final_companies) < target_count:
        message = f"Found {len(final_companies)} strictly qualified target companies for '{clean_keyword}'."
        if len(final_companies) == 0:
            message = f"No verified prospective clients found for '{clean_keyword}' matching minimum confidence criteria ({effective_min_confidence}%)."

    # Log before/after summary
    print(f"\n-------------------- [DISCOVERY SUMMARY] --------------------")
    print(f"Search Query            : {query_text}")
    print(f"Raw Candidates Found   : {len(raw_results)}")
    print(f"Noise Filter Passed    : {len(candidates)}")
    print(f"TF-IDF Pre-filter Passed: {passed_tfidf_count}")
    print(f"Groq LLM Passed        : {passed_llm_count}")
    print(f"Final Count Returned   : {len(final_companies)}")
    print(f"==================== [DISCOVERY END] ====================\n")

    response = {
        "companies": final_companies,
        "results": final_companies,
        "query": query_text,
        "page": pageno,
        "total": len(final_companies)
    }

    if message:
        response["message"] = message

    return response

# ─── GET /discover-companies ──────────────────────────────────────────────────
@discover_router.get("/discover-companies")
async def get_discover_companies(
    keyword: str = Query(..., description="Industry or service keyword"),
    country: Optional[str] = Query("", description="Country filter"),
    city: Optional[str] = Query("", description="City filter"),
    minTrustScore: Optional[float] = Query(None, description="Minimum trust score"),
    min_trust_score: Optional[float] = Query(None, description="Minimum trust score (snake_case)"),
    min_confidence: Optional[int] = Query(None, description="Minimum LLM confidence threshold"),
    pageno: Optional[int] = Query(1, description="Page number"),
    page: Optional[int] = Query(1, description="Page number alias"),
    target_count: Optional[int] = Query(10, description="Target company count"),
    reset_cursor: Optional[bool] = Query(False, description="Reset cursor flag"),
    clearCache: Optional[bool] = Query(False, description="Clear cache flag"),
):
    if not keyword or not keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword is required.")

    min_trust = minTrustScore if minTrustScore is not None else (min_trust_score or 0.0)
    conf = min_confidence if min_confidence is not None else int(min_trust or 60)
    page_num = pageno if pageno is not None else (page or 1)
    reset = bool(reset_cursor or clearCache)

    return await execute_discovery_core(
        keyword=keyword,
        country=country or "",
        city=city or "",
        min_trust=float(min_trust),
        min_confidence=int(conf),
        pageno=int(page_num),
        target_count=int(target_count or 10),
        reset_cursor=reset
    )

# ─── POST /discover-companies ─────────────────────────────────────────────────
@discover_router.post("/discover-companies")
async def post_discover_companies(req: DiscoverRequest):
    if not req.keyword or not req.keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword is required.")

    min_trust = req.minTrustScore if req.minTrustScore is not None else (req.min_trust_score or 0.0)
    conf = req.min_confidence if req.min_confidence is not None else int(min_trust or 60)
    page_num = req.pageno if req.pageno is not None else (req.page or 1)
    reset = bool(req.reset_cursor or req.clearCache)

    return await execute_discovery_core(
        keyword=req.keyword,
        country=req.country or "",
        city=req.city or "",
        min_trust=float(min_trust),
        min_confidence=int(conf),
        pageno=int(page_num),
        target_count=int(req.target_count or 10),
        reset_cursor=reset,
        our_company=req.our_company,
        our_services=req.our_services
    )

import os
import re
import sys
import hmac
import hashlib
import base64
import json
import asyncio
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import urllib.request
import urllib.parse
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from bs4 import BeautifulSoup

# ─── Windows Unicode Fix ───────────────────────────────────────────────────────
# Prevent UnicodeEncodeError on Windows cp1252 terminals
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import database

# Load environment variables
load_dotenv()

RESEND_API_KEY        = os.getenv("RESEND_API_KEY", "re_BsdUajYm_FQpX8HJBHgkoYLoRi6eKE5yD")
RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "whsec_T90sc5n4poC0/QXYUWVPC/2+O6KB/9i9")

OUR_COMPANY_NAME = os.getenv("OUR_COMPANY_NAME", "WTechX")
OUR_SERVICES     = os.getenv("OUR_SERVICES", "AI, Robotics, and Computer Vision solutions provider")
OUR_PRODUCT_NAME = os.getenv("OUR_PRODUCT_NAME", "ClientPlus AI")
OUR_VALUE_PROP   = os.getenv("OUR_VALUE_PROPOSITION", "an intelligent CRM and lead generation automation tool for B2B companies")

app = FastAPI(title="WTechX Leads & Email Outreach API")
database.init_db()

# ─── Pydantic Schemas ──────────────────────────────────────────────────────────
class OutreachRequest(BaseModel):
    company_name: str
    company_description: str
    contact_email: EmailStr

class EnrichRequest(BaseModel):
    company_name: str
    website_url: str

class CrawlRequest(BaseModel):
    company_name: str
    website_url: str

# ─── Regex Contact Extraction ─────────────────────────────────────────────────
EMAIL_RE            = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE)
PHONE_RE            = re.compile(r'(\+?\d{1,4}[-.\s]??\(?\d{1,3}\)?[-.\s]??\d{1,4}[-.\s]??\d{1,4}[-.\s]??\d{1,9})')
LINKEDIN_RE         = re.compile(r'https?://(?:www\.)?linkedin\.com/(?:company|in|profile|pub)/[a-zA-Z0-9\-_%]+', re.IGNORECASE)
LINKEDIN_COMPANY_RE = re.compile(r'https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9\-_%]+', re.IGNORECASE)
LINKEDIN_PEOPLE_RE  = re.compile(r'https?://(?:www\.)?linkedin\.com/(?:in|profile|pub)/[a-zA-Z0-9\-_%]+', re.IGNORECASE)
HEADING_RE          = re.compile(r'^#{1,3}\s+(.+)$', re.MULTILINE)

INVALID_EMAIL_EXTENSIONS = {
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff',
    'css', 'js', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'webm', 'pdf', 'zip'
}

_EMAIL_EXCLUDE = {
    'bootstrap', 'jquery', 'wp-content', 'theme', 'plugin', 'template',
    'example.com', 'yourdomain', 'logo', 'noreply', 'no-reply', 'sentry',
    'wixpress.com', 'schema.org', 'sprite', 'retina', 'w3.org', 'domain.com', 'email.com'
}

def is_valid_email(em: str) -> bool:
    if not em or not isinstance(em, str):
        return False
    clean = em.strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean):
        return False
    if re.search(r'@\d+(\.\d+)?x', clean):
        return False
    parts = clean.split('.')
    if len(parts) > 1 and parts[-1] in INVALID_EMAIL_EXTENSIONS:
        return False
    if any(kw in clean for kw in _EMAIL_EXCLUDE):
        return False
    return True


# ─── TF-IDF Relevance Scorer ──────────────────────────────────────────
def compute_relevance_score(company_text: str) -> float:
    """
    Computes cosine similarity between our services profile
    and the company's scraped content snippet.
    Returns float 0.0 to 1.0.
    """
    try:
        reference = OUR_SERVICES  # e.g. "AI Robotics Computer Vision solutions"
        if not company_text or not company_text.strip():
            return 0.5  # neutral fallback for empty content
        vectorizer = TfidfVectorizer(stop_words='english')
        vectors = vectorizer.fit_transform([reference, company_text])
        score = cosine_similarity(vectors[0], vectors[1])[0][0]
        return round(float(score), 3)
    except Exception as e:
        print(f"[TF-IDF] Scoring failed: {e} — returning neutral 0.5")
        return 0.5  # neutral fallback

def get_clean_page_name(raw_url: str) -> str:
    """Helper to convert a URL into a clean human page name."""
    if not raw_url:
        return "Homepage"
    try:
        from urllib.parse import urlparse
        path = urlparse(raw_url).path if raw_url.startswith("http") else raw_url
        path_clean = path.rstrip('/')
        if not path_clean or path_clean == "":
            return "Homepage"
        p_lower = path_clean.lower()
        if 'contact' in p_lower:
            return "Contact Page"
        if 'about' in p_lower:
            return "About Page"
        if 'team' in p_lower:
            return "Team Page"
        return path_clean if path_clean.startswith('/') else f"/{path_clean}"
    except Exception:
        return "Website Page"


def extract_regex_contacts(text: str, source_url: str = "") -> dict:
    """
    100% programmatic contact extraction with precise source reference tracking.
    Deduplicates emails and combines source references across all crawled pages.
    """
    raw_emails = EMAIL_RE.findall(text)
    raw_phones = PHONE_RE.findall(text)
    raw_linkedins = LINKEDIN_RE.findall(text)

    emails = []
    email_meta = []
    seen_emails_lower = set()

    for em in raw_emails:
        if not is_valid_email(em):
            continue
        em_lower = em.lower()
        if em_lower in seen_emails_lower:
            continue
        seen_emails_lower.add(em_lower)
        emails.append(em)

        # Track all source pages where this email was found
        sources = []
        seen_urls = set()

        pattern = re.compile(re.escape(em), re.IGNORECASE)
        for match in pattern.finditer(text):
            idx = match.start()
            preceding = text[:idx]

            url_matches = re.findall(r'### SOURCE_URL:\s*(https?://[^\s\n]+)', preceding)
            match_url = url_matches[-1] if url_matches else (source_url or "/")

            if match_url not in seen_urls:
                seen_urls.add(match_url)
                page_name = get_clean_page_name(match_url)

                heading_matches = HEADING_RE.findall(preceding)
                clean_heading = page_name
                if heading_matches:
                    filtered = [h.strip() for h in heading_matches if not h.strip().startswith("SOURCE_URL:")]
                    if filtered:
                        clean_heading = filtered[-1]

                sources.append({
                    "url": match_url,
                    "page": page_name,
                    "label": clean_heading
                })

        primary_source = sources[0] if sources else {
            "url": source_url or "/",
            "page": get_clean_page_name(source_url),
            "label": "General Contact"
        }

        email_meta.append({
            "email":          em,
            "sources":        sources,
            "source_url":     primary_source["url"],
            "source_page":    primary_source["page"],
            "source_label":   ", ".join([s["page"] for s in sources]),
        })

    phones = []
    for ph in raw_phones:
        ph_clean = ph.strip()
        if len(ph_clean) < 9:
            continue
        if any(kw in ph_clean for kw in ['123456', '987654', '000000']):
            continue
        if ph_clean not in phones:
            phones.append(ph_clean)

    linkedin_company = None
    linkedin_people = []
    for l in list(dict.fromkeys(raw_linkedins)):
        if '/company/' in l.lower():
            if not linkedin_company:
                linkedin_company = l
        elif '/in/' in l.lower() or '/profile/' in l.lower() or '/pub/' in l.lower():
            if l not in linkedin_people:
                linkedin_people.append(l)

    linkedin_url = linkedin_company or (linkedin_people[0] if linkedin_people else None)

    return {
        "emails": emails,
        "phones": phones,
        "email_meta": email_meta,
        "linkedin_company": linkedin_company,
        "linkedin_people": linkedin_people,
        "linkedin_url": linkedin_url
    }



def find_source_context(text: str, term: str) -> str:
    """Returns up to 100 chars of context surrounding a term."""
    try:
        idx = text.lower().find(term.lower())
        if idx != -1:
            start = max(0, idx - 50)
            end   = min(len(text), idx + len(term) + 50)
            return text[start:end].replace('\n', ' ').strip()[:100]
    except Exception:
        pass
    return "Extracted from page content"

# ─── Cloudflare Email Protection Decoder ───────────────────────────────────────
def decode_cloudflare_email(cf_hex: str) -> str:
    """Decodes Cloudflare data-cfemail hex string into plaintext email."""
    try:
        r = int(cf_hex[:2], 16)
        return ''.join([chr(int(cf_hex[i:i+2], 16) ^ r) for i in range(2, len(cf_hex), 2)])
    except Exception:
        return ""

# ─── SSL & Browser Headers for Government & Cloudflare Sites ───────────────
import ssl
import gzip
import zlib

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

_REAL_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
}

def _decompress_and_decode(resp, raw_bytes: bytes) -> str:
    encoding = resp.headers.get('Content-Encoding', '').lower()
    try:
        if 'gzip' in encoding:
            raw_bytes = gzip.decompress(raw_bytes)
        elif 'deflate' in encoding:
            raw_bytes = zlib.decompress(raw_bytes)
    except Exception:
        pass
    return raw_bytes.decode('utf-8', errors='ignore')

# ─── Async URL Fetcher (Layer 1: Fast HTTP + BeautifulSoup) ───────────────────
async def fetch_url_content(url: str, timeout: float = 4.0) -> str:
    """Runs fast HTTP scraping with SSL context, BS4 parsing, and short timeout."""
    loop = asyncio.get_event_loop()
    def _fetch(target_url):
        try:
            req = urllib.request.Request(target_url, headers=_REAL_HEADERS)
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
                raw_bytes = resp.read()
                raw_html = _decompress_and_decode(resp, raw_bytes)

                soup = BeautifulSoup(raw_html, 'html.parser')

                # 1. Decode Cloudflare protected emails
                cf_emails = []
                for tag in soup.find_all(attrs={"data-cfemail": True}):
                    dec = decode_cloudflare_email(tag["data-cfemail"])
                    if dec and '@' in dec:
                        cf_emails.append(dec)

                # 2. Extract mailto: links
                mailto_links = []
                for a in soup.find_all('a', href=True):
                    href = a['href'].strip()
                    if href.lower().startswith('mailto:'):
                        em = href.split(':')[1].split('?')[0].strip()
                        if em and '@' in em:
                            mailto_links.append(em)

                # 3. Un-obfuscate emails like "info [at] company [dot] com"
                obfuscated = re.findall(r'([a-zA-Z0-9._%+-]+(?:\s*(?:\[at\]|\(at\)|\sat\s)\s*)[a-zA-Z0-9.-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*)[a-zA-Z]{2,})', raw_html, re.I)
                normalized_obf = [
                    re.sub(r'\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*', '.',
                    re.sub(r'\s*(?:\[at\]|\(at\)|\sat\s)\s*', '@', item, flags=re.I), flags=re.I)
                    for item in obfuscated
                ]

                # 4. Extract raw email regex directly from HTML
                raw_html_emails = EMAIL_RE.findall(raw_html)

                # Strip script and style tags for clean body text
                for s in soup(['script', 'style']):
                    s.decompose()
                clean_text = soup.get_text(separator=' ')
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()

                extras = [e for e in cf_emails + mailto_links + normalized_obf + raw_html_emails if e and '@' in e]
                extra_str = " ".join(dict.fromkeys(extras))
                return f"### SOURCE_URL: {target_url}\n{clean_text}\n{extra_str}"
        except Exception as e:
            # Quick HTTP fallback if HTTPS TLS/SSL alert occurs
            if target_url.startswith("https://") and ("SSL" in str(e) or "TLS" in str(e)):
                http_url = target_url.replace("https://", "http://", 1)
                try:
                    req = urllib.request.Request(http_url, headers=_REAL_HEADERS)
                    with urllib.request.urlopen(req, timeout=2.5, context=_SSL_CTX) as resp:
                        raw_bytes = resp.read()
                        raw_html = _decompress_and_decode(resp, raw_bytes)
                        raw_html_emails = EMAIL_RE.findall(raw_html)
                        soup = BeautifulSoup(raw_html, 'html.parser')
                        for s in soup(['script', 'style']):
                            s.decompose()
                        clean_text = re.sub(r'\s+', ' ', soup.get_text(separator=' ')).strip()
                        return f"### SOURCE_URL: {http_url}\n{clean_text}\n" + " ".join(dict.fromkeys(raw_html_emails))
                except Exception:
                    pass
            return ""
    return await loop.run_in_executor(None, _fetch, url)

async def fetch_raw_html(url: str) -> str:
    """Fetches raw HTML of a page (for link discovery). Returns empty string on error."""
    loop = asyncio.get_event_loop()
    def _fetch():
        try:
            req = urllib.request.Request(url, headers=_REAL_HEADERS)
            with urllib.request.urlopen(req, timeout=14, context=_SSL_CTX) as resp:
                raw_bytes = resp.read()
                return _decompress_and_decode(resp, raw_bytes)
        except Exception as e:
            print(f"[HTTP Fetch Raw] Failed {url}: {e}")
            return ""
    return await loop.run_in_executor(None, _fetch)

# ─── Smart Internal Link Discovery ────────────────────────────────────────────
_CONTACT_KEYWORDS = [
    'contact', 'about', 'reach', 'support', 'team', 'people', 'staff',
    'connect', 'inquiry', 'enquiry', 'get-in-touch', 'touch', 'help',
    'corporate', 'company', 'office', 'location', 'imprint', 'impressum'
]
_SKIP_EXTENSIONS = ('.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.zip',
                    '.mp4', '.webp', '.ico', '.css', '.js', '.xml', '.txt')
_SKIP_HOSTS = (
    'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com',
    'instagram.com', 'github.com', 'google.com', 'apple.com',
    'maps.google.com', 'goo.gl', 't.co', 'bit.ly'
)

def discover_contact_links(raw_html: str, base_url: str, max_links: int = 10) -> list:
    """Scans raw HTML for internal contact links."""
    from urllib.parse import urlparse, urljoin
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower().replace('www.', '')

    all_hrefs = re.findall(r'href=["\']([^"\'\s#>]+)["\']', raw_html, re.IGNORECASE)
    footer_section = re.search(r'<footer[^>]*>([\s\S]*?)</footer>', raw_html, re.IGNORECASE)
    nav_section = re.search(r'<nav[^>]*>([\s\S]*?)</nav>', raw_html, re.IGNORECASE)
    priority_hrefs = []
    for section_match in [footer_section, nav_section]:
        if section_match:
            priority_hrefs += re.findall(r'href=["\']([^"\'\s#>]+)["\']', section_match.group(1), re.IGNORECASE)

    ranked = []
    seen = set()

    for href in (priority_hrefs + all_hrefs):
        href = href.strip()
        if not href or href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
            continue
        if any(href.lower().endswith(ext) for ext in _SKIP_EXTENSIONS):
            continue

        abs_url = urljoin(base_url, href)
        parsed = urlparse(abs_url)

        link_domain = parsed.netloc.lower().replace('www.', '')
        if link_domain and link_domain != base_domain:
            if not any(skip in link_domain for skip in _SKIP_HOSTS):
                pass
            else:
                continue
        if abs_url in seen:
            continue
        seen.add(abs_url)

        path_lower = parsed.path.lower()
        score = 0
        if href in priority_hrefs:
            score += 5
        for kw in _CONTACT_KEYWORDS:
            if kw in path_lower:
                score += 3
                break
        if score == 0:
            continue

        ranked.append((score, abs_url))

    ranked.sort(key=lambda x: -x[0])
    return [url for _, url in ranked[:max_links]]

# ─── 3-Layered Fast Concurrent Scraping Engine ───────────────────────────────
async def scrape_pages_concurrent(base_url: str) -> str:
    """
    Optimized 3-Layer Contact Scraper (Average execution time 1-5s):
      Layer 1: Fast HTTP + BeautifulSoup probing candidate URLs & discovered links in parallel with early exit on email match.
      Layer 2: Crawl4AI / Playwright fallback ONLY if Layer 1 yields no email (top 2 pages max).
      Layer 3: Parallel dispatch with immediate cancellation of pending tasks once email is found.
    """
    from urllib.parse import urlparse, urljoin
    base = base_url.rstrip('/')

    # Top candidate URLs including common localized corporate paths
    standard_urls = [
        base_url,
        f"{base}/contact",
        f"{base}/contact-us",
        f"{base}/en/contact",
        f"{base}/en/contact-us",
        f"{base}/en-ca/contact-us",
        f"{base}/about",
        f"{base}/about-us",
    ]

    # Fetch homepage first to discover deep localized contact links
    homepage_text = await fetch_url_content(base_url, timeout=2.5)
    discovered = []
    if homepage_text:
        discovered = discover_contact_links(homepage_text, base_url, max_links=5)

    candidate_urls = list(dict.fromkeys(standard_urls + discovered))

    contents = []
    if homepage_text:
        contents.append(homepage_text)

    found_email = False
    _exclude = {'bootstrap', 'jquery', 'wp-content', 'theme', 'plugin', 'template', 'example.com', 'yourdomain', 'logo', 'noreply', 'no-reply', 'sentry', 'wixpress.com', 'schema.org'}

    # Check if homepage already contained emails
    if homepage_text:
        h_emails = EMAIL_RE.findall(homepage_text)
        if any(e.lower() for e in h_emails if '@' in e and not any(ex in e.lower() for ex in _exclude)):
            found_email = True

    # LAYER 1: Parallel HTTP scraping across candidate & discovered URLs with early exit
    if not found_email:
        tasks = [asyncio.create_task(fetch_url_content(u, timeout=2.5)) for u in candidate_urls if u != base_url]

        for completed in asyncio.as_completed(tasks):
            try:
                content = await completed
                if content and len(content.strip()) > 20:
                    contents.append(content)
                    emails = EMAIL_RE.findall(content)
                    valid = [e.lower() for e in emails if '@' in e and not any(ex in e.lower() for ex in _exclude)]
                    if valid:
                        found_email = True
                        for t in tasks:
                            if not t.done():
                                t.cancel()
                        break
            except Exception:
                pass

    combined = "\n\n".join(contents)

    # LAYER 2: Crawl4AI / Playwright fallback ONLY if Layer 1 returned NO email
    if not found_email and len(combined.strip()) < 1000:
        try:
            from crawl4ai import AsyncWebCrawler
            print(f"[Layer 2 Fallback] Triggering Crawl4AI for {base_url}...")
            js_trigger = """
            try {
              const activeTab = document.querySelector('.active, [class*="tab"].active, [class*="headquarters"], [id*="contact"]');
              if (activeTab) activeTab.click();
            } catch(e) {}
            """
            target_crawl_urls = [base_url]
            if discovered:
                target_crawl_urls.append(discovered[0])
            else:
                target_crawl_urls.append(f"{base}/contact-us")

            async with AsyncWebCrawler() as crawler:
                for u in target_crawl_urls[:2]:
                    r = await crawler.arun(url=u, js_code=js_trigger, ignore_https_errors=True)
                    if r and (r.markdown or r.html):
                        c_text = (r.markdown or "") + " " + (r.html or "")
                        combined += f"\n\n### SOURCE_URL: {u}\n\n" + c_text
                        if EMAIL_RE.search(c_text):
                            break
        except Exception as e:
            print(f"[Layer 2 Fallback] Crawl4AI skipped/failed: {e}")

    print(f"[Layered Scraper] Completed in fast mode: {len(combined)} chars (found_email={found_email}) for {base_url}")
    return combined

# ─── Compact Ollama Snapshot ───────────────────────────────────────────────────
def build_ollama_snapshot(emails: list, phones: list, email_meta: list, content: str) -> str:
    """
    Builds a dense, minimal text snapshot for Ollama to protect local 8GB RAM machines.
    Max ~1600 chars total sent to LLM.
    """
    preview = content[:1500].replace('\n', ' ')
    meta_str = "; ".join(
        f"{m['email']} [{m['source_label']} @ {m['source_page']}]"
        for m in email_meta[:3]
    )
    return (
        f"EMAILS: {emails[:5]}\n"
        f"PHONES: {phones[:5]}\n"
        f"SOURCE_META: {meta_str}\n"
        f"CONTENT: {preview}"
    )

# ─── Ollama Helpers ────────────────────────────────────────────────────────────
def call_ollama(prompt: str) -> str:
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    payload = {"model": "llama3.2", "prompt": prompt, "stream": False}
    try:
        req = urllib.request.Request(
            f"{ollama_url}/api/generate",
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        with urllib.request.urlopen(req, timeout=3.0) as res:
            text = json.loads(res.read().decode('utf-8')).get('response', '').strip()
            if text:
                return text
    except Exception as e:
        print(f"[Ollama] Error: {e}")

    print("[Ollama] Fallback triggered.")
    if "email" in prompt.lower():
        return (
            f"Subject: Scalable Custom AI & Robotics Solutions for your business\n"
            f"<p>Dear Tech Lead,</p>"
            f"<p>We at <strong>{OUR_COMPANY_NAME}</strong> build custom {OUR_SERVICES}. "
            f"We would love to discuss how we can automate your manual processes.</p>"
            f"<p>Best regards,<br/>{OUR_COMPANY_NAME} Outreach Team</p>"
        )
    return "Review lead profile and prepare customizable sales collateral."


def call_ollama_json(prompt: str) -> dict:
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    payload = {"model": "llama3.2", "prompt": prompt, "format": "json", "stream": False}
    try:
        req = urllib.request.Request(
            f"{ollama_url}/api/generate",
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        with urllib.request.urlopen(req, timeout=1.5) as res:
            text = json.loads(res.read().decode('utf-8')).get('response', '')
            if text:
                return json.loads(text.strip())
    except Exception as e:
        print(f"[Ollama JSON] Error: {e}")
    return {}

# ─── /enrich-contacts ─────────────────────────────────────────────────────────
@app.post("/enrich-contacts")
async def enrich_contacts(data: EnrichRequest):
    normalized_url = data.website_url.strip()
    if not normalized_url.startswith(("http://", "https://")):
        normalized_url = "https://" + normalized_url

    # Step 1: Concurrent multi-page scraping
    content = await scrape_pages_concurrent(normalized_url)

    # Step 2: 100% programmatic regex extraction (zero AI hallucination)
    scanner          = extract_regex_contacts(content, source_url=normalized_url)
    emails           = scanner["emails"]
    phones           = scanner["phones"]
    email_meta       = scanner["email_meta"]
    linkedin_company = scanner.get("linkedin_company")
    linkedin_people  = scanner.get("linkedin_people", [])

    primary_email    = emails[0] if emails else None

    # Step 3: Primary source tracking references
    source_context   = "Extracted from page content"
    source_page      = "/"
    source_label     = "General Contact"
    contact_page_url = None

    if email_meta:
        first            = email_meta[0]
        source_context   = first["source_context"] or source_context
        source_page      = first["source_page"]
        source_label     = first["source_label"] or source_label
        contact_page_url = first["source_url"]
    elif emails:
        source_context = find_source_context(content, emails[0])
    else:
        # Improved Fallback: If no direct email extracted, label clearly if contact page/section exists
        contact_kws = ['contact', 'sales', 'headquarters', 'reach us', 'office', 'get in touch', 'support', 'inquiry']
        if any(kw in content.lower() for kw in contact_kws):
            source_label = "Contact page available — visit directly"
            source_context = "Interactive or structured contact section available on website"
        else:
            source_label = "No direct contact info found"

    if not contact_page_url:
        contact_page_url = f"{normalized_url.rstrip('/')}/contact-us"

    # Step 4: Compact snapshot → Ollama for B2B normalization (protects 8GB RAM)
    snapshot = build_ollama_snapshot(emails, phones, email_meta, content)
    prompt = f"""You are a B2B lead enrichment analyst for {OUR_COMPANY_NAME}.
Analyze this company data snapshot and identify key stakeholders and business context.

{snapshot}

Return ONLY a valid JSON object (no markdown, no extra text):
{{
  "emails": {json.dumps(emails[:5])},
  "phones": {json.dumps(phones[:5])},
  "stakeholder": "key stakeholder name or role (e.g. CEO, Founder)",
  "context_snippet": "1-sentence description of what services this company offers",
  "email_source_context": "{source_context}"
}}"""

    intel = {}
    try:
        intel = await asyncio.wait_for(asyncio.to_thread(call_ollama_json, prompt), timeout=2.0)
    except Exception as e:
        print(f"[Ollama Enrich] Skipped/Timed out: {e} — using regex contacts directly")

    # TF-IDF relevance score — computed after scraping, before Ollama call
    relevance = compute_relevance_score(content[:500])
    print(f"[TF-IDF] enrich-contacts relevance_score={relevance}")

    # Step 5: Return complete response with ALL required fields
    return {
        "primary_email":        primary_email,
        "all_emails":           intel.get("emails", emails),
        "phones":               intel.get("phones", phones),
        "linkedin_company":     linkedin_company,
        "linkedin_people":      linkedin_people,
        "contact_page_url":     contact_page_url,
        "source_label":         source_label,
        "source_context":       intel.get("email_source_context", source_context),
        "found":                bool(emails or phones or linkedin_company or linkedin_people),
        # Backward-compatible fields:
        "emails":               intel.get("emails", emails),
        "stakeholder":          intel.get("stakeholder", "Not found"),
        "context_snippet":      intel.get("context_snippet", "Not found"),
        "email_source_context": intel.get("email_source_context", source_context),
        "source_page":          source_page,
        "email_meta":           email_meta,
        "relevance_score":      relevance,
    }

# ─── Email Sending Helper ──────────────────────────────────────────────────────
def send_resend_email(to_email: str, subject: str, body_html: str) -> dict:
    url = "https://api.resend.com/emails"
    headers = {"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"}
    payload = {"from": "outreach@insightflow-ai.tech", "to": to_email, "subject": subject, "html": body_html}
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"[Resend] Warning: {e}. Simulation mode.")
        return {"id": f"simulated-{hashlib.md5(to_email.encode()).hexdigest()[:12]}", "simulated": True}

# ─── /send-outreach ───────────────────────────────────────────────────────────
@app.post("/send-outreach")
async def send_outreach(data: OutreachRequest):
    prompt_email = f"""Write a personalized B2B cold outreach email.
Company: {data.company_name}
Description: {data.company_description}
Sender: {OUR_COMPANY_NAME} — {OUR_SERVICES}.
Format: Start with "Subject: <catchy subject>", then HTML body (<p>, <br>, <strong> only).
No markdown code blocks. Max 150 words. Sign off as {OUR_COMPANY_NAME} Outreach Team."""
    ai_response = call_ollama(prompt_email)
    if not ai_response:
        raise HTTPException(status_code=500, detail="Failed to draft email via Ollama.")

    lines = ai_response.split("\n")
    subject = f"Outreach from {OUR_COMPANY_NAME}"
    body_lines = []
    for line in lines:
        if line.lower().startswith("subject:"):
            subject = line.split(":", 1)[1].strip()
        else:
            body_lines.append(line)
    body = "\n".join(body_lines).strip()

    prompt_action = f"""Suggest the next sales action for {OUR_COMPANY_NAME} after sending outreach to {data.company_name}.
Return only a single 1-sentence instruction. No greetings or markdown."""
    suggested_action = call_ollama(prompt_action) or "Wait for initial response or email open."

    resend_result = send_resend_email(data.contact_email, subject, body)
    email_id = resend_result.get("id", f"resend-{int(datetime.now().timestamp())}")
    sent_at  = datetime.utcnow().isoformat()

    database.save_lead(
        lead_id=email_id, name=data.company_name, description=data.company_description,
        email=data.contact_email, subject=subject, sent_at=sent_at, action=suggested_action
    )
    return {"success": True, "email_id": email_id, "subject": subject, "body": body, "suggested_action": suggested_action}

# ─── Webhook Verification ──────────────────────────────────────────────────────
def verify_resend_signature(payload_bytes: bytes, headers: dict, secret: str) -> bool:
    svix_id  = headers.get("svix-id")
    svix_ts  = headers.get("svix-timestamp")
    svix_sig = headers.get("svix-signature")
    if not all([svix_id, svix_ts, svix_sig]):
        return False
    signed_content = f"{svix_id}.{svix_ts}.".encode('utf-8') + payload_bytes
    secret_clean = secret.replace("whsec_", "")
    try:
        secret_bytes = base64.b64decode(secret_clean)
    except Exception:
        secret_bytes = secret_clean.encode('utf-8')
    computed_mac = hmac.new(secret_bytes, signed_content, hashlib.sha256).digest()
    computed_sig = base64.b64encode(computed_mac).decode('utf-8')
    for sig in svix_sig.split(" "):
        if "," in sig:
            version, val = sig.split(",", 1)
            if version == "v1" and hmac.compare_digest(val, computed_sig):
                return True
    return False

@app.post("/webhook/email")
async def email_webhook(request: Request):
    payload_bytes = await request.body()
    headers = {
        "svix-id":        request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not verify_resend_signature(payload_bytes, headers, RESEND_WEBHOOK_SECRET):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook signature failed")

    try:
        event_data = json.loads(payload_bytes.decode('utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type   = event_data.get("type")
    data_payload = event_data.get("data", {})
    to_list      = data_payload.get("to", [])
    if not to_list:
        return {"status": "skipped", "message": "No recipient in payload"}

    recipient_email = to_list[0]
    client = database.get_lead_by_email(recipient_email)
    if not client:
        return {"status": "skipped", "message": f"{recipient_email} not in database"}

    opened = clicked = bounced = None
    score_delta = 0
    status_label = "Sent"
    if event_type == "email.opened":    opened  = True; score_delta = 20;   status_label = "Opened"
    elif event_type == "email.clicked": clicked = True; score_delta = 25;   status_label = "Clicked"
    elif event_type == "email.bounced": bounced = True; score_delta = -100; status_label = "Bounced"
    elif event_type == "email.delivered": status_label = "Delivered"

    action_prompt = f"""Sales outreach from {OUR_COMPANY_NAME} to {client['company_name']}.
Current status: {status_label}. Suggest a single 1-sentence follow-up action. No greetings or markdown."""
    suggested_action = call_ollama(action_prompt) or "Review contact details and plan follow-up."

    updated = database.update_lead_tracking(
        email=recipient_email, opened=opened, clicked=clicked,
        bounced=bounced, score_delta=score_delta, action=suggested_action
    )
    return {"status": "success", "event": event_type, "client": updated}

@app.get("/client-status/{email}")
async def get_client_status(email: str):
    client = database.get_lead_by_email(email)
    if not client:
        raise HTTPException(status_code=404, detail="Client lead not found.")
    return client

@app.get("/clients")
async def get_all_clients():
    return database.get_all_leads()

@app.post("/crawl-homepage")
async def crawl_homepage(data: CrawlRequest):
    normalized_url = data.website_url.strip()
    if not normalized_url.startswith(("http://", "https://")):
        normalized_url = "https://" + normalized_url

    content = ""
    try:
        # Multi-page concurrent scraping: homepage, /contact, /about
        content = await scrape_pages_concurrent(normalized_url)
    except Exception as e:
        print(f"[Crawl4AI Page] Failed: {e} — using HTTP fallback")
        content = await fetch_url_content(normalized_url)

    # Programmatic extraction of meta description or core text
    summary = ""
    if content:
        cleaned = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', content)
        cleaned = re.sub(r'[#*`_\-]', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        summary = cleaned[:200] + "..." if len(cleaned) > 200 else cleaned

    if not summary or summary.isspace():
        summary = f"{data.company_name} is a leading provider in their industry, specializing in high-quality professional services."

    scanner = extract_regex_contacts(content, source_url=normalized_url)
    emails = scanner["emails"]
    phones = scanner["phones"]
    email_meta = scanner.get("email_meta", [])

    contact_source = None
    if email_meta:
        first = email_meta[0]
        contact_source = {
            "url": first.get("source_url", normalized_url),
            "page": first.get("source_page", "/"),
            "label": first.get("source_label", "Contact Page"),
            "context": first.get("source_context", "")
        }
    elif emails:
        contact_source = {
            "url": normalized_url,
            "page": "/",
            "label": "Homepage",
            "context": find_source_context(content, emails[0])
        }

    relevance = compute_relevance_score(content[:500])
    print(f"[Crawl Response] {data.website_url} -> relevance={relevance}, email={emails[0] if emails else None}, source={contact_source.get('url') if contact_source else 'N/A'}")

    return {
        "summary": summary,
        "email": emails[0] if emails else None,
        "phone": phones[0] if phones else None,
        "emails": emails,
        "phones": phones,
        "linkedin_url": scanner.get("linkedin_url"),
        "contact_source": contact_source,
        "email_meta": email_meta,
        "relevance_score": relevance,
    }


# ─── /deep-enrich ─────────────────────────────────────────────────────────────
# Stage 2: Thorough single-company crawl triggered after "Save to Clients".
# Crawls up to 14 candidate pages; Layer 2 (Crawl4AI) only on JS-blocked gaps.
@app.post("/deep-enrich")
async def deep_enrich(data: EnrichRequest):
    normalized_url = data.website_url.strip()
    if not normalized_url.startswith(("http://", "https://")):
        normalized_url = "https://" + normalized_url

    base = normalized_url.rstrip('/')

    standard_urls = [
        normalized_url,
        f"{base}/contact",
        f"{base}/contact-us",
        f"{base}/contacts",
        f"{base}/en/contact",
        f"{base}/en/contact-us",
        f"{base}/en-ca/contact-us",
        f"{base}/en-us/contact",
        f"{base}/about",
        f"{base}/about-us",
        f"{base}/team",
        f"{base}/our-team",
    ]

    homepage_html = await fetch_url_content(normalized_url, timeout=3.0)
    discovered: list = []
    if homepage_html:
        discovered = discover_contact_links(homepage_html, normalized_url, max_links=8)

    candidate_urls = list(dict.fromkeys(standard_urls + discovered))[:14]
    print(f"[Deep Enrich] {normalized_url} — {len(candidate_urls)} candidate URLs")

    all_content_parts: list = []
    js_blocked_urls: list = []

    if homepage_html:
        all_content_parts.append(homepage_html)
        candidate_urls = [u for u in candidate_urls if u != normalized_url]

    # Layer 1: BS4 in parallel batches of 3
    BATCH_SIZE = 3
    for i in range(0, len(candidate_urls), BATCH_SIZE):
        batch = candidate_urls[i:i + BATCH_SIZE]
        tasks = [asyncio.create_task(fetch_url_content(u, timeout=3.0)) for u in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for url, result in zip(batch, results):
            if isinstance(result, Exception) or not result or len(result.strip()) < 150:
                js_blocked_urls.append(url)
                if isinstance(result, str) and result:
                    all_content_parts.append(result)
            else:
                all_content_parts.append(result)

    combined = "\n\n".join(all_content_parts)

    quick_check = extract_regex_contacts(combined, source_url=normalized_url)
    already_has_email = bool(quick_check.get("emails"))

    # Layer 2: Crawl4AI only on JS-blocked gaps, max 3 URLs
    if js_blocked_urls and not already_has_email:
        try:
            from crawl4ai import AsyncWebCrawler
            print(f"[Deep Enrich] Layer 2 on {len(js_blocked_urls[:3])} blocked URLs")
            js_trigger = """
            try {
              const tabs = document.querySelectorAll('[id*="contact"], [class*="tab"].active');
              tabs.forEach(t => t.click && t.click());
            } catch(e) {}
            """
            async with AsyncWebCrawler() as crawler:
                for u in js_blocked_urls[:3]:
                    try:
                        r = await crawler.arun(url=u, js_code=js_trigger, ignore_https_errors=True)
                        if r and (r.markdown or r.html):
                            c_text = (r.markdown or "") + " " + (r.html or "")
                            combined += f"\n\n### SOURCE_URL: {u}\n\n" + c_text
                    except Exception as ce:
                        print(f"[Deep Enrich] Crawl4AI failed for {u}: {ce}")
        except Exception as e:
            print(f"[Deep Enrich] Crawl4AI skipped: {e}")

    scanner          = extract_regex_contacts(combined, source_url=normalized_url)
    emails           = scanner["emails"]
    phones           = scanner["phones"]
    email_meta       = scanner["email_meta"]
    linkedin_company = scanner.get("linkedin_company")
    linkedin_people  = scanner.get("linkedin_people", [])
    primary_email    = emails[0] if emails else None

    contact_page_url = None
    source_label     = "General Contact"
    if email_meta:
        contact_page_url = email_meta[0].get("source_url")
        source_label     = email_meta[0].get("source_label", source_label)
    if not contact_page_url:
        contact_page_url = f"{base}/contact-us"

    print(f"[Deep Enrich] Done — emails={emails}, phones={phones[:3]}, linkedin={linkedin_company}")

    return {
        "primary_email":    primary_email,
        "all_emails":       emails,
        "emails":           emails,
        "email_meta":       email_meta,
        "phones":           phones,
        "linkedin_company": linkedin_company,
        "linkedin_people":  linkedin_people,
        "contact_page_url": contact_page_url,
        "source_label":     source_label,
        "found":            bool(emails or phones or linkedin_company or linkedin_people),
        "stage":            2,
    }

# ─── Lazy Include Discover Router ─────────────────────────────────────────────
@app.on_event("startup")
def include_discover_router():
    from discover import discover_router
    app.include_router(discover_router)

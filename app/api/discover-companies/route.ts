import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearXNGResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  engine?: string;
}

interface CompanyResult {
  id: string;
  name: string;
  website: string;
  displayUrl: string;
  domain: string;
  industry: string;
  country: string;
  snippet: string;
  trustScore: number;
  trustStatus: string;
  initials: string;
  logoUrl: string;
  email: string | undefined;
  phone: string | undefined;
}

// ─── Domain Blacklist (Set for O(1) lookup) ───────────────────────────────────
const EXCLUDE_DOMAINS = new Set([
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
  'upwork.com', 'fiverr.com', 'angel.co', 'wellfound.com', 'builtin.com',
]);

const SKIP_URL_PATTERNS = [
  '/list', '/top-', '/best-', '/ranking', '/directory', '/category',
  '/blog/', '/news/', '/article', '/search?', 'list-of', 'companies-in',
  '/jobs/', '/careers/', '/hiring/', '/vacancy/',
];

// ─── Domain Filters ───────────────────────────────────────────────────────────
function isRealCompanyPage(result: SearXNGResult): boolean {
  try {
    const urlObj = new URL(result.url);
    const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    const urlLower = result.url.toLowerCase();

    if (domain.split('.').length < 2) return false;
    if ([...EXCLUDE_DOMAINS].some((d) => domain.endsWith(d) || domain.includes(d))) return false;
    if (SKIP_URL_PATTERNS.some((p) => urlLower.includes(p))) return false;

    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 1) {
      const firstSegment = pathSegments[0];
      if (firstSegment.length > 3 && firstSegment !== 'home' && firstSegment !== 'about') {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function satisfiesCountryConstraint(url: string, content: string, country: string): boolean {
  if (!country || country === 'All Countries') return true;

  const urlLower = url.toLowerCase();
  const contentLower = content.toLowerCase();
  const countryLower = country.toLowerCase();

  if (countryLower !== 'pakistan') {
    const pakKeywords = [
      'pakistan', '.pk', 'lahore', 'karachi', 'islamabad', 'rawalpindi',
      'peshawar', 'punjab', 'kpk', 'khyber', 'sindh', 'balochistan', 'faisalabad'
    ];
    if (pakKeywords.some(kw => urlLower.includes(kw) || contentLower.includes(kw))) return false;
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function cleanCompanyName(title: string, domain: string): string {
  let name = title
    .replace(/\s*[|\-–—]\s*(official\s+site?|home|homepage|welcome|about|company|solutions|software|platform|inc\.?|ltd\.?|llc|corp\.?).*$/i, '')
    .replace(/\s*[|\-–—]\s*.{0,50}$/, '')
    .trim();

  const invalidKeywords = ['job', 'list', 'top', 'best', 'career', 'hiring', 'how to', 'what is', 'guide', 'index', 'home'];
  if (name.length < 3 || name.length > 40 || invalidKeywords.some(kw => name.toLowerCase().includes(kw))) {
    name = domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return name.slice(0, 50);
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function extractContacts(content: string): { email?: string; phone?: string } {
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const phoneMatch = content.match(/(\+?\d{1,4}[-.\s]??\(?\d{1,3}\)?[-.\s]??\d{1,4}[-.\s]??\d{1,4}[-.\s]??\d{1,9})/);
  let phone = phoneMatch?.[0]?.trim();
  if (phone && (phone.length < 9 || phone.includes('123456'))) phone = undefined;
  return { email: emailMatch?.[0], phone };
}

// ─── Region / Language Maps ───────────────────────────────────────────────────
const COUNTRY_REGIONS: Record<string, string> = {
  'Singapore': 'sg-SG', 'United Kingdom': 'gb-GB', 'UK': 'gb-GB',
  'France': 'fr-FR', 'Pakistan': 'pk-PK', 'UAE': 'ae-AE',
  'United Arab Emirates': 'ae-AE', 'Germany': 'de-DE', 'Canada': 'ca-CA',
  'India': 'in-IN', 'Australia': 'au-AU', 'USA': 'us-US', 'United States': 'us-US',
  'Japan': 'ja-JP', 'Brazil': 'pt-BR', 'Mexico': 'es-MX', 'Netherlands': 'nl-NL',
  'Spain': 'es-ES', 'Italy': 'it-IT', 'Sweden': 'sv-SE', 'South Korea': 'ko-KR',
};
const COUNTRY_LANGS: Record<string, string> = {
  'Singapore': 'en', 'United Kingdom': 'en', 'UK': 'en',
  'France': 'fr', 'Pakistan': 'en', 'UAE': 'en',
  'United Arab Emirates': 'en', 'Germany': 'de', 'Canada': 'en',
  'India': 'en', 'Australia': 'en', 'USA': 'en', 'United States': 'en',
  'Japan': 'ja', 'Brazil': 'pt', 'Mexico': 'es', 'Netherlands': 'nl',
  'Spain': 'es', 'Italy': 'it', 'Sweden': 'sv', 'South Korea': 'ko',
};

// ─── SearXNG Search ───────────────────────────────────────────────────────────
async function searchWithSearXNG(query: string, pageno: string = '1', country: string = ''): Promise<SearXNGResult[]> {
  const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8085';
  const region = country ? COUNTRY_REGIONS[country] || '' : '';
  const lang = country ? COUNTRY_LANGS[country] || 'en' : 'en';

  const params: Record<string, string> = {
    q: query, format: 'json', categories: 'general',
    engines: 'bing,brave,qwant', language: lang,
    pageno, time_range: '', safesearch: '0',
  };
  if (region) params['region'] = region;

  const targetUrl = `${searxngUrl}/search?${new URLSearchParams(params).toString()}`;
  console.log(`[SearXNG] page=${pageno} country="${country}" → ${targetUrl}`);

  const res = await fetch(targetUrl, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'ClientPlusAI/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`SearXNG ${res.status}: ${res.statusText}`);

  const data = await res.json();
  const results = (data.results || []) as SearXNGResult[];
  console.log(`[SearXNG] Page ${pageno} → ${results.length} raw results`);
  return results;
}

// ─── Main Discovery Execution ──────────────────────────────────────────────────
async function discoverCompanies(keyword: string, country: string, targetCount: number, startTime: number): Promise<CompanyResult[]> {
  const query = `${keyword} companies`;
  const candidates: { name: string; website: string; domain: string; snippet: string; email?: string; phone?: string }[] = [];
  const maxPages = 4;
  let currentPage = 1;

  // ── Step 1: Collect candidates using loop pagination ───────────────────────
  while (candidates.length < targetCount && currentPage <= maxPages) {
    if (Date.now() - startTime > 50000) break;

    let rawResults: SearXNGResult[] = [];
    try {
      rawResults = await searchWithSearXNG(query, String(currentPage), country);
    } catch (err) {
      console.error(`[SearXNG] Page ${currentPage} failed:`, err);
      break;
    }

    if (rawResults.length === 0) break;

    const filtered = rawResults
      .filter(isRealCompanyPage)
      .filter(item => country && country !== 'All Countries' ? satisfiesCountryConstraint(item.url, item.content || '', country) : true);

    for (const item of filtered) {
      if (candidates.length >= targetCount) break;
      const domain = getDomain(item.url);
      if (candidates.some(c => c.domain === domain)) continue;

      const name = cleanCompanyName(item.title, domain);
      const contacts = extractContacts(item.content || '');
      candidates.push({
        name,
        website: item.url,
        domain,
        snippet: item.content || '',
        email: contacts.email,
        phone: contacts.phone,
      });
    }
    currentPage++;
  }

  // ── Fallback to global query if 0 candidates found for a specific country ─
  if (candidates.length === 0 && country && country !== 'All Countries') {
    console.log('[Fallback] Targeted search yielded 0 leads. Falling back to global search...');
    currentPage = 1;
    while (candidates.length < targetCount && currentPage <= maxPages) {
      if (Date.now() - startTime > 50000) break;

      let rawResults: SearXNGResult[] = [];
      try {
        rawResults = await searchWithSearXNG(query, String(currentPage), '');
      } catch (err) {
        console.error(`[SearXNG Fallback] Page ${currentPage} failed:`, err);
        break;
      }
      if (rawResults.length === 0) break;

      const filtered = rawResults.filter(isRealCompanyPage);
      for (const item of filtered) {
        if (candidates.length >= targetCount) break;
        const domain = getDomain(item.url);
        if (candidates.some(c => c.domain === domain)) continue;

        const name = cleanCompanyName(item.title, domain);
        const contacts = extractContacts(item.content || '');
        candidates.push({
          name,
          website: item.url,
          domain,
          snippet: item.content || '',
          email: contacts.email,
          phone: contacts.phone,
        });
      }
      currentPage++;
    }
  }

  // ── Step 2: Asynchronous parallel crawling (Crawl4AI Integration) ─────────
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  console.log(`[Crawl] Starting parallel crawl of ${candidates.length} candidates...`);

  const crawlPromises = candidates.map(async (c, i) => {
    try {
      const crawlRes = await fetch(`${backendUrl}/crawl-homepage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: c.name,
          website_url: c.website
        }),
        signal: AbortSignal.timeout(20000) // 20s timeout per website
      });

      if (!crawlRes.ok) throw new Error(`Crawl server returned ${crawlRes.status}`);

      const data = await crawlRes.json();
      return {
        id: `company-${Date.now()}-${i}`,
        name: c.name,
        website: c.website,
        displayUrl: c.domain,
        domain: c.domain,
        industry: keyword,
        country: country !== 'All Countries' ? country : 'Global',
        snippet: data.summary || c.snippet,
        trustScore: 80, // Uniform placeholder value to prevent UI breakage
        trustStatus: 'High Fit',
        initials: getInitials(c.name),
        logoUrl: `https://logo.clearbit.com/${c.domain}`,
        email: data.email || c.email,
        phone: data.phone || c.phone,
      } as CompanyResult;
    } catch (err) {
      console.warn(`[Crawl Error] Crawling failed for ${c.name}, falling back:`, (err as Error).message);
      return {
        id: `company-fb-${Date.now()}-${i}`,
        name: c.name,
        website: c.website,
        displayUrl: c.domain,
        domain: c.domain,
        industry: keyword,
        country: country !== 'All Countries' ? country : 'Global',
        snippet: c.snippet || `${c.name} is a leading provider of professional services and products.`,
        trustScore: 80, // Uniform placeholder value
        trustStatus: 'High Fit',
        initials: getInitials(c.name),
        logoUrl: `https://logo.clearbit.com/${c.domain}`,
        email: c.email,
        phone: c.phone,
      } as CompanyResult;
    }
  });

  return await Promise.all(crawlPromises);
}

// ─── Route Handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim() || '';
  const country  = searchParams.get('country')?.trim() || '';

  if (!keyword) return NextResponse.json({ error: 'Please enter a keyword.' }, { status: 400 });

  const startTime = Date.now();
  const maxResults = 20;

  try {
    const results = await discoverCompanies(keyword, country, maxResults, startTime);
    return NextResponse.json({ companies: results, query: `${keyword} companies` });
  } catch (err) {
    console.error('[Discover GET] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to process company discovery.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = body.keyword?.trim() || '';
    const country = body.country?.trim() || '';

    if (!keyword) return NextResponse.json({ error: 'Please enter a keyword.' }, { status: 400 });

    const startTime = Date.now();
    const maxResults = 20;

    const results = await discoverCompanies(keyword, country, maxResults, startTime);
    return NextResponse.json({ companies: results, query: `${keyword} companies` });
  } catch (err) {
    console.error('[Discover POST] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to process company discovery.' }, { status: 500 });
  }
}

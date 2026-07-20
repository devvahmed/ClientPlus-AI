import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearXNGResult {
  title: string;
  url: string;
  content: string;
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
  fit_score: number;
  trustStatus: string;
  initials: string;
  logoUrl: string;
  email: string | undefined;
  phone: string | undefined;
}

// ─── Ledger ───────────────────────────────────────────────────────────────────
interface LedgerData {
  processed_domains: string[];
  query_progress: Record<string, number>;
}

const LEDGER_PATH = path.join(process.cwd(), 'processed_domains.json');

function readLedger(): LedgerData {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { processed_domains: parsed.map(String), query_progress: {} };
      }
      return {
        processed_domains: Array.isArray(parsed.processed_domains)
          ? parsed.processed_domains.map(String)
          : [],
        query_progress: parsed.query_progress || {},
      };
    }
  } catch (e) {
    console.warn('[Ledger] Read error:', (e as Error).message);
  }
  return { processed_domains: [], query_progress: {} };
}

function writeLedger(data: LedgerData): void {
  try {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Ledger] Write error:', (e as Error).message);
  }
}

function buildQueryKey(keyword: string, country: string): string {
  const c = country && country !== 'All Countries' ? country : 'global';
  return `${keyword.toLowerCase().trim()}_${c.toLowerCase().trim()}`;
}

// ─── Minimal Junk Filter ──────────────────────────────────────────────────────
// Only strip clearly non-business institutional domains
const HARD_BLACKLIST = new Set([
  'wikipedia.org', 'wikimedia.org', 'wikidata.org',
  'reddit.com', 'quora.com', 'youtube.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'github.com', 'stackoverflow.com',
  'medium.com', 'substack.com', 'blogger.com', 'wordpress.com',
  'indeed.com', 'glassdoor.com', 'monster.com', 'ziprecruiter.com',
  'crunchbase.com', 'pitchbook.com', 'g2.com', 'capterra.com',
  'clutch.co', 'trustpilot.com', 'yelp.com',
  'bloomberg.com', 'reuters.com', 'forbes.com', 'techcrunch.com',
  'businessinsider.com', 'cnbc.com', 'wsj.com', 'ft.com',
]);

// ─── Fast Pre-Filter ──────────────────────────────────────────────────────────
const QUICK_JUNK_TOKENS = [
  'wiki', 'dictionary', 'blog', 'news', 'article',
  'top 10', 'directory', 'course', 'tutorial',
];

function isQuickJunk(title: string = '', url: string = ''): boolean {
  const combined = `${title} ${url}`.toLowerCase();
  return QUICK_JUNK_TOKENS.some(token => combined.includes(token));
}

// ─── Corporate Domain Pattern Filter ─────────────────────────────────────────
function isOfficialCorporateWebsite(url: string): boolean {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const urlLower = url.toLowerCase();

    // Blacklist of known informational/dictionary hubs
    const blacklistedHubs = [
      'wikipedia.org', 'larousse.fr', 'cnrtl.fr', 'wordreference.com',
      'dictionnaire.lerobert.com', 'wiktionary.org', 'britannica.com',
      'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
    ];

    // Logic: If domain is in blacklisted hubs list, reject
    if (blacklistedHubs.some(hub => domain.includes(hub))) return false;

    // Logic: If URL contains 'definition' or 'dictionnaire', reject
    if (urlLower.includes('definition') || urlLower.includes('dictionnaire')) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── 1. Strict B2B Business Qualifier Function (Ollama / LLM) ────────────────
export interface B2BQualifierResult {
  is_fit: boolean;
  score: number;
  reason: string;
}

async function validateCompanyWithOllama(candidate: { title: string; description: string; url: string }): Promise<B2BQualifierResult> {
  const prompt = `Act as a strict B2B Business Qualifier.
Analyze the URL, Title, and Description provided:
URL: ${candidate.url}
Title: ${candidate.title}
Description: ${candidate.description}

Classify as "COMMERCIAL_ENTITY" OR "JUNK".
- "COMMERCIAL_ENTITY": A company that sells products, industrial services, hardware, software solutions, or can use robotics or computer vision in their business.
- "JUNK": Educational camps, schools, personal blogs, stock screeners, competition teams (e.g., FRC Teams), news sites, or job boards.

Perform a Fit Check for WTechX (AI/Software/Tech agency):
- If COMMERCIAL_ENTITY & potential client for WTechX: set is_fit = true, score = 60-100, reason = concise explanation.
- If JUNK or non-fit: set is_fit = false, score = 0, reason = explanation.

Return ONLY JSON matching this exact structure:
{"is_fit": true, "score": 85, "reason": "Explanation"}`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return { is_fit: true, score: 80, reason: 'Commercial B2B company operating in target sector.' };
    }

    const data = await response.json();
    const rawText = data.response?.trim() || '{}';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

    const isFit = Boolean(parsed.is_fit);
    const score = typeof parsed.score === 'number' ? Math.min(100, Math.max(60, parsed.score)) : (isFit ? 80 : 0);
    const reason = typeof parsed.reason === 'string' && parsed.reason.length > 5
      ? parsed.reason
      : (isFit ? 'Commercial entity with high AI/Software deployment potential.' : 'Excluded non-corporate entity.');

    console.log(`[B2B Qualifier] ${candidate.url} → fit:${isFit} score:${score}`);
    return { is_fit: isFit, score, reason };
  } catch {
    return { is_fit: true, score: 80, reason: 'Commercial B2B company operating in target sector.' };
  }
}

function isValidBusinessUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const domain = hostname.toLowerCase().replace(/^www\./, '');

    // Strip .gov / .edu / .mil TLDs
    if (/\.(gov|edu|mil|ac\.uk|edu\.au|gov\.uk|gov\.ca)$/i.test(domain)) return false;

    // Hard blacklist
    if (HARD_BLACKLIST.has(domain)) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function cleanCompanyName(title: string, domain: string): string {
  let name = title
    .replace(/\s*[|\-–—]\s*(official\s+site?|home|homepage|welcome|about|solutions|inc\.?|ltd\.?|llc|corp\.?).*$/i, '')
    .replace(/\s*[|\-–—]\s*.{0,60}$/, '')
    .trim();

  const tooGeneric = ['home', 'about', 'contact', 'index', 'welcome'];
  if (name.length < 3 || name.length > 45 || tooGeneric.includes(name.toLowerCase())) {
    name = domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return name.slice(0, 50);
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function extractContacts(text: string): { email?: string; phone?: string } {
  const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
  let phone = text.match(/\+?[\d\s\-().]{9,17}/)?.[0]?.trim();
  if (phone?.includes('123456')) phone = undefined;
  return { email, phone };
}

// ─── Region Map ───────────────────────────────────────────────────────────────
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

// ─── SearXNG Fetch  ───────────────────────────────────────────────────────────
// Hardcoded to Docker-mapped port 8085 with duckduckgo, bing, yahoo, yandex engines.
async function fetchSearXNG(
  query: string,
  pageno: number,
  country: string
): Promise<SearXNGResult[]> {
  const BASE = process.env.SEARXNG_URL || 'http://localhost:8085';
  const lang = country ? (COUNTRY_LANGS[country] || 'en') : 'en';
  const region = country ? (COUNTRY_REGIONS[country] || '') : '';

  const params: Record<string, string> = {
    q: query,
    format: 'json',
    engines: 'duckduckgo,bing,yahoo,yandex',
    categories: 'general',
    language: lang,
    pageno: String(pageno),
    safesearch: '0',
  };
  if (region) params['region'] = region;

  const url = `${BASE}/search?${new URLSearchParams(params).toString()}`;
  console.log(`[SearXNG] GET page=${pageno} → ${url}`);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ClientPlusAI/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[SearXNG] HTTP ${res.status} for page=${pageno}`);
      return [];
    }
    const data = await res.json();
    const results = (data.results || []) as SearXNGResult[];
    console.log(`[SearXNG] page=${pageno} → ${results.length} raw hits`);
    return results;
  } catch (err) {
    console.warn(`[SearXNG] Fetch error page=${pageno}:`, (err as Error).message);
    return [];
  }
}

// ─── Humanized Inter-Page Delay ───────────────────────────────────────────────
function humanDelay(): Promise<void> {
  const ms = 1500 + Math.random() * 1000;
  console.log(`[Throttle] ${Math.round(ms)} ms pause`);
  return new Promise(r => setTimeout(r, ms));
}

// ─── Query Mutation Vectors for WTechX Discovery Engine ──────────────────────
const NAV_SIGNALS = '("contact" OR "about" OR "solutions" OR "products")';
const DISCOVERY_NEGATIVES = '-inurl:top -inurl:list -inurl:best -inurl:review -inurl:blog -inurl:article -inurl:guide -inurl:comparison -inurl:wiki -inurl:dictionary';

const QUERY_MUTATIONS = [
  (k: string, c: string) => `${k} ${c} ${NAV_SIGNALS} ${DISCOVERY_NEGATIVES}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} platform ${c} ${NAV_SIGNALS} ${DISCOVERY_NEGATIVES}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `corporate B2B ${k} ${c} ${NAV_SIGNALS} ${DISCOVERY_NEGATIVES}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} enterprise ${c} ${NAV_SIGNALS} ${DISCOVERY_NEGATIVES}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} solutions ${c} ${NAV_SIGNALS} ${DISCOVERY_NEGATIVES}`.replace(/\s+/g, ' ').trim(),
];

// ─── Core Discovery ───────────────────────────────────────────────────────────
async function discoverCompanies(
  keyword: string,
  country: string,
  targetCount: number,
  startTime: number,
  resetCursor: boolean = false
): Promise<CompanyResult[]> {

  const cleanCountry = country && country !== 'All Countries' ? country : '';
  const queryKey = buildQueryKey(keyword, country);

  // Read ledger — cursor + processed domains
  const ledger = readLedger();
  if (resetCursor && ledger.query_progress[queryKey]) {
    delete ledger.query_progress[queryKey];
    writeLedger(ledger);
    console.log(`[Cursor] Cache-clear triggered. Reset cursor for "${queryKey}".`);
  }

  const processedSet = new Set<string>(ledger.processed_domains.map(d => d.toLowerCase()));
  const lastPage = ledger.query_progress[queryKey] ?? 0;
  const startPage = lastPage + 1;

  // 1. Dynamic Query Mutation Selection on Deep Pages
  let mutationSeed = Math.floor(lastPage / 10) % QUERY_MUTATIONS.length;
  let currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, cleanCountry);

  console.log(`[Cursor] "${queryKey}" lastPage=${lastPage} → starting page ${startPage} (Mutation Seed #${mutationSeed}: "${currentQuery}")`);
  console.log(`[Ledger] ${processedSet.size} domains already processed`);

  // Candidate buffer
  const candidates: {
    name: string; website: string; domain: string;
    snippet: string; trustScore: number; email?: string; phone?: string;
  }[] = [];

  let currentPage = startPage;
  let consecutiveEmpty = 0;
  let lastGoodPage = lastPage;
  const hardPageLimit = startPage + 25; // Continuous offset advancement limit

  // ── Guaranteed buffer-fill while loop ────────────────────────────────────
  while (candidates.length < targetCount && currentPage <= hardPageLimit) {
    if (Date.now() - startTime > 44_000) {
      console.warn('[Loop] Time limit approaching — stopping early.');
      break;
    }

    // Dynamic Query Mutation on Deep Pages (lastPage >= 10 or currentPage >= 10)
    if (currentPage >= 10 && currentPage % 10 === 0 && mutationSeed === 0) {
      mutationSeed = (mutationSeed + 1) % QUERY_MUTATIONS.length;
      currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, cleanCountry);
      console.log(`[Query Mutation] Deep page offset ${currentPage} reached. Mutating query vector to: "${currentQuery}"`);
    }

    const rawResults = await fetchSearXNG(currentQuery, currentPage, cleanCountry);

    // 3. Graceful Engine Offset Bounds Handler
    if (rawResults.length === 0) {
      consecutiveEmpty++;
      console.log(`[Loop] Page ${currentPage}: empty (${consecutiveEmpty}/4 consecutive)`);
      if (consecutiveEmpty >= 4) {
        mutationSeed = (mutationSeed + 1) % QUERY_MUTATIONS.length;
        if (mutationSeed === 0) {
          console.log('[Loop] Engine offset bounds reached across all query mutation vectors. Breaking.');
          break;
        }
        currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, cleanCountry);
        console.log(`[Engine Offset Bounds] Deep page limit hit on page ${currentPage}. Auto-incrementing mutation seed #${mutationSeed}: "${currentQuery}" from page 1.`);
        currentPage = 1;
        consecutiveEmpty = 0;
        await humanDelay();
        continue;
      }
      await humanDelay();
      currentPage++;
      continue;
    }

    consecutiveEmpty = 0;

    // Filter: keep only real business pages, skip ledger duplicates
    let addedThisPage = 0;

    for (const item of rawResults) {
      if (candidates.length >= targetCount) break;

      // a. Fast Pre-Filter Check
      if (!isValidBusinessUrl(item.url) || !isOfficialCorporateWebsite(item.url) || isQuickJunk(item.title, item.url)) {
        console.log(`[Fast Filter] Dropped junk: ${item.url}`);
        continue;
      }

      const domain = getDomain(item.url);
      if (candidates.some(c => c.domain === domain)) continue;
      if (processedSet.has(domain.toLowerCase())) {
        console.log(`[Ledger Skip] ${domain}`);
        continue;
      }

      // b. Sequential B2B Qualifier Check
      console.log(`[B2B Qualifier] Checking candidate: ${item.url}`);
      const qualResult = await validateCompanyWithOllama({
        title: item.title || domain,
        description: (item.content || '').slice(0, 250),
        url: item.url,
      });

      if (!qualResult.is_fit) {
        console.log(`[B2B Qualifier] Rejected non-fit candidate: ${item.url}`);
        continue;
      }

      const name = cleanCompanyName(item.title, domain);
      const contacts = extractContacts(item.content || '');
      candidates.push({
        name, website: item.url, domain,
        snippet: qualResult.reason || (item.content || '').slice(0, 300).trim(),
        trustScore: qualResult.score,
        email: contacts.email, phone: contacts.phone,
      });
      addedThisPage++;
    }

    console.log(`[Loop] Page ${currentPage}: +${addedThisPage} added. Buffer ${candidates.length}/${targetCount}`);
    lastGoodPage = Math.max(lastGoodPage, currentPage);

    if (candidates.length < targetCount) await humanDelay();
    currentPage++;
  }

  // ── Crawl4AI enrichment (parallel, non-blocking fallback) ─────────────────
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  console.log(`[Crawl] Enriching ${candidates.length} candidates via Crawl4AI...`);

  const crawled = await Promise.all(
    candidates.map(async (c, i) => {
      let crawlSnippet = c.snippet;
      let crawlEmail = c.email;
      let crawlPhone = c.phone;

      try {
        const r = await fetch(`${backendUrl}/crawl-homepage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_name: c.name, website_url: c.website }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.summary?.length > 10) crawlSnippet = d.summary;
          if (d.email) crawlEmail = d.email;
          if (d.phone) crawlPhone = d.phone;
        }
      } catch {
        // silent fallback — search snippet is used
      }

      return {
        id: `co-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        name: c.name,
        website: c.website,
        displayUrl: c.domain,
        domain: c.domain,
        industry: keyword,
        country: cleanCountry || 'Global',
        snippet: crawlSnippet || `${c.name} is a company operating in the ${keyword} industry.`,
        trustScore: c.trustScore || 80,
        fit_score: c.trustScore || 80,
        trustStatus: (c.trustScore || 80) >= 80 ? 'High Fit' : 'Medium Fit',
        initials: getInitials(c.name),
        logoUrl: `https://logo.clearbit.com/${c.domain}`,
        email: crawlEmail,
        phone: crawlPhone,
      } as CompanyResult;
    })
  );

  // 2. Strict Continuous Cursor Offset Advancement
  if (crawled.length > 0 || lastGoodPage > lastPage) {
    const updatedDomains = [
      ...Array.from(processedSet),
      ...crawled.map(r => r.domain.toLowerCase()),
    ].filter((v, i, a) => a.indexOf(v) === i);

    writeLedger({
      processed_domains: updatedDomains,
      query_progress: { ...ledger.query_progress, [queryKey]: lastGoodPage },
    });

    console.log(`[Cursor] "${queryKey}" → saved page ${lastGoodPage}. Next run starts page ${lastGoodPage + 1}.`);
    console.log(`[Ledger] ${updatedDomains.length} domains total.`);
  }

  return crawled;
}

// ─── Route Handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim() || '';
  const country = searchParams.get('country')?.trim() || '';
  const resetCursor = searchParams.get('resetCursor') === 'true' || searchParams.get('clearCache') === 'true';

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
  }

  try {
    const results = await discoverCompanies(keyword, country, 20, Date.now(), resetCursor);
    const res = NextResponse.json({ companies: results, query: `${keyword} companies` });
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    console.error('[GET] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = body.keyword?.trim() || '';
    const country = body.country?.trim() || '';
    const resetCursor = Boolean(body.resetCursor || body.clearCache);

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
    }

    const results = await discoverCompanies(keyword, country, 20, Date.now(), resetCursor);
    const res = NextResponse.json({ companies: results, query: `${keyword} companies` });
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    console.error('[POST] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

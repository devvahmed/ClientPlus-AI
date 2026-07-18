import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearXNGResult {
  title: string;
  url: string;
  content: string;      // snippet / description
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

// ─── Dynamic Config Defaults ──────────────────────────────────────────────────
const OUR_PRODUCT_NAME = process.env.OUR_PRODUCT_NAME || "ClientPlus AI";
const OUR_VALUE_PROPOSITION = process.env.OUR_VALUE_PROPOSITION || "an intelligent CRM and lead generation automation tool for B2B companies";

const EXCLUDE_DOMAINS = [
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
  'upwork.com', 'fiverr.com', 'sales.co', 'getleadwave.io', 'send-burg.com',
  'mediabistro.com', 'remoteleaf.com', 'grabjobs.co', 'startupjobs.com',
  'wellfound.com', 'angel.co', 'builtin.com',
];

const SKIP_URL_PATTERNS = [
  '/list', '/top-', '/best-', '/ranking', '/directory', '/category',
  '/blog/', '/news/', '/article', '/search?', 'list-of', 'companies-in',
  '/jobs/', '/careers/', '/hiring/', '/vacancy/',
];

function isRealCompanyPage(result: SearXNGResult): boolean {
  try {
    const urlObj = new URL(result.url);
    const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    const url = result.url.toLowerCase();

    if (domain.split('.').length < 2) return false;
    if (EXCLUDE_DOMAINS.some((d) => domain.includes(d))) return false;
    if (SKIP_URL_PATTERNS.some((p) => url.includes(p))) return false;

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

// ─── Ollama Fit Analyzer (llama3.2) ───────────────────────────────────────────
async function analyzeCompanyFitWithOllama(
  companyName: string,
  companyUrl: string,
  snippet: string
): Promise<{ relevant: boolean; score: number; reason: string }> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const truncatedSnippet = snippet.slice(0, 1500);

  const prompt = `You are a B2B sales representative for WTechX, an AI, Robotics, and Computer Vision solutions provider.
We build custom AI models, automate operations, integrate intelligent computer vision, and deploy robotics for enterprises.

Target Company Name: ${companyName}
Target Company Website: ${companyUrl}
Target Company Snippet: ${truncatedSnippet}

Analyze if this target company can benefit from custom AI services, automation, or computer vision solutions.

Decide:
1. Is this target company a potential candidate for AI or automation development services (is_relevant: true or false)? Be very generous—most modern businesses can leverage AI in some capacity.
2. What is the Match Compatibility Score (fit_score: 0-100) based on how well their operations could integrate AI?
3. Generate a concise 1-sentence sales pitch reasoning (one_line_pitch: "We can provide them with AI solutions to...").

You MUST return a valid JSON object matching this schema exactly (do NOT wrap in markdown blocks, return pure JSON):
{
  "fit_score": number,
  "is_relevant": boolean,
  "one_line_pitch": string
}`;

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        format: 'json',
        stream: false,
      }),
      signal: AbortSignal.timeout(30000), // Relaxed 30-second timeout per lead
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.response;
    if (!text) throw new Error("Empty response from Ollama");

    const parsed = JSON.parse(text.trim());
    return {
      relevant: !!parsed.is_relevant,
      score: Math.min(100, Math.max(0, Number(parsed.fit_score || 50))),
      reason: parsed.one_line_pitch || 'Potential candidate for AI & automation service integration.',
    };
  } catch (err) {
    console.warn(`Ollama fit qualification failed or timed out for ${companyName}:`, err);
    return {
      relevant: true, // Safe fallback: do not drop the company on timeout
      score: 50,
      reason: 'Pending AI fit evaluation (local service busy).',
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function satisfiesCountryConstraint(url: string, content: string, country: string): boolean {
  if (!country || country === 'All Countries') return true;

  const urlLower = url.toLowerCase();
  const contentLower = content.toLowerCase();
  const countryLower = country.toLowerCase();

  // Guard against local IP bias (reject Pakistani local domains/keywords when another country is specified)
  if (countryLower !== 'pakistan') {
    const pakKeywords = [
      'pakistan', '.pk', 'lahore', 'karachi', 'islamabad', 'rawalpindi', 
      'peshawar', 'punjab', 'kpk', 'khyber', 'sindh', 'balochistan', 'faisalabad'
    ];
    if (pakKeywords.some(kw => urlLower.includes(kw) || contentLower.includes(kw))) {
      return false;
    }
  }

  return true;
}

function cleanCompanyName(title: string, domain: string): string {
  let name = title
    .replace(/\s*[|\-–—]\s*(official\s+site?|home|homepage|welcome|about|company|solutions|software|platform|inc\.?|ltd\.?|llc|corp\.?).*$/i, '')
    .replace(/\s*[|\-–—]\s*.{0,50}$/, '')
    .trim();

  const invalidKeywords = ['job', 'list', 'top', 'best', 'career', 'hiring', 'how to', 'what is', 'guide', 'index', 'home'];
  const hasInvalidKeyword = invalidKeywords.some((kw) => name.toLowerCase().includes(kw));

  if (name.length < 3 || name.length > 40 || hasInvalidKeyword) {
    name = domain.split('.')[0]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return name.slice(0, 50);
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function extractContacts(content: string): { email?: string; phone?: string } {
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const phoneMatch = content.match(/(\+?\d{1,4}[-.\s]??\(?\d{1,3}\)?[-.\s]??\d{1,4}[-.\s]??\d{1,4}[-.\s]??\d{1,9})/);

  let phone = phoneMatch?.[0]?.trim();
  if (phone && (phone.length < 9 || phone.includes('123456'))) {
    phone = undefined;
  }
  return { email: emailMatch?.[0], phone };
}

// ─── SearXNG Search ───────────────────────────────────────────────────────────
async function searchWithSearXNG(query: string, pageno: string = "1", country: string = ""): Promise<SearXNGResult[]> {
  const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';

  const countryRegions: Record<string, string> = {
    'Singapore': 'sg-SG',
    'United Kingdom': 'gb-GB',
    'UK': 'gb-GB',
    'France': 'fr-FR',
    'Pakistan': 'pk-PK',
    'UAE': 'ae-AE',
    'United Arab Emirates': 'ae-AE',
    'Germany': 'de-DE',
    'Canada': 'ca-CA',
    'India': 'in-IN',
    'Australia': 'au-AU',
    'USA': 'us-US',
    'United States': 'us-US',
  };

  const countryLanguages: Record<string, string> = {
    'Singapore': 'en',
    'United Kingdom': 'en',
    'UK': 'en',
    'France': 'fr',
    'Pakistan': 'en',
    'UAE': 'en',
    'United Arab Emirates': 'en',
    'Germany': 'de',
    'Canada': 'en',
    'India': 'en',
    'Australia': 'en',
    'USA': 'en',
    'United States': 'en',
  };

  const region = country ? countryRegions[country] || '' : '';
  const lang = country ? countryLanguages[country] || 'en' : 'en';

  const params: Record<string, string> = {
    q: query,
    format: 'json',
    categories: 'general',
    engines: 'bing,brave,qwant',
    language: lang,
    pageno: pageno,
    time_range: '',
    safesearch: '0',
  };

  if (region) {
    params['region'] = region;
  }

  console.log("SearXNG URL Target:", `${searxngUrl}/search?${new URLSearchParams(params).toString()}`);

  const res = await fetch(`${searxngUrl}/search?${new URLSearchParams(params).toString()}`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ClientPlusAI/1.0',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const results = (data.results || []) as SearXNGResult[];
  console.log("Raw SearXNG Response Count:", results.length);
  return results;
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim() || '';
  const country  = searchParams.get('country')?.trim() || '';
  const pageno   = searchParams.get('pageno')?.trim() || '1';

  if (!keyword) {
    return NextResponse.json({ error: 'Please enter a keyword.' }, { status: 400 });
  }

  // Use clean keywords for SearXNG meta-search query construction
  const query = `${keyword} companies`;

  const startTime = Date.now();

  try {
    const qualifiedCompanies: CompanyResult[] = [];
    const basePage = Number(pageno);
    const startPageIndex = (basePage - 1) * 4 + 1;
    const maxPages = 4;
    const targetCount = 12; // Iterate until 12-15 qualified leads

    let currentPageIdx = startPageIndex;
    const safetyCeilingPage = startPageIndex + maxPages - 1;

    // First attempt: search with targeted country region parameters
    while (qualifiedCompanies.length < targetCount && currentPageIdx <= safetyCeilingPage) {
      // Safety Guard: Check if we are approaching the 35-second API limit
      if (Date.now() - startTime > 33000) {
        console.warn("[Discover Loop] Approaching 35-second total time limit, breaking loop early.");
        break;
      }

      console.log(`[Discover Loop] Querying SearXNG page ${currentPageIdx} for keyword "${keyword}" in "${country}"...`);
      let rawResults: SearXNGResult[] = [];
      try {
        rawResults = await searchWithSearXNG(query, currentPageIdx.toString(), country);
      } catch (searxErr) {
        console.error(`SearXNG page ${currentPageIdx} search failed:`, searxErr);
        break; // Stop querying if search engine fails
      }

      if (rawResults.length === 0) {
        break; // No more results available
      }

      // Filter results strictly matching the requested country + real company pages
      const realCompanyResults = rawResults
        .filter(isRealCompanyPage)
        .filter(item => satisfiesCountryConstraint(item.url, item.content || '', country));

      if (realCompanyResults.length > 0) {
        // Concurrency limiter: Process Ollama evaluations sequentially (batchSize = 1) to prevent thread competition
        const batchSize = 1;
        const evaluated: (CompanyResult | null)[] = [];
        
        for (let idx = 0; idx < realCompanyResults.length; idx += batchSize) {
          // Check time limit inside processing batch
          if (Date.now() - startTime > 33000) {
            console.warn("[Discover Loop] Approaching 35-second limit inside batch, breaking batch processing.");
            break;
          }

          const batch = realCompanyResults.slice(idx, idx + batchSize);
          console.log("Ollama Input Batch:", batch.map(b => b.title));

          const batchRes = await Promise.all(
            batch.map(async (item, batchIdx) => {
              const domain = getDomain(item.url);
              
              // Deduplicate: check if this domain already exists in our lists
              if (
                qualifiedCompanies.some(c => c.domain === domain) ||
                evaluated.some(c => c !== null && c.domain === domain)
              ) {
                return null;
              }

              const name = cleanCompanyName(item.title, domain);
              const contacts = extractContacts(item.content || '');

              const fitAnalysis = await analyzeCompanyFitWithOllama(
                name,
                item.url,
                item.content || ''
              );

              console.log(`Ollama Dynamic Filter Verdict for ${name}:`, fitAnalysis.score, fitAnalysis.relevant);

              // STRICT FILTERING: Relaxed to fit_score >= 20 and is_relevant is true
              if (!fitAnalysis.relevant || fitAnalysis.score < 20) {
                return null;
              }

              let trustStatus = 'Medium Fit';
              if (fitAnalysis.score >= 80) trustStatus = 'High Fit';
              else if (fitAnalysis.score < 60) trustStatus = 'Low Fit';

              return {
                id: `company-${currentPageIdx}-${idx + batchIdx}-${Date.now()}`,
                name,
                website: item.url,
                displayUrl: domain,
                domain,
                industry: keyword,
                country: country !== 'All Countries' ? country : 'Global',
                snippet: fitAnalysis.reason,
                trustScore: fitAnalysis.score,
                trustStatus,
                initials: getInitials(name),
                logoUrl: `https://logo.clearbit.com/${domain}`,
                email: contacts.email,
                phone: contacts.phone,
              } as CompanyResult;
            })
          );
          evaluated.push(...batchRes);
        }

        // Append non-null qualified companies
        for (const c of evaluated) {
          if (c !== null && !qualifiedCompanies.some(qc => qc.domain === c.domain)) {
            qualifiedCompanies.push(c);
          }
        }
      }

      currentPageIdx++;
    }

    // FALLBACK LAYER: If targeted search yielded 0 companies, fallback safely to a generalized global search query
    if (qualifiedCompanies.length === 0 && country && country !== 'All Countries') {
      console.warn(`Targeted search for "${country}" yielded 0 qualified companies. Falling back to global search...`);
      currentPageIdx = startPageIndex;

      while (qualifiedCompanies.length < targetCount && currentPageIdx <= safetyCeilingPage) {
        // Safety Guard: Check if we are approaching the 35-second limit
        if (Date.now() - startTime > 33000) {
          console.warn("[Discover Fallback Loop] Approaching 35-second total time limit, breaking loop early.");
          break;
        }

        console.log(`[Discover Fallback Loop] Querying global SearXNG page ${currentPageIdx} for keyword "${keyword}"...`);
        let rawResults: SearXNGResult[] = [];
        try {
          rawResults = await searchWithSearXNG(query, currentPageIdx.toString(), "");
        } catch (searxErr) {
          console.error(`SearXNG page ${currentPageIdx} fallback search failed:`, searxErr);
          break; // Stop querying if search engine fails
        }

        if (rawResults.length === 0) {
          break; // No more results available
        }

        // Only filter for real company pages (no country constraints in fallback)
        const realCompanyResults = rawResults.filter(isRealCompanyPage);

        if (realCompanyResults.length > 0) {
          // Concurrency limiter: Process Ollama evaluations sequentially (batchSize = 1) to prevent thread competition
          const batchSize = 1;
          const evaluated: (CompanyResult | null)[] = [];

          for (let idx = 0; idx < realCompanyResults.length; idx += batchSize) {
            // Check time limit inside fallback batch
            if (Date.now() - startTime > 33000) {
              console.warn("[Discover Fallback Loop] Approaching 35-second limit inside batch, breaking batch processing.");
              break;
            }

            const batch = realCompanyResults.slice(idx, idx + batchSize);
            console.log("Ollama Input Batch (Fallback):", batch.map(b => b.title));

            const batchRes = await Promise.all(
              batch.map(async (item, batchIdx) => {
                const domain = getDomain(item.url);

                // Deduplicate: check if this domain already exists in our lists
                if (
                  qualifiedCompanies.some(c => c.domain === domain) ||
                  evaluated.some(c => c !== null && c.domain === domain)
                ) {
                  return null;
                }

                const name = cleanCompanyName(item.title, domain);
                const contacts = extractContacts(item.content || '');

                const fitAnalysis = await analyzeCompanyFitWithOllama(
                  name,
                  item.url,
                  item.content || ''
                );

                console.log(`Ollama Dynamic Filter Verdict (Fallback) for ${name}:`, fitAnalysis.score, fitAnalysis.relevant);

                // STRICT FILTERING: Relaxed to fit_score >= 20 and is_relevant is true
                if (!fitAnalysis.relevant || fitAnalysis.score < 20) {
                  return null;
                }

                let trustStatus = 'Medium Fit';
                if (fitAnalysis.score >= 80) trustStatus = 'High Fit';
                else if (fitAnalysis.score < 60) trustStatus = 'Low Fit';

                return {
                  id: `company-fallback-${currentPageIdx}-${idx + batchIdx}-${Date.now()}`,
                  name,
                  website: item.url,
                  displayUrl: domain,
                  domain,
                  industry: keyword,
                  country: 'Global',
                  snippet: fitAnalysis.reason,
                  trustScore: fitAnalysis.score,
                  trustStatus,
                  initials: getInitials(name),
                  logoUrl: `https://logo.clearbit.com/${domain}`,
                  email: contacts.email,
                  phone: contacts.phone,
                } as CompanyResult;
              })
            );
            evaluated.push(...batchRes);
          }

          // Append non-null qualified companies
          for (const c of evaluated) {
            if (c !== null && !qualifiedCompanies.some(qc => qc.domain === c.domain)) {
              qualifiedCompanies.push(c);
            }
          }
        }

        currentPageIdx++;
      }
    }

    return NextResponse.json({ companies: qualifiedCompanies, query });
  } catch (err) {
    console.error('Discover API error:', err);
    return NextResponse.json({ error: 'Failed to process company fit analysis.' }, { status: 500 });
  }
}

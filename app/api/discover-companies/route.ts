import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Configurable target company count constant shared across AI providers
export const TARGET_COMPANY_COUNT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearXNGResult {
  title: string;
  url: string;
  content: string;
}

export interface ContactSource {
  url?: string;
  page?: string;
  label?: string;
  context?: string;
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
  linkedin: string | undefined;
  contactSource?: ContactSource;
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
  // Social & community
  'wikipedia.org', 'wikimedia.org', 'wikidata.org',
  'reddit.com', 'quora.com', 'youtube.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'github.com', 'stackoverflow.com',
  'medium.com', 'substack.com', 'blogger.com', 'wordpress.com',
  // Job boards
  'indeed.com', 'glassdoor.com', 'monster.com', 'ziprecruiter.com',
  // Review & listing sites
  'crunchbase.com', 'pitchbook.com', 'g2.com', 'capterra.com',
  'clutch.co', 'trustpilot.com', 'yelp.com',
  // Global news & publishing
  'bloomberg.com', 'reuters.com', 'forbes.com', 'techcrunch.com',
  'businessinsider.com', 'cnbc.com', 'wsj.com', 'ft.com',
  'straitstimes.com',       // Singapore newspaper
  'channelnewsasia.com',    // Singapore news
  'todayonline.com',        // Singapore news
  'businesstimes.com.sg',   // Singapore business news
  'techinasia.com',         // Tech news blog
  'e27.co',                 // Startup news blog
  'seekingalpha.com',       // Stock analysis site
  'investopedia.com',       // Finance education
  // Dictionaries, Translation & Language Q&A
  'hinative.com', 'weblio.jp', 'kotobank.jp', 'alc.co.jp',
  'linguee.com', 'glosbe.com', 'bab.la', 'wordhippo.com', 'reverso.net',
  'dict.cc', 'wordreference.com', 'urbandictionary.com',
  'dictionary.com', 'thesaurus.com', 'vocabulary.com', 'yourdictionary.com',
  'cambridge.org', 'collinsdictionary.com', 'merriam-webster.com',
  // Academic publishing / books
  'onlinelibrary.wiley.com', // Wiley book publisher
  'springer.com', 'elsevier.com', 'oxford.ac.uk',
  'researchgate.net', 'academia.edu', 'ssrn.com',
  // Legal & regulatory guides
  'globallegalinsights.com', 'lexology.com', 'mondaq.com',
  'oecd.org', 'imf.org', 'worldbank.org', 'bis.org',
  // Japan-specific junk sites
  'robogaku.jp', 'robot-award.net', 'firstjapan.jp',
  'rtj2026.jp', 'itrj.jp', 'nikkan.co.jp', 'jara.jp', 'rsi.or.jp',
  // Global exhibition / event platforms
  'eventbrite.com', 'meetup.com', '10times.com',
  'expodatabase.com', 'tradeshowbooth.com',
]);


// ─── Service Profile ─────────────────────────────────────────────────────────
interface ServiceProfile {
  ourCompany: string;
  ourServices: string;
}

function getServiceProfile(overrides?: { our_company?: string; our_services?: string }): ServiceProfile {
  return {
    ourCompany: overrides?.our_company?.trim() || process.env.OUR_COMPANY_NAME || 'WTechX',
    ourServices: overrides?.our_services?.trim() || process.env.OUR_SERVICES || 'AI, Robotics, and Computer Vision solutions',
  };
}

// ─── Country Intelligence Map ─────────────────────────────────────────────────
const COUNTRY_INTELLIGENCE: Record<string, {
  tlds: string[];
  block_tlds: string[];
  block_scripts: RegExp | null;
  company_signals: string[];
  lang_signals: string[];
}> = {
  'Germany': {
    tlds: ['.de', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.fr', '.br'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['gmbh', 'ag', 'kg', 'ug', 'ev', 'solutions', 'software', 'technologies', 'digital'],
    lang_signals: ['germany', 'german', 'deutschland', 'münchen', 'berlin', 'hamburg', 'frankfurt'],
  },
  'Japan': {
    tlds: ['.jp', '.com', '.co.jp'],
    block_tlds: ['.de', '.fr', '.cn', '.ru', '.br'],
    block_scripts: null,
    company_signals: ['co.,ltd', 'k.k.', 'inc', 'corp', 'solutions', 'technologies'],
    lang_signals: ['japan', 'japanese', 'tokyo', 'osaka'],
  },
  'UAE': {
    tlds: ['.ae', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.br', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['llc', 'fze', 'fzco', 'ltd', 'corp', 'solutions', 'technologies', 'digital'],
    lang_signals: ['uae', 'dubai', 'abu dhabi', 'emirates'],
  },
  'Pakistan': {
    tlds: ['.pk', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de', '.fr'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['pvt', 'ltd', 'private limited', 'solutions', 'technologies', 'systems'],
    lang_signals: ['pakistan', 'karachi', 'lahore', 'islamabad', 'pakistani'],
  },
  'USA': {
    tlds: ['.com', '.io', '.ai', '.tech', '.co'],
    block_tlds: ['.cn', '.ru', '.jp'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF\u0600-\u06FF]/,
    company_signals: ['inc', 'llc', 'corp', 'ltd', 'solutions', 'technologies', 'software', 'systems'],
    lang_signals: ['usa', 'united states', 'american'],
  },
  'United Kingdom': {
    tlds: ['.co.uk', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.ru', '.jp', '.fr'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['ltd', 'plc', 'llp', 'limited', 'solutions', 'technologies', 'digital'],
    lang_signals: ['uk', 'united kingdom', 'british', 'london', 'manchester'],
  },
  'France': {
    tlds: ['.fr', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['sas', 'sarl', 'sa', 'srl', 'solutions', 'technologies', 'logiciels'],
    lang_signals: ['france', 'french', 'paris', 'lyon'],
  },
  'India': {
    tlds: ['.in', '.com', '.io', '.co.in'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['pvt ltd', 'private limited', 'ltd', 'solutions', 'technologies', 'systems', 'infosys'],
    lang_signals: ['india', 'indian', 'mumbai', 'delhi', 'bangalore', 'hyderabad'],
  },
  'Singapore': {
    tlds: ['.sg', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['pte ltd', 'pte', 'ltd', 'corp', 'solutions', 'technologies', 'digital'],
    lang_signals: ['singapore', 'singaporean'],
  },
  'Brazil': {
    tlds: ['.com.br', '.br', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['ltda', 's.a.', 'sa', 'logistica', 'transportes', 'solucoes', 'servicos', 'brasil', 'brazil', 'group', 'inc', 'corp'],
    lang_signals: ['brazil', 'brasil', 'sao paulo', 'rio de janeiro', 'curitiba'],
  },
  'Canada': {
    tlds: ['.ca', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['inc', 'ltd', 'corp', 'limited', 'canada', 'solutions', 'technologies', 'group'],
    lang_signals: ['canada', 'canadian', 'toronto', 'vancouver', 'montreal', 'calgary'],
  },
  'Mexico': {
    tlds: ['.com.mx', '.mx', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['s.a.', 'sa', 'de c.v.', 'cv', 'logistica', 'soluciones', 'mexico', 'grupo'],
    lang_signals: ['mexico', 'mexican', 'cdmx', 'monterrey', 'guadalajara'],
  },
  'Spain': {
    tlds: ['.es', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['s.l.', 'sl', 's.a.', 'sa', 'soluciones', 'tecnologias', 'grupo', 'espana'],
    lang_signals: ['spain', 'spanish', 'madrid', 'barcelona', 'valencia'],
  },
  'Italy': {
    tlds: ['.it', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['s.r.l.', 'srl', 's.p.a.', 'spa', 'soluzioni', 'tecnologie', 'gruppo', 'italia'],
    lang_signals: ['italy', 'italian', 'rome', 'milan', 'turin'],
  },
  'Netherlands': {
    tlds: ['.nl', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['b.v.', 'bv', 'n.v.', 'nv', 'solutions', 'technologies', 'group', 'dutch'],
    lang_signals: ['netherlands', 'dutch', 'amsterdam', 'rotterdam', 'utrecht'],
  },
  'Sweden': {
    tlds: ['.se', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['ab', 'aktiebolag', 'group', 'solutions', 'technologies', 'sweden'],
    lang_signals: ['sweden', 'swedish', 'stockholm', 'gothenburg'],
  },
  'South Korea': {
    tlds: ['.co.kr', '.kr', '.com', '.io', '.ai'],
    block_tlds: ['.cn', '.ru', '.de'],
    block_scripts: null,
    company_signals: ['co.,ltd', 'inc', 'corp', 'solutions', 'technologies', 'korea'],
    lang_signals: ['korea', 'korean', 'seoul', 'busan'],
  },
  'Turkey': {
    tlds: ['.com.tr', '.tr', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['a.s.', 'as', 'ltd. sti.', 'sti', 'lojistik', 'cozumleri', 'turkey', 'turkiye'],
    lang_signals: ['turkey', 'turkish', 'istanbul', 'ankara', 'izmir'],
  },
  'Saudi Arabia': {
    tlds: ['.com.sa', '.sa', '.com', '.io'],
    block_tlds: ['.cn', '.jp', '.ru', '.de'],
    block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/,
    company_signals: ['co', 'ltd', 'llc', 'company', 'solutions', 'technologies', 'saudi'],
    lang_signals: ['saudi', 'saudi arabia', 'riyadh', 'jeddah'],
  },
};

function getCountryIntelligence(country: string) {
  if (!country || country === 'All Countries') {
    return {
      tlds: ['.com', '.io', '.ai', '.tech', '.co', '.org', '.net'],
      block_tlds: [] as string[],
      block_scripts: /[\u4E00-\u9FFF\u3040-\u30FF]/ as RegExp | null,
      company_signals: ['ltd', 'inc', 'corp', 'llc', 'solutions', 'technologies', 'software', 'systems', 'group', 'logistics'],
      lang_signals: [] as string[],
    };
  }
  if (COUNTRY_INTELLIGENCE[country]) return COUNTRY_INTELLIGENCE[country];
  const lower = country.toLowerCase();
  for (const [key, val] of Object.entries(COUNTRY_INTELLIGENCE)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return val;
  }
  return {
    tlds: ['.com', '.io', '.ai', '.co', '.tech', '.net', '.org', `.${lower}`, `.com.${lower}`],
    block_tlds: [] as string[],
    block_scripts: null as RegExp | null,
    company_signals: ['ltd', 'inc', 'corp', 'llc', 'solutions', 'technologies', 'software', 'systems', 'group', 'logistics', 'sa', 'ltda', 'bv', 'gmbh', 'pty', 'pte'],
    lang_signals: [lower],
  };
}

// ─── Fast Pre-Filter ──────────────────────────────────────────────────────────
const QUICK_JUNK_TOKENS = [
  // Informational & Dictionary content
  'wiki', 'dictionary', 'definition', 'blog', 'news', 'article',
  'top 10', 'top 5', 'top 15', 'top 20', 'top 25', 'top 30', 'top 50', 'top 100',
  'best 10', 'best 5', 'best 20', '10 best', '5 best', '15 best', '20 best',
  'ranking', 'review', 'directory', 'course', 'tutorial', 'guide', 'comparison',
  'list of', 'directory of', 'companies in', 'vendors in', 'suppliers in', 'manufacturers in',
  'hinative', 'weblio', 'kotobank', '例文', '意味', '使い方', '辞書', '対義語', '類語',
  'meaning of', 'definition of', 'what is', 'examples of', 'synonyms', 'antonyms',
  // Consulting & Advisory firms (accounting, legal, consulting, staffing)
  'consulting firm', 'advisory firm', 'management consulting', 'tax advisory', 'legal services',
  'accounting firm', 'staffing agency', 'recruitment agency', 'executive search',
  // B2B Directories & Aggregators
  'b2b directory', 'supplier directory', 'manufacturer directory', 'company directory', 'vendor directory',
  'business directory', 'yellow pages', 'chamber of commerce', 'board of trade',
  // Industry Associations & Trade Bodies (generalized)
  'globalautomakers', 'automakers of', 'trade association', 'industry association', 'automakers council',
  'manufacturers association', 'exporters association', 'society of', 'federation of',
  // Research & Index Organizations (generalized across all industries)
  'index on', 'performance index', 'national index', 'global index', 'industry index', 'sector index',
  'performance tracker', 'research initiative', 'reporting initiative', 'performance metrics',
  'observatory', 'benchmark body', 'benchmarking', 'benchmark report',
  'industry report', 'sector report', 'performance council', 'reporting council',
  'task force', 'working group', 'policy index',
  // Career & job boards
  'jobs', '/job/', 'careers', 'recruiting', 'hiring', 'vacancy',
  // Events, exhibitions, competitions
  'exhibition', 'expo ', 'expo:', 'trade show', 'tradeshow', 'festival',
  'conference', 'convention', 'symposium', 'summit ',
  'award', 'competition', 'contest', 'championship',
  // Academic & research
  'laboratory', ' lab ', '/lab/', 'research center', 'research centre',
  'institute', 'university', 'college', 'student project',
  'faculty', 'department of', 'school of',
  // Events & resources
  'newsroom', 'news-release', 'news-releases', 'press-release',
  'fact-sheet', 'factsheet', 'whitepaper', 'webinar',
  // Finance-specific junk titles
  'laws and regulations', 'regulations 20', 'legal insights',
  'regulatory', 'sets up new', 'tracker of', 'top fintech',
  'how monetary', 'monetary authority',
  // Books & publications in title
  'the fintech book', 'the book', ' book ', 'onlinelibrary',
  // URL junk path signals
  '-inurl', '/skill-areas/', '/resources/', '/company/newsroom',
  '/news/', '/press/', '/media/', '/insights/', '/research/',
  '/companies/', '/company-directory/', '/company-list/', '/company-search/',
  '/type/', '/list/', '/category/', '/categories/', '/directory/',
];

const JUNK_DOMAINS = new Set([
  // Job boards
  'berlinstartupjobs.com', 'haystackapp.io', 'join.com',
  'angel.co', 'wellfound.com', 'otta.com', 'remoteok.com',
  'jobsintech.io', 'eurojobs.com', 'itvjob.de',
  // Directories, aggregators & B2B platforms
  'builtin.com', 'builtintoronto.com', 'builtinchicago.com', 'builtinla.com',
  'builtinnyc.com', 'builtinboston.com', 'builtincolorado.com', 'builtinaustin.com',
  'builtinsf.com', 'builtinseattle.com',
  'clutch.co', 'g2.com', 'capterra.com', 'goodfirms.co', 'sortlist.com',
  'trustpilot.com', 'yelp.com', 'glassdoor.com',
  'icmagroup.org', 'impriindia.com', 'samcorporate.com', 'flagright.com',
  'trademo.com', 'kompass.com', 'ca.kompass.com', 'us.kompass.com', 'fr.kompass.com',
  'europages.com', 'thomasnet.com',
  'alibaba.com', 'made-in-china.com', 'globalsources.com', 'dnb.com',
  'indiamart.com', 'tradekey.com', 'importers.com', 'yellowpages.com', 'yp.ca',
  'pagesjaunes.fr', 'wlw.de', 'wlw.at', 'dunsguide.com', 'zoominfo.com',
  'crunchbase.com', 'pitchbook.com', 'tracxn.com', 'exporthub.com',
  'companydata.com', 'disfold.com', 'f6s.com', 'aeroleads.com', 'ensun.io', 'lusha.com',
  'apollo.io', 'cognism.com', 'lead411.com', 'salesql.com', 'uplead.com', 'seamless.ai',
  'rocketreach.co', 'signalhire.com', 'zippia.com',
  // Municipal & regional government / economic development portals & associations
  'yorklink.ca', 'waterlooedc.ca', 'globalautomakers.ca', 'investcanada.ca', 'investincanada.com', 'greatplacetowork.ca', 'greatplacetowork.com',
  // News, trade publications, associations, consulting & event portals
  'canadianmanufacturing.com', 'thelogic.co',
  'newswire.ca', 'globalbankingandfinance.com',
  'cme-mec.ca', 'sme.org', 'plant.ca', 'cmts.ca', 'ngen.ca', 'emccanada.org',
  'bdo.ca', 'bdo.com', 'imercer.com', 'mercer.com', 'pwc.com', 'pwc.ca', 'deloitte.com', 'deloitte.ca',
  'ey.com', 'ey.ca', 'kpmg.com', 'kpmg.ca', 'cgi.com', 'mckinsey.com', 'accenture.com', 'bain.com',
  'bcg.com', 'oliverwyman.com', 'fticonsulting.com', 'protiviti.com', 'rsm.global', 'rsm.ca', 'rsmus.com',
  'grantthornton.ca', 'grantthornton.com', 'bakertilly.ca', 'bakertilly.com', 'mnp.ca',
  // Consumer retail, department stores & non-target e-commerce
  'marksandspencer.com', 'm-s.com', 'walmart.com', 'target.com',
  'amazon.com', 'ebay.com', 'etsy.com', 'costco.com', 'macys.com',
  'nordstrom.com', 'zara.com', 'hm.com', 'asos.com', 'ikea.com',
]);

function isHostBlacklisted(host: string, blackList: Set<string>): boolean {
  const cleanHost = host.toLowerCase().replace(/^www\./, '');
  if (blackList.has(cleanHost)) return true;
  // Prefix / subdomain matching for builtin aggregator variations
  if (/^builtin/i.test(cleanHost) || cleanHost.includes('builtin')) return true;
  const parts = cleanHost.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (blackList.has(parentDomain)) return true;
  }
  return false;
}

function isQuickJunk(title: string = '', url: string = ''): boolean {
  const combined = `${title} ${url}`.toLowerCase();
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    // 1. TLD & Government subdomain checks (includes .canada.ca, .gc.ca, .gov.ca, etc.)
    if (domain.endsWith('.canada.ca') || domain === 'canada.ca' || domain.endsWith('.gc.ca') || domain === 'gc.ca' || /\.(gov|gov\.ca|gov\.uk|gov\.au|gov\.in|gov\.sg|gov\.ae|gov\.pk|mun\.ca|gouv\.qc\.ca|gov\.on\.ca|gov\.bc\.ca|gov\.ab\.ca|gov\.mb\.ca|gov\.sk\.ca|gov\.ns\.ca|gov\.nb\.ca|gov\.nl\.ca|gov\.pe\.ca)$/i.test(domain)) return true;
    
    // 2. Blacklisted domain check (aggregators, directories, job boards, associations, municipal EDCs, consulting firms)
    if (isHostBlacklisted(domain, JUNK_DOMAINS) || isHostBlacklisted(domain, HARD_BLACKLIST) || domain.endsWith('edc.ca') || domain.includes('waterlooedc') || domain.includes('globalautomakers')) return true;

    // 3. Path-level directory, aggregator, consulting, & listing page pattern checks
    if (/\/(companies|company-directory|company-list|company-search|type|list|category|categories|directory|top-[^\/]+|best-[^\/]+|companies-in-[^\/]+|search|suppliers|manufacturers|vendors|industry\/[^\/]+|industries\/[^\/]+|consulting|advisory|catalogue|catalog|yellow-pages)(\/|$|\.)/i.test(pathname)) return true;

    // 4. Municipal & regional government / economic development content patterns
    if (/\b(regional municipality|municipality of|city of|county of|town of|township of|economic development|investment board|government of|municipal government|regional government|regional council|municipal council|economic board|economic initiative|regional economic|investment portal|investment agency|economic development corporation|waterloo edc|york region)\b/i.test(combined)) return true;

    // 5. Industry Association, Trade Group, Consulting, & Directory content patterns
    if (/\b(global automakers|automakers of|trade association|industry association|manufacturers association|automakers council|consulting firm|advisory firm|management consulting|accounting firm|law firm|legal services|staffing agency|recruitment agency|executive search|b2b directory|supplier directory|manufacturer directory|company directory|business directory|chamber of commerce|board of trade)\b/i.test(combined)) return true;
  } catch { /* ignore */ }

  // 6. Regex check for top N / best N lists / awards / directories
  if (/\b(top\s+\d+|\d+\s+best|best\s+\d+|list\s+of|companies\s+in|best\s+workplaces|invest\s+in)\b/i.test(combined)) return true;

  return QUICK_JUNK_TOKENS.some(token => combined.includes(token));
}

// ─── Dynamic 5-Layer Country Filter ──────────────────────────────────────────
function passesCountryFilter(url: string, title: string, snippet: string, country: string): boolean {
  const intel = getCountryIntelligence(country);
  const domain = getDomain(url);
  const combined = `${title} ${snippet} ${url}`.toLowerCase();

  // Layer 1: Block non-latin scripts
  if (intel.block_scripts && intel.block_scripts.test(title + snippet)) {
    console.log(`[Script Filter] Dropped: ${url}`);
    return false;
  }

  // Layer 2: Block unwanted country TLDs
  if (intel.block_tlds.some(tld => domain.endsWith(tld))) {
    console.log(`[TLD Block] Dropped: ${url}`);
    return false;
  }

  // Layer 3: Company signal check
  const hasSignal = intel.company_signals.some(s => combined.includes(s.toLowerCase()));

  // Layer 4: Preferred TLD check
  const isPreferredTLD = intel.tlds.some(tld => domain.endsWith(tld));

  // Layer 5: Language/country signal check
  // (informational only — not a hard block by itself)

  // Decision: must have company signal OR preferred TLD
  if (!hasSignal && !isPreferredTLD) {
    console.log(`[Company Signal] No signals: ${url}`);
    return false;
  }

  return true;
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AI QUALIFIER — UNIFIED SWITCHER ─────────────────────────────────────────
// Set AI_PROVIDER=groq   → uses Groq cloud API  (current PC, no GPU needed)
// Set AI_PROVIDER=ollama → uses local Ollama    (GPU PC, llama3.1:70b)
// Default: groq
// ═══════════════════════════════════════════════════════════════════════════════

export const OUR_SERVICES_LIST = [
  "LiDAR-inertial SLAM",
  "AI perception",
  "Multi-sensor fusion",
  "Robotics simulation"
];

export interface B2BQualifierResult {
  company_name?: string;
  is_fit: boolean;
  score: number;
  decision?: string;
  reason: string;
  matched_service?: string;
  match_reason?: string;
  outreach_angle?: string;
  personalization_hook?: string;
  red_flags?: string;
  is_rate_limited?: boolean;
}

// ─── Shared Prompt (identical for both providers) ────────────────────────────
function buildQualifierPrompt(
  candidate: { title: string; description: string; url: string },
  profile: ServiceProfile,
  country: string = 'Global',
  region: string = '',
  keyword: string = ''
): string {
  const OUR_COMPANY_NAME = profile.ourCompany || "WTechX";
  const servicesFormatted = OUR_SERVICES_LIST.map(s => `"${s}"`).join(", ");

  return `We are ${OUR_COMPANY_NAME}.
Our services list (${OUR_COMPANY_NAME} capabilities):
${servicesFormatted}

Your job is to strictly decide if this candidate is a GENUINE potential business client for us by evaluating in THREE STEPS:

Candidate Information:
URL: ${candidate.url}
Title: ${candidate.title}
Snippet: ${candidate.description}
Target Industry/Keyword: ${keyword || "Business"}
Target Country: ${country}
Target Region/City: ${region || "any"}

THREE-STEP REASONING EVALUATION:
Step 1: Does this company genuinely operate within or closely relate to the '${keyword}' industry based on their actual content?

Step 2: Think about what this type of company in '${keyword}' would realistically need. Could their actual operations plausibly use any of our services (${servicesFormatted})? Reason about THIS SPECIFIC company's real business — not generic assumptions. Consider realistic use cases (e.g. a manufacturing company might need automation or quality inspection via computer vision/perception or robotics simulation; a healthcare company might need surgical robotics, hospital logistics automation, or AI perception; a construction company might need site inspection robotics, LiDAR-inertial SLAM, or multi-sensor fusion).

Step 3 — RELATIONSHIP TYPE CHECK:
Beyond checking if this is a real company in the industry and could use our services, also determine the nature of the company:
- Is this a genuine potential CUSTOMER who would directly buy/use our services? → proceed with is_fit: true
- Is this an INDEX, RESEARCH INITIATIVE, PERFORMANCE TRACKER, OBSERVATORY, BENCHMARKING BODY, or REPORTING COUNCIL (e.g. "National Index on Agri-Food Performance", "Performance Tracker", "Agri-Food Index", "Industry Performance Observatory")? → is_fit: false, reason: "Research index/reporting body, not an operating business"
- Is this a MUNICIPAL or REGIONAL GOVERNMENT authority, economic development corporation, or city/county portal (e.g. "York Region", "yorklink.ca", "City of...", "Regional Municipality of...", "Invest in [Region]")? → is_fit: false, reason: "Government/municipal authority page, not an operating business"
- Is this a DIRECTORY LISTING PAGE or AGGREGATOR PLATFORM (e.g. Built In, Clutch, F6S, YellowPages, Lusha, or URL path containing /companies/, /type/, /list/, /directory/)? → is_fit: false, reason: "Directory listing page, not a direct company site"
- Is this a CONSULTING/ADVISORY firm that serves this industry (accounting, consulting, professional services firms like BDO, PwC, Mercer, Deloitte, EY, KPMG) rather than operating in it themselves? → is_fit: false, reason: "Consulting/advisory firm, not a direct customer"
- Is this an INDUSTRY ASSOCIATION, TRADE BODY, or PROFESSIONAL SOCIETY (e.g. "Manufacturers & Exporters," "Society of X Engineers," non-profit industry groups like CME, SME, NGen, EMC)? → is_fit: false, reason: "Industry association, not a direct customer"
- Is this a TRADE PUBLICATION, MAGAZINE, or MEDIA OUTLET (e.g. "Plant Magazine", plant.ca)? → is_fit: false, reason: "Trade publication/media, not a company"
- Is this an EVENT ORGANIZER or TRADE SHOW (e.g. CMTS)? → is_fit: false, reason: "Event organizer, not a direct customer"

Only mark is_fit: true if the company passes Steps 1, 2, AND 3.

STRICT REJECTION RULES (set is_fit: false, score: 0 if ANY apply):
- This is a directory listing page, aggregator platform, company directory, category index, or profile page on an aggregator platform (Built In, Clutch, F6S, Crunchbase, YellowPages, Lusha, etc.) or URL path contains /companies/, /type/, /company-directory/, /list/, /directory/, /search/
- This is an index, research initiative, performance tracker, benchmarking body, observatory, reporting council, industry association, trade group, task force, or non-operating research/policy entity (e.g., 'National Index on...', 'Performance Tracker', 'Agri-Food Performance Index', 'Manufacturing Performance Council', 'Industry Observatory'). Generalized across ALL industries
- This is a government agency, municipal authority, regional municipality, economic development board, city/county promotion page, or state investment portal (e.g., 'York Region', 'yorklink.ca', 'City of...', 'Regional Municipality of...', 'Economic Development Corporation', 'Invest in [Region]'). Reject regardless of whether the domain ends in .gov or .ca
- This is a consulting or advisory firm (PwC, BDO, Mercer, Deloitte, EY, KPMG, McKinsey, Accenture, etc.) that serves manufacturers rather than being a manufacturer itself
- This is an industry association, trade group, professional society, or non-profit consortium (CME, SME, NGen, EMC, etc.)
- This is a trade publication, magazine, news outlet, or media site (Plant Magazine, plant.ca, etc.)
- This is an event organizer, trade show, conference, or exhibition (CMTS, etc.)
- This is a job board, recruitment agency, course provider, wiki, software download site, or stock portal
- This is a competitor AI/tech tool (openai, anthropic, claude, gemini, chatgpt, copilot, perplexity, etc.)
- The candidate is NOT a single operating commercial business selling products/services — it is a directory, list, media outlet, consulting firm, industry association, index body, or government agency
- The company's actual location does not match "${country}" (check content/snippet, not just domain)
- The company fails Step 1, Step 2, or Step 3

ACCEPTANCE & MATCHING RULE:
- Score range: 0-100, only is_fit true if score > 55
- Select matched_service: pick the ONE specific service from our list (${servicesFormatted}) that fits this company's needs best.
- Write match_reason: one specific line in exact format: "They likely need [X] because [specific reason based on their actual business], we provide [Y]"

COMPANY NAME CLEANING:
- Extract the actual clean company/organization name only.

Return ONLY this JSON, nothing else:
{
  "company_name": "cleaned name",
  "is_fit": true/false,
  "score": 0-100,
  "decision": "one line decision summary",
  "reason": "specific one line explaining decision based on actual content",
  "matched_service": "one specific service from OUR_SERVICES_LIST",
  "match_reason": "They likely need [X] because [specific reason based on their actual business], we provide [Y]",
  "outreach_angle": "suggested angle",
  "personalization_hook": "hook based on snippet",
  "red_flags": "none or specific flag"
}`;
}

// ─── Parse Shared LLM JSON Response ──────────────────────────────────────────
function parseQualifierResponse(raw: string, profile: ServiceProfile): B2BQualifierResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  const isFit = Boolean(parsed.is_fit);
  const score = typeof parsed.score === 'number'
    ? Math.min(100, Math.max(0, parsed.score))
    : (isFit ? 70 : 0);
  const reason = typeof parsed.reason === 'string' && parsed.reason.length > 5
    ? parsed.reason
    : (isFit ? `Potential ${profile.ourServices} client.` : 'Not a relevant company.');
  const companyName = typeof parsed.company_name === 'string' && parsed.company_name.trim().length > 1
    ? parsed.company_name.trim()
    : undefined;
  const matchedService = typeof parsed.matched_service === 'string' && parsed.matched_service.trim().length > 2
    ? parsed.matched_service.trim()
    : undefined;
  const matchReason = typeof parsed.match_reason === 'string' && parsed.match_reason.trim().length > 5
    ? parsed.match_reason.trim()
    : undefined;
  const decision = typeof parsed.decision === 'string' ? parsed.decision.trim() : undefined;
  const outreachAngle = typeof parsed.outreach_angle === 'string' ? parsed.outreach_angle.trim() : undefined;
  const personalizationHook = typeof parsed.personalization_hook === 'string' ? parsed.personalization_hook.trim() : undefined;
  const redFlags = typeof parsed.red_flags === 'string' ? parsed.red_flags.trim() : undefined;

  return {
    company_name: companyName,
    is_fit: isFit,
    score,
    decision,
    reason,
    matched_service: matchedService,
    match_reason: matchReason,
    outreach_angle: outreachAngle,
    personalization_hook: personalizationHook,
    red_flags: redFlags
  };
}

// ─── Provider: GROQ (cloud, free, ~0.8s) ─────────────────────────────────────
export let globalGroq429Count = 0;

export function resetGroq429Count() {
  globalGroq429Count = 0;
}

function parseGroqRetryDelay(errText: string, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const sec = parseFloat(retryAfterHeader);
    if (!isNaN(sec) && sec > 0) {
      return Math.ceil(sec * 1000) + 500;
    }
  }
  if (errText) {
    // Extract wait time from Groq error message e.g. "Please try again in 5.7s" or "in 500ms"
    const match = errText.match(/try again in ([0-9]+(?:\.[0-9]+)?)\s*(s|ms)?/i) ||
                  errText.match(/in ([0-9]+(?:\.[0-9]+)?)\s*(s|ms)/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = (match[2] || 's').toLowerCase();
      if (!isNaN(val)) {
        const ms = unit === 'ms' ? val : val * 1000;
        return Math.ceil(ms) + 500; // Exact suggested wait time + 500ms safety buffer
      }
    }
  }
  return 0;
}

async function validateWithGroq(
  candidate: { title: string; description: string; url: string },
  profile: ServiceProfile,
  country: string = 'Global',
  region: string = '',
  keyword: string = '',
  attempt: number = 1
): Promise<B2BQualifierResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    console.warn('[Groq] GROQ_API_KEY missing or invalid in env — check .env.local');
    return {
      is_fit: true,
      score: 0,
      is_rate_limited: true,
      reason: 'Qualification Failed — Retry'
    };
  }
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: buildQualifierPrompt(candidate, profile, country, region, keyword) }],
        temperature: 0,
        max_tokens: 450,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (fetchErr) {
    console.error(`[Groq] Network error for ${candidate.url}:`, fetchErr);
    return {
      is_fit: false,
      score: 0,
      is_rate_limited: true,
      reason: 'Qualification Failed — Retry'
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[Groq] HTTP ${response.status} for ${candidate.url}: ${errText}`);

    // Parse Groq's actual suggested wait time from response text/header + 500ms buffer
    if (response.status === 429 && attempt <= 3) {
      globalGroq429Count++;
      const retryHeader = response.headers.get('retry-after');
      const parsedDelay = parseGroqRetryDelay(errText, retryHeader);
      const delayMs = parsedDelay > 0 ? parsedDelay : (Math.pow(2, attempt) * 1500 + 500);

      console.warn(`[Groq Rate Limit] 429 received for ${candidate.url} (Total 429s: ${globalGroq429Count}). Waiting ${delayMs}ms (Parsed suggested wait: ${parsedDelay > 0 ? `${parsedDelay - 500}ms + 500ms buffer` : 'fallback'}). Retry ${attempt}/3...`);
      await new Promise(r => setTimeout(r, delayMs));
      return validateWithGroq(candidate, profile, country, region, keyword, attempt + 1);
    }

    return {
      is_fit: false,
      score: 0,
      is_rate_limited: true,
      reason: 'Qualification Failed — Retry'
    };
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
  return parseQualifierResponse(raw, profile);
}

// ─── Provider: OLLAMA (local GPU, ~0.5s with RTX 4070+) ──────────────────────
async function validateWithOllama(
  candidate: { title: string; description: string; url: string },
  profile: ServiceProfile,
  country: string = 'Global',
  region: string = '',
  keyword: string = ''
): Promise<B2BQualifierResult> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:70b';   // upgrade when on GPU PC
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      prompt: buildQualifierPrompt(candidate, profile, country, region, keyword),
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS) || 15000),
  });
  if (!response.ok) {
    return {
      is_fit: true,
      score: 0,
      is_rate_limited: true,
      reason: 'Qualification Failed — Retry'
    };
  }
  const data = await response.json();
  const raw = data.response?.trim() || '{}';
  return parseQualifierResponse(raw, profile);
}

// ─── MAIN ROUTER — reads AI_PROVIDER env variable ────────────────────────────
async function validateCompany(
  candidate: { title: string; description: string; url: string },
  profile: ServiceProfile,
  country: string = 'Global',
  region: string = '',
  keyword: string = ''
): Promise<B2BQualifierResult> {
  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();

  console.log(`[AI Qualifier] Provider: ${provider.toUpperCase()} | ${candidate.url}`);

  try {
    if (provider === 'ollama') {
      const result = await validateWithOllama(candidate, profile, country, region, keyword);
      console.log(`[Ollama] fit:${result.is_fit} score:${result.score} | ${result.reason}`);
      return result;
    } else {
      // Default: groq
      const result = await validateWithGroq(candidate, profile, country, region, keyword);
      console.log(`[Groq]   fit:${result.is_fit} score:${result.score} | ${result.reason}`);
      return result;
    }
  } catch (err) {
    console.error(`[AI Qualifier] ${provider} failed:`, err);
    return {
      is_fit: true,
      score: 0,
      is_rate_limited: true,
      reason: 'Qualification Failed — Retry'
    };
  }
}


function isValidBusinessUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsedUrl.pathname.toLowerCase();

    // Strip academic / government TLDs & subdomains globally (including .canada.ca, .gc.ca, .gov.ca)
    if (domain.endsWith('.canada.ca') || domain === 'canada.ca' || domain.endsWith('.gc.ca') || domain === 'gc.ca' || /\.(gov|gov\.ca|gov\.uk|gov\.au|gov\.in|gov\.sg|gov\.ae|gov\.pk|mun\.ca|gouv\.qc\.ca|gov\.on\.ca|gov\.bc\.ca|gov\.ab\.ca|gov\.mb\.ca|gov\.sk\.ca|gov\.ns\.ca|gov\.nb\.ca|gov\.nl\.ca|gov\.pe\.ca|edu|mil|ac\.uk|edu\.au|ac\.jp|go\.jp|ed\.jp|ac\.kr|ac\.cn|ac\.nz|edu\.sg|edu\.in|ac\.in)$/i.test(domain)) return false;
    // Catch subdomains of academic/gov institutions
    if (/\.ac\.jp$/i.test(domain) || /\.go\.jp$/i.test(domain)) return false;

    // Hard blacklist & junk domain checks
    if (isHostBlacklisted(domain, HARD_BLACKLIST) || isHostBlacklisted(domain, JUNK_DOMAINS)) return false;

    // Reject directory listing URL paths (Issue 1)
    if (/\/(companies|company-directory|company-list|company-search|type|list|category|categories|directory|top-[^\/]+|best-[^\/]+|companies-in-[^\/]+|search|suppliers|manufacturers|vendors|industry\/[^\/]+|industries\/[^\/]+)(\/|$)/i.test(pathname)) return false;

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
  // Derive clean domain brand fallback (e.g. fanuc.co.jp → Fanuc)
  const domainParts = domain.split('.')[0].replace(/-/g, ' ');
  const domainBrand = domainParts
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

  if (!title) return domainBrand;

  // Clean HTML artifacts
  let cleanTitle = title.replace(/&amp;/g, '&').replace(/&[a-z]+;/gi, '').trim();

  // Remove common prefix noise like "10 Best...", "Top 10...", "Home - "
  cleanTitle = cleanTitle.replace(/^(top\s+\d+|best\s+\d+|\d+\s+best|\d+\s+top|home|welcome|about us|contact us)\s*[:|\-\u2013\u2014]\s*/i, '');

  // Split title by common separators (| - — – :)
  const parts = cleanTitle.split(/\s*[\|\-\u2013\u2014:]\s*/).map(p => p.trim()).filter(Boolean);

  const genericTokens = [
    'home', 'homepage', 'welcome', 'about', 'about us', 'contact', 'contact us',
    'official site', 'official website', 'index', 'services', 'solutions', 'products',
    'overview', 'company', 'inc', 'ltd', 'llc', 'corp', 'co', 'gmbh', 'sa', 'pty'
  ];

  // Find the first non-generic token that represents the company name
  let candidateName = '';
  for (const part of parts) {
    const pLower = part.toLowerCase();
    if (genericTokens.includes(pLower)) continue;
    if (/\b(top\s+\d+|\d+\s+best|list of|directory)\b/i.test(pLower)) continue;
    if (part.length >= 2 && part.length <= 55) {
      candidateName = part;
      break;
    }
  }

  if (!candidateName || candidateName.length < 3 || candidateName.length > 60) {
    return domainBrand;
  }

  // Strip trailing noise
  candidateName = candidateName
    .replace(/\s*(official site|home|welcome|inc\.?|ltd\.?|llc|corp\.?)$/i, '')
    .trim();

  return candidateName || domainBrand;
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

const INVALID_EMAIL_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff',
  'css', 'js', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'webm', 'pdf', 'zip'
]);

const EMAIL_EXCLUDED_KEYWORDS = [
  'bootstrap', 'jquery', 'wp-content', 'theme', 'plugin', 'template',
  'example.com', 'yourdomain', 'logo', 'noreply', 'no-reply', 'sentry',
  'wixpress.com', 'schema.org', 'sprite', 'retina', 'w3.org', 'domain.com', 'email.com'
];

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return false;
  if (/@\d+(\.\d+)?x/i.test(clean)) return false; // Reject retina image syntax like @2x, @3x
  const ext = clean.split('.').pop() || '';
  if (INVALID_EMAIL_EXTENSIONS.has(ext)) return false;
  if (EMAIL_EXCLUDED_KEYWORDS.some(kw => clean.includes(kw))) return false;
  return true;
}

function extractContacts(text: string): { email?: string; phone?: string } {
  const allEmails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const email = allEmails.find(em => isValidEmail(em));

  const phoneMatches = text.match(/(\+?[\d][\d\s\-\.\(\)]{6,18}[\d])/g) || [];
  let phone: string | undefined;
  for (const match of phoneMatches) {
    const raw = match.trim();
    const digits = raw.replace(/\D/g, '');

    // Length check: valid phone = 7–15 digits
    if (digits.length < 7 || digits.length > 15) continue;

    // Reject year-range patterns: e.g. "2002-2008", "2018-2022", "2022-2023"
    // These look like NNNN-NNNN where both parts are 4-digit numbers
    if (/^\d{4}[\s\-\.]+\d{4}$/.test(raw.trim())) continue;

    // Reject year-like starts: 19xx or 20xx at beginning
    if (/^(19|20)\d{2}/.test(digits)) continue;

    // Reject all-same-digit (00000000, 11111111)
    if (/^(\d)\1+$/.test(digits)) continue;

    // Reject sequential ascending runs (1234567, 12345678)
    const isSequential = [...digits].every((d, i, a) =>
      i === 0 || parseInt(d) === parseInt(a[i - 1]) + 1
    );
    if (isSequential) continue;

    // Reject sequential descending runs (9876543)
    const isDescending = [...digits].every((d, i, a) =>
      i === 0 || parseInt(d) === parseInt(a[i - 1]) - 1
    );
    if (isDescending) continue;

    phone = raw;
    break;
  }

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

  const params: Record<string, string> = {
    q: query,
    format: 'json',
    categories: 'general',
    language: lang,
    pageno: String(pageno),
    safesearch: '0',
  };

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
  const ms = 300 + Math.random() * 400;
  console.log(`[Throttle] ${Math.round(ms)} ms pause`);
  return new Promise(r => setTimeout(r, ms));
}

// ─── Query Mutation Vectors for WTechX Discovery Engine ──────────────────────
const QUERY_MUTATIONS = [
  (k: string, c: string) => `${k} company ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} manufacturer ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} supplier ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} industrial ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} plant ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} factory ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} enterprise ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} systems ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} solutions ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `B2B ${k} ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `${k} corporate ${c}`.replace(/\s+/g, ' ').trim(),
  (k: string, c: string) => `top ${k} companies ${c}`.replace(/\s+/g, ' ').trim(),
];

// ─── Core Discovery ───────────────────────────────────────────────────────────
async function discoverCompanies(
  keyword: string,
  country: string,
  targetCount: number = TARGET_COMPANY_COUNT,
  startTime: number,
  resetCursor: boolean = false,
  profile: ServiceProfile = getServiceProfile(),
  city: string = ''
): Promise<CompanyResult[]> {

  resetGroq429Count();
  const cleanCountry = country && country !== 'All Countries' ? country : '';
  const cleanCity = city ? city.trim() : '';
  const searchLocation = cleanCity ? `${cleanCity}, ${cleanCountry}`.trim() : cleanCountry;
  const queryKey = buildQueryKey(keyword, searchLocation || country);

  // Read ledger — cursor + processed domains
  const ledger = readLedger();
  if (resetCursor && ledger.query_progress[queryKey]) {
    delete ledger.query_progress[queryKey];
    writeLedger(ledger);
    console.log(`[Cursor] Cache-clear triggered. Reset cursor for "${queryKey}".`);
  }

  const processedSet = new Set<string>(
    resetCursor ? [] : ledger.processed_domains.map(d => d.toLowerCase())
  );
  const lastPage = ledger.query_progress[queryKey] ?? 0;
  const startPage = lastPage + 1;

  // 1. Dynamic Query Mutation Selection
  let mutationSeed = Math.floor(lastPage / 5) % QUERY_MUTATIONS.length;
  let currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, searchLocation);

  console.log(`[Cursor] "${queryKey}" lastPage=${lastPage} → starting page ${startPage} (Mutation Seed #${mutationSeed}: "${currentQuery}")`);
  console.log(`[Ledger] ${processedSet.size} domains already processed`);

  // Candidate buffer
  const candidates: {
    name: string; website: string; domain: string;
    snippet: string; trustScore: number; isRateLimited?: boolean;
    email?: string; phone?: string;
    matchedService?: string; matchReason?: string;
    outreachAngle?: string; personalizationHook?: string; redFlags?: string;
  }[] = [];

  let currentPage = startPage;
  let consecutiveEmpty = 0;
  let lastGoodPage = lastPage;
  const hardPageLimit = startPage + 40; // Continuous offset advancement limit

  // ── Guaranteed buffer-fill while loop ────────────────────────────────────
  while (candidates.length < targetCount && currentPage <= hardPageLimit) {
    if (Date.now() - startTime > 360_000) {
      console.warn('[Loop] Safety time limit (360s / 6m) approaching — stopping loop.');
      break;
    }

    const rawResults = await fetchSearXNG(currentQuery, currentPage, cleanCountry);

    // 3. Graceful Engine Offset Bounds Handler
    if (rawResults.length === 0) {
      consecutiveEmpty++;
      console.log(`[Loop] Page ${currentPage}: empty query vector hit.`);
      mutationSeed = (mutationSeed + 1) % QUERY_MUTATIONS.length;
      if (mutationSeed === 0 && candidates.length >= targetCount) {
        console.log('[Loop] Target reached across query vectors.');
        break;
      }
      currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, searchLocation);
      console.log(`[Query Vector Switch] Advancing to mutation vector #${mutationSeed}: "${currentQuery}" from page 1.`);
      currentPage = 1;
      consecutiveEmpty = 0;
      await humanDelay();
      continue;
    }

    consecutiveEmpty = 0;

    // Filter: keep only real business pages, skip ledger duplicates
    let addedThisPage = 0;

    // ── Stage 1: Zero-cost pre-filter all items on this page (no LLM yet) ──
    const survivors: SearXNGResult[] = [];
    for (const item of rawResults) {
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
      if (!passesCountryFilter(item.url, item.title, item.content || '', cleanCountry)) continue;
      survivors.push(item);
    }

    console.log(`[PreFilter] Page ${currentPage}: ${rawResults.length} raw → ${survivors.length} survivors for AI`);

    // If a query vector yields 0 survivors on the current page, auto-advance to next page unless 3 consecutive pages yield 0, then try next query vector
    if (survivors.length === 0 && rawResults.length > 0) {
      console.log(`[PreFilter] Page ${currentPage} yielded 0 survivors out of ${rawResults.length} raw hits. Continuing to page ${currentPage + 1}...`);
    }

    // Auto-advance query vector if current vector reaches page 2+ with few survivors, ensuring fast multi-vector discovery
    if (currentPage >= 2 && survivors.length < 2 && candidates.length < targetCount) {
      mutationSeed = (mutationSeed + 1) % QUERY_MUTATIONS.length;
      currentQuery = QUERY_MUTATIONS[mutationSeed](keyword, searchLocation);
      console.log(`[Query Vector Adaptive Switch] Advancing to query vector #${mutationSeed}: "${currentQuery}"`);
      currentPage = 1;
      consecutiveEmpty = 0;
    }
    // ── Stage 2: Sequential Paced AI Qualifier (1 candidate at a time + 500ms pacing delay) ──
    for (let i = 0; i < survivors.length && candidates.length < targetCount; i++) {
      if (i > 0) {
        // Pacing delay between single calls to keep token usage smooth & avoid hitting 429 rate limit spikes
        await new Promise(r => setTimeout(r, 500));
      }
      const item = survivors[i];
      const domain = getDomain(item.url);
      console.log(`[AI Qualifier] Checking (${i + 1}/${survivors.length}): ${item.url}`);
      const qualResult = await validateCompany({
        title: item.title || domain,
        description: (item.content || '').slice(0, 300),
        url: item.url,
      }, profile, cleanCountry || 'Global', cleanCity, keyword);

      if (!qualResult.is_fit || qualResult.is_rate_limited || qualResult.score === 0) {
        console.log(`[B2B Qualifier] Filtered out failed/unqualified candidate: ${item.url} (fit:${qualResult.is_fit}, score:${qualResult.score})`);
        continue;
      }
      if (candidates.length >= targetCount) break;
      const name = qualResult.company_name || cleanCompanyName(item.title, domain);
      const contacts = extractContacts(item.content || '');
      const isRateLimited = Boolean(qualResult.is_rate_limited);
      const trustScore = isRateLimited ? 0 : qualResult.score;
      const reason = isRateLimited ? 'Qualification Failed — Retry' : (qualResult.reason || (item.content || '').slice(0, 300).trim());

      candidates.push({
        name, website: item.url, domain,
        snippet: reason,
        trustScore: trustScore,
        isRateLimited: isRateLimited,
        email: contacts.email, phone: contacts.phone,
        matchedService: qualResult.matched_service,
        matchReason: qualResult.match_reason,
        outreachAngle: qualResult.outreach_angle,
        personalizationHook: qualResult.personalization_hook,
        redFlags: qualResult.red_flags,
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
      let crawlLinkedin: string | undefined = undefined;
      let crawlSource: ContactSource | undefined = undefined;

      try {
        const r = await fetch(`${backendUrl}/crawl-homepage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_name: c.name, website_url: c.website }),
          signal: AbortSignal.timeout(20000),
        });
        if (r.ok) {
          const d = await r.json();
          if (!crawlSnippet && d.summary?.length > 10) crawlSnippet = d.summary;
          if (d.email) crawlEmail = d.email;
          if (d.phone) crawlPhone = d.phone;
          if (d.linkedin_url) crawlLinkedin = d.linkedin_url;
          if (d.contact_source) crawlSource = d.contact_source;
        }
      } catch {
        // silent fallback — search snippet is used
      }

      const isRateLimited = Boolean(c.isRateLimited || c.snippet?.includes('Qualification Failed'));
      if (isRateLimited || (c.trustScore ?? 0) === 0) {
        return null;
      }
      const finalTrustScore = c.trustScore ?? 80;
      const finalTrustStatus = finalTrustScore >= 80 ? 'High Fit' : 'Medium Fit';

      return {
        id: `co-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        name: c.name,
        website: c.website,
        displayUrl: c.domain,
        domain: c.domain,
        industry: keyword,
        country: cleanCountry || 'Global',
        snippet: crawlSnippet || `${c.name} is a company operating in the ${keyword} industry.`,
        trustScore: finalTrustScore,
        fit_score: finalTrustScore,
        trustStatus: finalTrustStatus,
        initials: getInitials(c.name),
        logoUrl: `https://logo.clearbit.com/${c.domain}`,
        email: crawlEmail,
        phone: crawlPhone,
        linkedin: crawlLinkedin,
        contactSource: crawlSource,
        enriched: Boolean(crawlEmail || crawlPhone),
        matchedService: c.matchedService,
        matchReason: c.matchReason,
        outreachAngle: c.outreachAngle,
        personalizationHook: c.personalizationHook,
        redFlags: c.redFlags,
      } as CompanyResult;
    })
  ).then(results => results.filter(Boolean) as CompanyResult[]);

  const seen = new Set<string>();
  const deduped = crawled.filter(company => {
    const root = company.domain
      .replace(/^www\./, '')
      .toLowerCase();
    if (seen.has(root)) return false;
    seen.add(root);
    return true;
  });

  if (deduped.length > 0 || lastGoodPage > lastPage) {
    const updatedDomains = [
      ...Array.from(processedSet),
      ...deduped.map(r => r.domain.toLowerCase()),
    ].filter((v, i, a) => a.indexOf(v) === i);

    writeLedger({
      processed_domains: updatedDomains,
      query_progress: { ...ledger.query_progress, [queryKey]: lastGoodPage },
    });

    console.log(`[Cursor] "${queryKey}" → saved page ${lastGoodPage}. Next run starts page ${lastGoodPage + 1}.`);
    console.log(`[Ledger] ${updatedDomains.length} domains total.`);
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Discovery Summary] Total companies found: ${deduped.length}/${targetCount} | Total Groq 429 retries: ${globalGroq429Count} | Total time taken: ${elapsedSec}s`);

  return deduped;
}

// ─── Route Handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim() || '';
  const country = searchParams.get('country')?.trim() || '';
  const city = searchParams.get('city')?.trim() || '';
  const resetCursor = searchParams.get('resetCursor') === 'true' || searchParams.get('clearCache') === 'true';

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
  }

  try {
    const results = await discoverCompanies(keyword, country, TARGET_COMPANY_COUNT, Date.now(), resetCursor, getServiceProfile(), city);
    const displayLocation = city ? `${city}, ${country}` : country;
    const res = NextResponse.json({ companies: results, query: `${keyword} companies in ${displayLocation || 'Global'}` });
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
    const city = body.city?.trim() || '';
    const resetCursor = Boolean(body.resetCursor || body.clearCache);
    const profile = getServiceProfile({
      our_company: body.our_company,
      our_services: body.our_services,
    });

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
    }

    console.log(`[Profile] Using: ${profile.ourCompany} | ${profile.ourServices}`);
    const results = await discoverCompanies(keyword, country, TARGET_COMPANY_COUNT, Date.now(), resetCursor, profile, city);
    const res = NextResponse.json({ companies: results, query: `${keyword} companies`, profile });
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    console.error('[POST] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

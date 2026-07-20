import { NextRequest, NextResponse } from 'next/server';

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
}

interface BackendEnrichResponse {
  emails: string[];
  stakeholder: string;
  context_snippet: string;
  found: boolean;
}

async function searchSearXNG(query: string): Promise<SearXNGResult[]> {
  const base = process.env.SEARXNG_URL || 'http://localhost:8085';
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'general',
    engines: 'bing,brave,qwant',
    language: 'en'
  });
  try {
    const res = await fetch(`${base}/search?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []) as SearXNGResult[];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company')?.trim() || '';
  const domain  = searchParams.get('domain')?.trim()  || '';

  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 });

  try {
    // 1. Resolve company website URL
    let websiteUrl = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';
    if (!websiteUrl) {
      const searchResults = await searchSearXNG(`"${company}" B2B official website`);
      if (searchResults.length > 0) {
        websiteUrl = searchResults[0].url;
      } else {
        websiteUrl = `https://www.${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      }
    }

    // 2. Resolve LinkedIn company page from SearXNG
    const linkedinPromise = searchSearXNG(`"${company}" linkedin.com/company`);

    // 3. Call backend Crawl4AI enrichment endpoint
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const backendPromise = fetch(`${backendUrl}/enrich-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: company,
        website_url: websiteUrl
      }),
      signal: AbortSignal.timeout(90000)
    }).then(async res => {
      if (!res.ok) throw new Error("Backend failed");
      return res.json() as Promise<BackendEnrichResponse>;
    }).catch(err => {
      console.warn("Backend enrichment failed, falling back:", err);
      return { emails: [], stakeholder: 'Not found', context_snippet: 'Not found', found: false } as BackendEnrichResponse;
    });

    const [linkedinResults, backendData] = await Promise.all([
      linkedinPromise,
      backendPromise
    ]);

    // Parse LinkedIn company URL
    let linkedinUrl: string | null = null;
    for (const r of linkedinResults.slice(0, 5)) {
      if (r.url.includes('linkedin.com/company')) {
        linkedinUrl = r.url.split('?')[0];
        break;
      }
      const match = r.content.match(/linkedin\.com\/company\/[a-zA-Z0-9\-_]+/);
      if (match) { linkedinUrl = `https://www.${match[0]}`; break; }
    }

    if (!linkedinUrl) {
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      linkedinUrl = `https://www.linkedin.com/company/${slug}`;
    }

    // Map phones to array of strings for existing client detail page compatibility
    const phonesList = Array.isArray(backendData.phones)
      ? backendData.phones.map((p: any) => typeof p === 'object' ? p.number : p)
      : [];

    return NextResponse.json({
      emails: backendData.emails,
      stakeholder: backendData.stakeholder,
      context_snippet: backendData.context_snippet,
      email_source_context: backendData.email_source_context || 'Extracted from page content',
      phones: phonesList,
      
      // New objects mapping for frontend flexibility
      primary_email: backendData.primary_email || (backendData.emails?.[0] ?? null),
      all_emails: backendData.all_emails || [],
      raw_phones: backendData.phones || [],
      linkedin_company: backendData.linkedin_company || linkedinUrl,
      
      linkedinUrl: backendData.linkedin_company || linkedinUrl,
      found: backendData.found || (backendData.emails && backendData.emails.length > 0)
    });

  } catch (err) {
    console.error('Enrich contacts error:', err);
    return NextResponse.json({ emails: [], phones: [], stakeholder: 'Not found', context_snippet: 'Not found', linkedinUrl: null, found: false });
  }
}

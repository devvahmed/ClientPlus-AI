import { NextRequest, NextResponse } from 'next/server';

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
}

interface BackendEnrichResponse {
  primary_email?: string | null;
  all_emails?: string[];
  emails?: string[];
  phones?: string[];
  linkedin_company?: string | null;
  linkedin_people?: string[];
  contact_page_url?: string | null;
  source_label?: string;
  source_context?: string;
  email_source_context?: string;
  source_page?: string;
  email_meta?: any[];
  stakeholder?: string;
  context_snippet?: string;
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

async function processEnrichment(companyName: string, websiteUrl: string) {
  let finalWebsite = websiteUrl ? (websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`) : '';
  if (!finalWebsite && companyName) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    finalWebsite = `https://www.${slug}.com`;
  }

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  let backendData: BackendEnrichResponse;

  try {
    const res = await fetch(`${backendUrl}/enrich-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: companyName,
        website_url: finalWebsite
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error("Backend failed");
    backendData = await res.json();
  } catch (err) {
    console.warn("Backend enrichment fallback:", err);
    backendData = {
      primary_email: null, all_emails: [], emails: [], phones: [],
      linkedin_company: null, linkedin_people: [], contact_page_url: null,
      source_label: 'Not found', source_context: 'Not found', found: false
    };
  }

  const emails = backendData.all_emails || backendData.emails || [];
  const primaryEmail = backendData.primary_email || (emails.length > 0 ? emails[0] : null);
  const phones = backendData.phones || [];
  const linkedinCompanyUrl = backendData.linkedin_company || null;

  return {
    primary_email: primaryEmail,
    all_emails: emails,
    emails: emails,
    phones: phones,
    linkedin_company: linkedinCompanyUrl,
    linkedin_people: backendData.linkedin_people || [],
    linkedinUrl: linkedinCompanyUrl,
    contact_page_url: backendData.contact_page_url || `${finalWebsite.replace(/\/+$/, '')}/contact-us`,
    source_label: backendData.source_label || 'Contact Page',
    source_context: backendData.source_context || backendData.email_source_context || 'Extracted from page content',
    email_source_context: backendData.source_context || backendData.email_source_context || 'Extracted from page content',
    stakeholder: backendData.stakeholder || 'Not found',
    context_snippet: backendData.context_snippet || 'Not found',
    email_meta: backendData.email_meta || [],
    found: Boolean(backendData.found || primaryEmail || emails.length > 0 || phones.length > 0 || linkedinCompanyUrl)
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company')?.trim() || searchParams.get('company_name')?.trim() || '';
  const domain  = searchParams.get('domain')?.trim()  || searchParams.get('website_url')?.trim() || '';

  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 });

  try {
    const result = await processEnrichment(company, domain);
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET Enrich contacts error:', err);
    return NextResponse.json({
      primary_email: null, all_emails: [], emails: [], phones: [],
      linkedin_company: null, linkedin_people: [], linkedinUrl: null,
      contact_page_url: null, source_label: 'Not found', source_context: 'Not found',
      found: false
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const company = body.company_name?.trim() || body.company?.trim() || '';
    const websiteUrl = body.website_url?.trim() || body.website?.trim() || body.domain?.trim() || '';

    if (!company) return NextResponse.json({ error: 'company_name is required' }, { status: 400 });

    const result = await processEnrichment(company, websiteUrl);
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST Enrich contacts error:', err);
    return NextResponse.json({
      primary_email: null, all_emails: [], emails: [], phones: [],
      linkedin_company: null, linkedin_people: [], linkedinUrl: null,
      contact_page_url: null, source_label: 'Not found', source_context: 'Not found',
      found: false
    });
  }
}


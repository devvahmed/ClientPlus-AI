import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_name, website_url } = body;

    if (!company_name || !website_url) {
      return NextResponse.json(
        { error: 'company_name and website_url are required' },
        { status: 400 }
      );
    }

    const envBackend = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    const backendUrl = (!envBackend || envBackend.startsWith('/')) ? 'http://localhost:8000' : envBackend.replace(/\/$/, '');

    const res = await fetch(`${backendUrl}/deep-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name, website_url }),
      signal: AbortSignal.timeout(90000), // 90s — thorough single-company crawl
    });

    if (!res.ok) throw new Error('Deep enrich backend failed');
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Deep Enrich Route] error:', err);
    return NextResponse.json({
      primary_email: null,
      all_emails: [],
      emails: [],
      phones: [],
      email_meta: [],
      linkedin_company: null,
      linkedin_people: [],
      contact_page_url: null,
      found: false,
    });
  }
}

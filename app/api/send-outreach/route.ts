import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_name, company_description, contact_email, subject, body: emailBody } = body;

    if (!company_name || !contact_email) {
      return NextResponse.json(
        { error: 'company_name and contact_email are required' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8000';

    const res = await fetch(`${backendUrl}/send-outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name,
        company_description: company_description || `${company_name} lead`,
        contact_email,
        subject,
        body: emailBody,
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!res.ok) {
      let errorMsg = `Backend error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      } catch {
        const errText = await res.text().catch(() => '');
        if (errText) errorMsg = errText;
      }
      return NextResponse.json({ error: errorMsg }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Send Outreach Proxy Route] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send outreach email via backend' },
      { status: 500 }
    );
  }
}

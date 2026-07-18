import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

function extractDomain(input: string): string | null {
  try {
    const normalized = input.startsWith('http') ? input : `https://${input}`;
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function enrichWithHunter(website?: string) {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !website) return { email: null as string | null, phone: null as string | null };

  const domain = extractDomain(website);
  if (!domain) return { email: null as string | null, phone: null as string | null };

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&type=personal&api_key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { email: null as string | null, phone: null as string | null };
    }

    const data = await res.json();
    const emails = (data?.data?.emails as Array<{ value?: string; confidence?: number; position?: string }> | undefined) ?? [];

    const best = [...emails].sort((a, b) => {
      const aScore = (a.confidence ?? 0) + (a.position ? 10 : 0);
      const bScore = (b.confidence ?? 0) + (b.position ? 10 : 0);
      return bScore - aScore;
    })[0];

    return {
      email: best?.value ?? null,
      phone: (data?.data?.phone_number as string | undefined) ?? null,
    };
  } catch {
    return { email: null as string | null, phone: null as string | null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, website, industry, country, trustScore, relevanceReason, status, email, phone, logoUrl } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const hunter = await enrichWithHunter(website);

    const finalEmail = email || hunter.email || null;
    const finalPhone = phone || hunter.phone || null;

    // Try full insert with all new columns first
    const fullRecord = {
      name,
      website: website || null,
      industry: industry || null,
      country: country || null,
      trust_score: trustScore ?? null,
      relevance_reason: relevanceReason || null,
      status: status || 'Pending',
      email: finalEmail,
      phone: finalPhone,
      logo_url: logoUrl || null,
    };

    let { data, error } = await supabase
      .from('clients')
      .insert([fullRecord])
      .select()
      .single();

    // If columns don't exist yet, fall back to base schema only
    if (error && error.message?.includes('column')) {
      console.warn('New columns missing, falling back to base schema:', error.message);
      const fallback = await supabase
        .from('clients')
        .insert([{
          name,
          website: website || null,
          industry: industry || null,
          country: country || null,
          trust_score: trustScore ?? null,
          relevance_reason: relevanceReason || null,
          status: status || 'Pending',
        }])
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, client: data });
  } catch (err) {
    console.error('Save client error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save client' },
      { status: 500 }
    );
  }
}

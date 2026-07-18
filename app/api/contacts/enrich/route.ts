import { NextRequest, NextResponse } from 'next/server';

interface HunterEmail {
  value?: string;
  first_name?: string;
  last_name?: string;
  confidence?: number;
  position?: string;
}

interface HunterResponse {
  data?: {
    emails?: HunterEmail[];
    organization?: string;
    phone_number?: string | null;
  };
}

function extractDomain(input: string): string | null {
  try {
    const normalized = input.startsWith('http') ? input : `https://${input}`;
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function pickBestEmail(emails: HunterEmail[] = []): HunterEmail | null {
  if (!emails.length) return null;

  const scored = [...emails].sort((a, b) => {
    const aScore = (a.confidence ?? 0) + (a.position ? 10 : 0);
    const bScore = (b.confidence ?? 0) + (b.position ? 10 : 0);
    return bScore - aScore;
  });

  return scored[0] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'HUNTER_API_KEY is missing' }, { status: 500 });
    }

    const body = await req.json();
    const website = String(body.website ?? '').trim();
    const domainInput = String(body.domain ?? '').trim();

    const domain = domainInput || extractDomain(website || '') || null;
    if (!domain) {
      return NextResponse.json({ error: 'A valid website or domain is required' }, { status: 400 });
    }

    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&type=personal&api_key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Hunter request failed: ${text || response.statusText}` },
        { status: 502 }
      );
    }

    const hunterData = (await response.json()) as HunterResponse;
    const best = pickBestEmail(hunterData.data?.emails ?? []);

    return NextResponse.json({
      domain,
      email: best?.value ?? null,
      firstName: best?.first_name ?? null,
      lastName: best?.last_name ?? null,
      contactName: [best?.first_name, best?.last_name].filter(Boolean).join(' ') || null,
      jobTitle: best?.position ?? null,
      confidence: best?.confidence ?? null,
      companyPhone: hunterData.data?.phone_number ?? null,
      source: 'hunter',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to enrich contact' },
      { status: 500 }
    );
  }
}

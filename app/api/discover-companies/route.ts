import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Thin Proxy: forward all discovery requests to the Python backend on Render.
// The heavy discovery loop (SearXNG + AI qualifier) now runs in FastAPI with
// no timeout limit. This file used to be 1400+ lines; it is now ~40 lines.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:8000';

async function proxyToBackend(body: object): Promise<NextResponse> {
  const resp = await fetch(`${BACKEND_URL}/discover-companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 min — backend handles all the work
  });

  const data = await resp.json();
  const res = NextResponse.json(data, { status: resp.status });
  res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

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
    return await proxyToBackend({ keyword, country, city, reset_cursor: resetCursor });
  } catch (err) {
    console.error('[GET Proxy] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = body.keyword?.trim() || '';

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
    }

    // Forward all fields including optional our_company / our_services overrides
    return await proxyToBackend({
      keyword,
      country: body.country?.trim() || '',
      city: body.city?.trim() || '',
      target_count: body.targetCount ?? body.target_count ?? 10,
      reset_cursor: Boolean(body.resetCursor || body.clearCache || body.reset_cursor),
      our_company: body.our_company,
      our_services: body.our_services,
    });
  } catch (err) {
    console.error('[POST Proxy] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

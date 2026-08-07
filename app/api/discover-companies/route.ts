import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Thin Proxy: forward all discovery requests to the Python backend on Render/local.
// The heavy discovery loop runs in FastAPI with no timeout limit.
// ─────────────────────────────────────────────────────────────────────────────

function getBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!envUrl || envUrl.startsWith('/')) {
    return 'http://localhost:8000';
  }
  return envUrl.replace(/\/$/, '');
}

async function proxyToBackend(body: object, authHeader?: string | null): Promise<NextResponse> {
  const backendUrl = getBackendUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const resp = await fetch(`${backendUrl}/discover-companies`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  });

  if (!resp.ok) {
    let errorData = { error: 'Discovery backend failed.' };
    try {
      errorData = await resp.json();
    } catch {
      /* fallback */
    }
    return NextResponse.json(errorData, { status: resp.status });
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('ndjson') || contentType.includes('stream')) {
    return new NextResponse(resp.body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    });
  }

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
  const minTrustScore = searchParams.get('minTrustScore');
  const pageno = searchParams.get('pageno');
  const resetCursor = searchParams.get('resetCursor') === 'true' || searchParams.get('clearCache') === 'true';
  const authHeader = req.headers.get('authorization');

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({
      keyword,
      country,
      city,
      ...(minTrustScore ? { minTrustScore } : {}),
      ...(pageno ? { pageno } : {}),
      ...(resetCursor ? { reset_cursor: 'true' } : {}),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const resp = await fetch(`${getBackendUrl()}/discover-companies?${query.toString()}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(120_000),
    });

    if (resp.status === 405 || resp.status === 404) {
      return await proxyToBackend({
        keyword,
        country,
        city,
        minTrustScore: minTrustScore ? Number(minTrustScore) : undefined,
        pageno: pageno ? Number(pageno) : undefined,
        reset_cursor: resetCursor,
      }, authHeader);
    }

    if (!resp.ok) {
      let errorData = { error: 'Discovery failed.' };
      try {
        errorData = await resp.json();
      } catch {
        /* fallback */
      }
      return NextResponse.json(errorData, { status: resp.status });
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('ndjson') || contentType.includes('stream')) {
      return new NextResponse(resp.body, {
        status: resp.status,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      });
    }

    const data = await resp.json();
    const res = NextResponse.json(data, { status: resp.status });
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    console.warn('[GET Proxy] GET forward failed, trying POST fallback:', err);
    return await proxyToBackend({
      keyword,
      country,
      city,
      minTrustScore: minTrustScore ? Number(minTrustScore) : undefined,
      pageno: pageno ? Number(pageno) : undefined,
      reset_cursor: resetCursor,
    }, authHeader);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = body.keyword?.trim() || '';
    const authHeader = req.headers.get('authorization');

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword is required.' }, { status: 400 });
    }

    return await proxyToBackend({
      keyword,
      country: body.country?.trim() || '',
      city: body.city?.trim() || '',
      minTrustScore: body.minTrustScore ?? body.min_trust_score,
      pageno: body.pageno ?? body.page ?? 1,
      target_count: body.targetCount ?? body.target_count ?? 10,
      reset_cursor: Boolean(body.resetCursor || body.clearCache || body.reset_cursor),
      our_company: body.our_company,
      our_services: body.our_services,
    }, authHeader);
  } catch (err) {
    console.error('[POST Proxy] Fatal:', err);
    return NextResponse.json({ error: 'Discovery failed.' }, { status: 500 });
  }
}

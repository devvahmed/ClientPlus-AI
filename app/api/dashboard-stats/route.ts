import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!envUrl || envUrl.startsWith('/')) {
    return 'http://localhost:8000';
  }
  return envUrl.replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { detail: 'Missing Authorization header' },
        { status: 401 }
      );
    }

    const backendUrl = `${getBackendUrl()}/auth/dashboard-stats`;
    const resp = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error('[Dashboard Stats Proxy Error]:', err);
    return NextResponse.json(
      { detail: 'Failed to fetch dashboard statistics.' },
      { status: 500 }
    );
  }
}

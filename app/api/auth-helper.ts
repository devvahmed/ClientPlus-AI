import { NextRequest } from 'next/server';

export interface AuthenticatedCompany {
  id: number;
  name: str;
  email: string;
  website?: string | null;
  industry?: string | null;
  services?: string | null;
  target_customers?: string | null;
  description?: string | null;
  logo_path?: string | null;
}

export async function getAuthenticatedCompany(req: NextRequest): Promise<AuthenticatedCompany | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const cleanBackendUrl = backendUrl.replace(/\/$/, '');

  try {
    const res = await fetch(`${cleanBackendUrl}/auth/me`, {
      method: 'GET',
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    const company: AuthenticatedCompany = await res.json();
    return company;
  } catch (err) {
    console.error('[Auth Helper] Error validating token with backend:', err);
    return null;
  }
}

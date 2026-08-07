export interface CompanyProfile {
  id: number;
  name: string;
  email: string;
  website?: string | null;
  industry?: string | null;
  services?: string | null;
  target_customers?: string | null;
  description?: string | null;
}

export function setAuthToken(token: string, company?: CompanyProfile) {
  if (typeof window !== 'undefined') {
    // Set cookie for Next.js middleware access (30 days expiration)
    document.cookie = `token=${token}; path=/; max-age=2592000; SameSite=Lax`;
    localStorage.setItem('auth_token', token);
    if (company) {
      localStorage.setItem('company_profile', JSON.stringify(company));
    }
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Try cookie first
  const match = document.cookie.match(/(?:^|; )\s*token=([^;]*)/);
  if (match) return match[1];

  // Fallback to localStorage
  return localStorage.getItem('auth_token');
}

export function getSavedCompany(): CompanyProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('company_profile');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window !== 'undefined') {
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    localStorage.removeItem('auth_token');
    localStorage.removeItem('company_profile');
    window.location.href = '/login';
  }
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setAuthToken } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (loginEmail: string, loginPass: string, isDemo = false) => {
    setError(null);
    if (isDemo) {
      setDemoLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Authentication failed. Please check your credentials.');
      }

      // Save token and company profile
      setAuthToken(data.access_token, data.company);

      // Redirect to main sales dashboard
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setDemoLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }
    handleLogin(email, password, false);
  };

  const onDemoClick = () => {
    handleLogin('contact@wtechx.ai', 'SecurePassword123!', true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-surface-bright via-background to-surface-container-low">
      <div className="w-full max-w-md bg-white border border-outline-variant/80 rounded-3xl shadow-xl p-8 backdrop-blur-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/25 mb-3">
            <span className="material-symbols-outlined text-[28px]">auto_awesome</span>
          </div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">ClientPlus AI</h1>
          <p className="text-sm text-secondary mt-1">Sign in to your sales intelligence dashboard</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-error/10 border border-error/20 flex items-start gap-3">
            <span className="material-symbols-outlined text-error text-[20px] flex-shrink-0 mt-0.5">error</span>
            <p className="text-xs font-medium text-error leading-relaxed">{error}</p>
          </div>
        )}

        {/* Demo Account Button */}
        <div className="mb-6">
          <button
            type="button"
            onClick={onDemoClick}
            disabled={loading || demoLoading}
            className="w-full py-3 px-4 bg-amber-50 hover:bg-amber-100/80 border border-amber-300/80 text-amber-900 font-semibold rounded-2xl transition-all duration-200 shadow-sm flex items-center justify-center gap-2 group disabled:opacity-50 cursor-pointer"
          >
            {demoLoading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-amber-700 group-hover:scale-110 transition-transform">bolt</span>
            )}
            <span>Try Demo Account (WTechX)</span>
          </button>
          <p className="text-[11px] text-center text-secondary mt-1.5">Instantly explore with pre-configured WTechX AI dataset</p>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-outline-variant w-full" />
          <span className="bg-white px-3 text-[11px] text-secondary font-medium uppercase tracking-wider absolute">or sign in with email</span>
        </div>

        {/* Login Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Work Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-[20px]">
                mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-[20px]">
                lock
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || demoLoading}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-2xl transition-all shadow-md shadow-primary/20 mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Sign Up Link */}
        <div className="mt-8 text-center border-t border-outline-variant/60 pt-4">
          <p className="text-xs text-secondary">
            Don't have a company account yet?{' '}
            <Link href="/signup" className="text-primary font-semibold hover:underline">
              Create a Company Profile
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

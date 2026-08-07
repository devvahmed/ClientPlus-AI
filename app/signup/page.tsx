'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setAuthToken } from '@/lib/auth';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    website: '',
    industry: '',
    services: '',
    target_customers: '',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name || !formData.email || !formData.password) {
      setError('Company Name, Email, and Password are required fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to create company account.');
      }

      // Save token and company profile
      setAuthToken(data.access_token, data.company);

      // Redirect to main sales dashboard
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12 bg-gradient-to-br from-surface-bright via-background to-surface-container-low">
      <div className="w-full max-w-xl bg-white border border-outline-variant/80 rounded-3xl shadow-xl p-8 backdrop-blur-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/25 mb-3">
            <span className="material-symbols-outlined text-[28px]">domain_add</span>
          </div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Create Company Account</h1>
          <p className="text-sm text-secondary mt-1 text-center">Configure your company profile to enable AI-powered lead discovery and outreach</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-error/10 border border-error/20 flex items-start gap-3">
            <span className="material-symbols-outlined text-error text-[20px] flex-shrink-0 mt-0.5">error</span>
            <p className="text-xs font-medium text-error leading-relaxed">{error}</p>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
                Company Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={onChange}
                placeholder="Acme Technologies"
                required
                className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
                Work Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={onChange}
                placeholder="admin@acme.com"
                required
                className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={onChange}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
                Company Website
              </label>
              <input
                type="url"
                name="website"
                value={formData.website}
                onChange={onChange}
                placeholder="https://acme.com"
                className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Industry Sector
            </label>
            <input
              type="text"
              name="industry"
              value={formData.industry}
              onChange={onChange}
              placeholder="e.g. Artificial Intelligence, Commercial Bakery, Healthcare Software"
              className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Products, Solutions & Services
            </label>
            <textarea
              name="services"
              value={formData.services}
              onChange={onChange}
              rows={2}
              placeholder="Describe what your company builds or sells (e.g., Enterprise CRM automation, Industrial baking machinery)"
              className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Target Ideal Customers
            </label>
            <input
              type="text"
              name="target_customers"
              value={formData.target_customers}
              onChange={onChange}
              placeholder="e.g., B2B Tech Startups, Supermarkets, Logistics Firms"
              className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider mb-1.5">
              Company Overview / Value Proposition
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={onChange}
              rows={2}
              placeholder="Short summary of your business mission and ROI value proposition"
              className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-2xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-2xl transition-all shadow-md shadow-primary/20 mt-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <>
                <span>Register & Open Dashboard</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Sign In Link */}
        <div className="mt-6 text-center border-t border-outline-variant/60 pt-4">
          <p className="text-xs text-secondary">
            Already registered?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign In Here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

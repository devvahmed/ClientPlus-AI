'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ContactSource {
  url?: string;
  page?: string;
  label?: string;
  context?: string;
}

interface Company {
  id: string;
  name: string;
  website: string;
  displayUrl: string;
  domain: string;
  industry: string;
  country: string;
  snippet: string;
  trustScore: number;
  trustStatus: string;
  initials: string;
  logoUrl: string;
  email?: string;
  phone?: string;
  contactSource?: ContactSource;
  linkedin?: string;
  description?: string;
  saved?: boolean;
}

interface AnalysisResult {
  relevant: boolean;
  reason: string;
  loading?: boolean;
  error?: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
const LOGO_COLORS = [
  'bg-[#08478a]', 'bg-[#2e7d32]', 'bg-[#1565c0]',
  'bg-[#6a1b9a]', 'bg-[#00695c]', 'bg-[#c62828]',
  'bg-[#e65100]', 'bg-[#283593]',
];
function logoColor(index: number) { return LOGO_COLORS[index % LOGO_COLORS.length]; }

const fitBadgeColor: Record<string, string> = {
  'High Fit': 'bg-green-100 text-green-800',
  'Medium Fit': 'bg-blue-100 text-blue-800',
  'Low Fit': 'bg-yellow-100 text-yellow-800',
  Neutral: 'bg-surface-container text-secondary',
};
const trustBarColor = (score: number) => {
  if (score >= 85) return 'bg-green-500';
  if (score >= 65) return 'bg-primary';
  if (score >= 50) return 'bg-orange-400';
  return 'bg-red-400';
};

const COUNTRIES = [
  'All Countries', 'United States', 'United Kingdom', 'Canada',
  'Germany', 'Australia', 'India', 'Singapore', 'France', 'Netherlands',
  'Pakistan', 'UAE', 'Japan', 'Brazil', 'South Korea',
];
const MIN_TRUST_OPTIONS = [
  { label: 'Any', value: 0 }, { label: '50+', value: 50 },
  { label: '70+', value: 70 }, { label: '85+', value: 85 },
];

// ─── Company Logo (with fallback) ────────────────────────────────────────────
function CompanyLogo({ logoUrl, domain, initials, colorClass, size = 48 }: {
  logoUrl: string; domain: string; initials: string; colorClass: string; size?: number;
}) {
  const [useGoogleFallback, setUseGoogleFallback] = useState(false);
  const [failedAll, setFailedAll] = useState(false);

  if (failedAll) {
    return (
      <div
        className={`${colorClass} text-white font-bold flex items-center justify-center rounded-xl flex-shrink-0 select-none`}
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        {initials}
      </div>
    );
  }

  // Google Favicon Grabber as secondary fallback if Clearbit fails
  const currentSrc = useGoogleFallback
    ? `https://www.google.com/s2/favicons?sz=64&domain=${domain}`
    : logoUrl;

  return (
    <div
      className="bg-white border border-outline-variant flex items-center justify-center rounded-xl flex-shrink-0 overflow-hidden p-1"
      style={{ width: size, height: size }}
    >
      <img
        src={currentSrc}
        alt={initials}
        width={size - 8}
        height={size - 8}
        className="object-contain w-full h-full"
        onError={() => {
          if (!useGoogleFallback) {
            setUseGoogleFallback(true);
          } else {
            setFailedAll(true);
          }
        }}
      />
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.95 }}
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-[14px] font-semibold ${
        type === 'success' ? 'bg-[#2e7d32]' : 'bg-[#c62828]'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">
        {type === 'success' ? 'check_circle' : 'error'}
      </span>
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </motion.div>
  );
}

// ─── Analysis Modal ───────────────────────────────────────────────────────────
function AnalysisModal({
  company, analysis, onSave, onClose,
}: {
  company: Company; analysis: AnalysisResult; onSave: () => void; onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 sidebar-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-7 flex flex-col gap-5 z-10"
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 35 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <CompanyLogo logoUrl={company.logoUrl} domain={company.domain} initials={company.initials} colorClass={logoColor(0)} size={48} />
            <div>
              <h3 className="text-[17px] font-bold text-on-surface">{company.name}</h3>
              <a href={company.website} target="_blank" rel="noreferrer"
                className="text-[12px] text-secondary hover:text-primary transition-colors">
                {company.displayUrl}
              </a>
            </div>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container-low">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Contact details if available */}
        {(company.email || company.phone) && (
          <div className="flex flex-col gap-2 bg-surface-container-low rounded-xl p-3">
            {company.email && (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="material-symbols-outlined text-[15px] text-primary">email</span>
                <a href={`mailto:${company.email}`} className="text-on-surface hover:text-primary">{company.email}</a>
              </div>
            )}
            {company.phone && (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="material-symbols-outlined text-[15px] text-primary">call</span>
                <a href={`tel:${company.phone}`} className="text-on-surface hover:text-primary">{company.phone}</a>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {analysis.loading && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-surface-container" />
              <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
              <span className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-primary text-[22px]">psychology</span>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-on-surface">Analyzing company...</p>
              <p className="text-[13px] text-secondary mt-1">Scraping website & running AI analysis</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!analysis.loading && analysis.error && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-600 text-[28px]">error_outline</span>
            </div>
            <p className="text-[14px] text-secondary text-center">{analysis.error}</p>
          </div>
        )}

        {/* Result */}
        {!analysis.loading && !analysis.error && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <div className={`flex items-center gap-4 p-4 rounded-2xl border ${
              analysis.relevant ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                analysis.relevant ? 'bg-green-500' : 'bg-red-500'
              }`}>
                <span className="material-symbols-outlined text-white text-[26px] icon-fill">
                  {analysis.relevant ? 'check_circle' : 'cancel'}
                </span>
              </div>
              <div>
                <p className={`text-[13px] font-bold uppercase tracking-wider mb-1 ${
                  analysis.relevant ? 'text-green-700' : 'text-red-700'
                }`}>
                  {analysis.relevant ? 'Good Fit' : 'Not a Fit'}
                </p>
                <p className="text-[15px] font-medium text-on-surface leading-snug">{analysis.reason}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-secondary">
              <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
              AI analysis powered by Gemini · Based on website content
            </div>
          </motion.div>
        )}

        {/* Actions */}
        {!analysis.loading && (
          <div className="flex gap-3 pt-2 border-t border-outline-variant">
            <button onClick={onClose}
              className="flex-1 border border-outline-variant text-on-surface font-semibold text-[14px] py-2.5 rounded-xl hover:bg-surface-container-low transition-colors">
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={onSave}
              disabled={company.saved}
              className={`flex-1 font-semibold text-[14px] py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                company.saved ? 'bg-green-500 text-white cursor-default' : 'bg-primary text-white hover:bg-primary-container'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{company.saved ? 'check' : 'bookmark_add'}</span>
              {company.saved ? 'Saved!' : 'Save to Clients'}
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Company Card ─────────────────────────────────────────────────────────────
function CompanyCard({
  company, index, onAnalyze, onSave,
}: {
  company: Company; index: number; onAnalyze: (c: Company) => void; onSave: (c: Company) => void;
}) {
  return (
    <motion.div
      key={company.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
      whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(8,71,138,0.10)' }}
      className="bg-white rounded-2xl border border-outline-variant soft-shadow p-5 flex flex-col gap-3"
    >
      {/* Header: logo + name + badge */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CompanyLogo
            logoUrl={company.logoUrl || `https://logo.clearbit.com/${company.domain || 'example.com'}`}
            domain={company.domain || company.displayUrl || 'unknown'}
            initials={company.initials || (company.name || 'Co').slice(0, 2).toUpperCase()}
            colorClass={logoColor(index)}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-on-surface truncate">
              {company.name || company.domain || 'Unknown Company'}
            </h3>
            <p className="text-[12px] text-secondary truncate">
              {company.industry || 'Industry'} · {company.country || 'Global'}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0 ml-2 ${fitBadgeColor[company.trustStatus] ?? fitBadgeColor['Neutral']}`}>
          {company.trustStatus || 'High Fit'}
        </span>
      </div>

      {/* Snippet */}
      {(company.snippet || company.description) && (
        <div className="h-[76px] overflow-y-auto pr-1 hover:scrollbar-visible custom-scrollbar">
          <p className="text-[12px] text-on-surface leading-relaxed bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/50 min-h-full">
            {company.snippet || company.description}
          </p>
        </div>
      )}

      {/* Contact details & Source Reference */}
      <div className="flex flex-col gap-1.5 bg-surface-container-low rounded-xl px-3 py-2.5 border border-outline-variant/40">
        {/* Priority 1: Email */}
        {company.email ? (
          <div className="flex items-center justify-between text-[12px] text-on-surface">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[14px] text-primary flex-shrink-0">email</span>
              <a href={`mailto:${company.email}`} className="font-medium text-primary hover:underline truncate">{company.email}</a>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-secondary italic">
            <span className="material-symbols-outlined text-[13px] text-outline flex-shrink-0">mail_lock</span>
            <span>No email listed on main pages</span>
          </div>
        )}

        {/* Priority 2: Phone */}
        {company.phone && (
          <div className="flex items-center gap-1.5 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-primary flex-shrink-0">call</span>
            <a href={`tel:${company.phone}`} className="hover:text-primary transition-colors">{company.phone}</a>
          </div>
        )}

        {/* Priority 3: LinkedIn / Direct Social Contact */}
        {company.linkedin && (
          <div className="flex items-center gap-1.5 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-blue-600 flex-shrink-0">link</span>
            <a href={company.linkedin} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate font-medium">LinkedIn Profile</a>
          </div>
        )}

        {/* Source Reference Badge & Link */}
        {company.contactSource?.url ? (
          <div className="pt-1.5 mt-1 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <span className="text-secondary font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] text-emerald-600">verified</span>
              Source:
            </span>
            <a
              href={company.contactSource.url}
              target="_blank"
              rel="noreferrer"
              title={company.contactSource.context || 'Verified from site'}
              className="text-primary font-medium hover:underline truncate max-w-[190px] flex items-center gap-0.5"
            >
              {company.contactSource.page || 'Contact Page'}
              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
            </a>
          </div>
        ) : (
          <div className="pt-1 mt-1 border-t border-outline-variant/30 flex items-center justify-between text-[11px] text-secondary">
            <span>Crawled:</span>
            <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded font-mono">Homepage & /contact</span>
          </div>
        )}
      </div>

      {/* Trust Score */}
      <div>
        <div className="flex justify-between text-[12px] text-secondary mb-1.5">
          <span>AI Fit Match</span>
          <span className="font-semibold text-on-surface">{company.trustScore ?? 80}%</span>
        </div>
        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
          <motion.div
            className={`${trustBarColor(company.trustScore ?? 80)} h-full rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${company.trustScore ?? 80}%` }}
            transition={{ delay: index * 0.06 + 0.3, duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-[12px] text-secondary">
        <a
          href={company.website || `https://${company.domain}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-primary transition-colors truncate max-w-[160px]"
        >
          <span className="material-symbols-outlined text-[13px]">language</span>
          <span className="truncate">{company.displayUrl || company.domain || company.website}</span>
        </a>
        <span className="flex items-center gap-1 shrink-0">
          <span className="material-symbols-outlined text-[13px]">location_on</span>
          {company.country || 'Global'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-outline-variant">
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => onSave(company)}
          disabled={company.saved}
          className={`flex-1 font-semibold text-[13px] py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            company.saved
              ? 'bg-green-500 text-white cursor-default'
              : 'bg-primary text-white hover:bg-primary-container'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">{company.saved ? 'check' : 'bookmark_add'}</span>
          {company.saved ? 'Saved' : 'Save to Clients'}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
          onClick={() => onAnalyze(company)}
          title="Quick AI Analysis"
          className="p-2 text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl transition-colors border border-outline-variant"
        >
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        </motion.button>

        <motion.a
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
          href={company.website || `https://${company.domain}`}
          target="_blank"
          rel="noreferrer"
          title="Open website"
          className="p-2 text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl transition-colors border border-outline-variant"
        >
          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
        </motion.a>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('All Countries');
  const [minTrust, setMinTrust] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFix, setErrorFix] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [lastKeyword, setLastKeyword] = useState('');
  const [lastCountry, setLastCountry] = useState('All Countries');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState('');

  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearch = useCallback(async (forceReset = false) => {
    if (!keyword.trim()) { setError('Please enter an industry or keyword to search.'); return; }
    setLoading(true); setError(null); setErrorFix(null);
    
    let nextPage = 1;
    const isSubsequent = !forceReset && keyword.trim() === lastKeyword && country === lastCountry;
    if (isSubsequent) {
      nextPage = currentPage + 1;
    } else {
      // Reset local page state on fresh search or new keyword/country
      setCurrentPage(0);
    }

    try {
      const params = new URLSearchParams({
        keyword: keyword.trim(),
        country,
        minTrustScore: String(minTrust),
        pageno: String(nextPage),
        ...(forceReset ? { clearCache: 'true' } : {}),
      });
      const res = await fetch(`/api/discover-companies?${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.fix) setErrorFix(data.fix);
        throw new Error(data.error || 'Search failed');
      }

      // ── Robust response-key normalizer ─────────────────────────────────────
      // Handles { companies: [] }, { results: [] }, or a bare array.
      let rawCompanies: Company[] = [];
      if (Array.isArray(data)) {
        rawCompanies = data;
      } else if (data && Array.isArray(data.companies)) {
        rawCompanies = data.companies;
      } else if (data && Array.isArray(data.results)) {
        rawCompanies = data.results;
      }

      // ── Client-side minTrust filter ─────────────────────────────────────────
      const newCompanies: Company[] = minTrust > 0
        ? rawCompanies.filter((c) => (c.trustScore ?? 0) >= minTrust)
        : rawCompanies;

      setCompanies(newCompanies);
      if (isSubsequent) {
        setCurrentPage(nextPage);
      } else {
        setCurrentPage(1);
        setLastKeyword(keyword.trim());
        setLastCountry(country);
      }

      setQuery(data.query ?? `${keyword.trim()} companies`);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [keyword, country, minTrust, lastKeyword, lastCountry, currentPage]);


  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const handleAnalyze = useCallback(async (company: Company) => {
    setActiveCompany(company);
    setAnalysis({ loading: true, relevant: false, reason: '' });
    try {
      const res = await fetch('/api/analyze-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: company.website, name: company.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis({ relevant: data.relevant, reason: data.reason, loading: false });
    } catch (err) {
      setAnalysis({ loading: false, relevant: false, reason: '', error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  }, []);

  const handleSave = useCallback(async (company: Company, relevanceReason?: string) => {
    try {
      const res = await fetch('/api/save-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company.name, website: company.website, industry: company.industry,
          country: company.country, trustScore: company.trustScore,
          relevanceReason: relevanceReason || null, status: 'Pending',
          email: (company as Company).email || null,
          phone: (company as Company).phone || null,
          logoUrl: company.logoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, saved: true } : c)));
      if (activeCompany?.id === company.id) setActiveCompany((prev) => prev ? { ...prev, saved: true } : prev);
      setActiveCompany(null);
      showToast(`${company.name} saved to Clients!`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save client', 'error');
    }
  }, [activeCompany]);

  return (
    <div className="p-6 pb-10">
      {/* Header */}
      <motion.div className="mb-6" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <h2 className="text-[36px] font-bold text-on-surface leading-tight tracking-tight">Discover Companies</h2>
        <p className="text-[16px] text-secondary mt-1">
          Search the web for real companies, get contact details, and save leads instantly.
        </p>
      </motion.div>

      {/* Search Panel */}
      <motion.div
        className="bg-white rounded-2xl border border-outline-variant soft-shadow p-5 mb-6"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Keyword */}
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Industry / Keyword</label>
            <input
              type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="e.g. Fintech, Healthcare, SaaS, Manufacturing..."
              className="w-full h-10 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          {/* Country */}
          <div className="w-full md:w-52">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Country</label>
            <div className="relative">
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="w-full h-10 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface appearance-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-2.5 text-secondary pointer-events-none text-[18px]">expand_more</span>
            </div>
          </div>
          {/* Min Trust */}
          <div className="w-full md:w-40">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Min Trust Score</label>
            <div className="relative">
              <select value={minTrust} onChange={(e) => setMinTrust(Number(e.target.value))}
                className="w-full h-10 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface appearance-none focus:outline-none focus:border-primary transition-all">
                {MIN_TRUST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-2.5 text-secondary pointer-events-none text-[18px]">expand_more</span>
            </div>
          </div>
          {/* Buttons */}
          <div className="flex gap-2 shrink-0">
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => handleSearch(false)} disabled={loading}
              className="bg-primary text-white font-semibold text-[15px] px-6 py-2 h-10 rounded-xl hover:bg-primary-container transition-colors shadow-card flex items-center gap-2 whitespace-nowrap disabled:opacity-70"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'progress_activity' : 'search'}
              </span>
              {loading ? 'Searching...' : 'Search Companies'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => handleSearch(true)} disabled={loading}
              title="Clear cache and get fresh results from page 1"
              className="bg-surface border border-outline-variant text-on-surface font-semibold text-[15px] px-4 py-2 h-10 rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Fresh
            </motion.button>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 rounded-xl overflow-hidden">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-[13px] text-red-700 font-semibold flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[15px]">error</span>{error}
                </p>
                {errorFix && <p className="text-[12px] text-red-600 mt-1 leading-relaxed"><span className="font-semibold">Fix: </span>{errorFix}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Results area */}
      <AnimatePresence mode="wait">
        {/* Loading skeleton */}
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-outline-variant p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded shimmer" />
                    <div className="h-3 w-1/2 rounded shimmer" />
                  </div>
                </div>
                <div className="h-8 w-full rounded shimmer" />
                <div className="h-2 w-full rounded-full shimmer" />
                <div className="h-8 w-full rounded-xl shimmer" />
              </div>
            ))}
          </motion.div>
        )}

        {/* Empty state */}
        {!loading && hasSearched && companies.length === 0 && (
          <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-5xl text-outline mb-3">search_off</span>
            <p className="text-[18px] font-semibold text-on-surface mb-1">No companies found</p>
            <p className="text-[14px] text-secondary">Try a different keyword, country, or lower your trust score filter.</p>
          </motion.div>
        )}

        {/* Pre-search */}
        {!loading && !hasSearched && !error && (
          <motion.div key="pre-search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-primary">corporate_fare</span>
            </div>
            <div>
              <p className="text-[18px] font-semibold text-on-surface">Search for real companies</p>
              <p className="text-[14px] text-secondary mt-1">Get official logos, contact emails & phone numbers instantly.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {['SaaS', 'Healthcare', 'Fintech', 'Manufacturing', 'Logistics', 'Retail'].map((s) => (
                <button key={s} onClick={() => setKeyword(s)}
                  className="px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-full text-[13px] text-secondary hover:text-primary hover:border-primary transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Results */}
        {!loading && hasSearched && companies.length > 0 && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-[14px] text-secondary">
                <span className="font-semibold text-on-surface">{companies.length}</span> companies found
              </p>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
                <span className="text-[12px] text-secondary">Click ✦ on any card to run AI analysis</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {companies.map((company, i) => (
                <CompanyCard key={company.id} company={company} index={i} onAnalyze={handleAnalyze} onSave={(c) => handleSave(c)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis Modal */}
      <AnimatePresence>
        {activeCompany && analysis && (
          <AnalysisModal
            company={activeCompany} analysis={analysis}
            onClose={() => { setActiveCompany(null); setAnalysis(null); }}
            onSave={() => handleSave(activeCompany, analysis?.reason)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast key="toast" message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

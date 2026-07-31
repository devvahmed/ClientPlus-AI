'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import CountryCitySelector from '@/components/CountryCitySelector';

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
  city?: string;
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
  enriched?: boolean;
  enriching?: boolean;
  matchedService?: string;
  matchReason?: string;
  matchConfidence?: number;
  llmSource?: string;
  outreachAngle?: string;
  personalizationHook?: string;
  redFlags?: string;
}

interface AnalysisResult {
  relevant: boolean;
  reason: string;
  loading?: boolean;
  error?: string;
}

interface IndustrySuggestion {
  industry: string;
  reason: string;
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
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
          <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${fitBadgeColor[company.trustStatus] ?? fitBadgeColor['Neutral']}`}>
            {company.matchConfidence !== undefined ? `${company.matchConfidence}% Match` : (company.trustStatus || 'High Fit')}
          </span>
          {company.matchedService && (
            <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] text-indigo-600">bolt</span>
              Fits: {company.matchedService}
            </span>
          )}
        </div>
      </div>

      {/* Snippet */}
      {(company.snippet || company.description) && (
        <div className="h-[76px] overflow-y-auto pr-1 hover:scrollbar-visible custom-scrollbar">
          <p className="text-[12px] text-on-surface leading-relaxed bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/50 min-h-full">
            {company.snippet || company.description}
          </p>
        </div>
      )}

      {/* Match Reason Supporting Text */}
      {company.matchReason && (
        <div className="bg-indigo-50/70 border border-indigo-100/80 rounded-xl p-2.5 text-[11.5px] text-indigo-950 flex flex-col gap-0.5">
          <span className="font-semibold text-indigo-700 flex items-center gap-1 text-[10.5px] uppercase tracking-wider">
            <span className="material-symbols-outlined text-[13px]">psychology</span> Why this could be a client
          </span>
          <p className="leading-snug italic text-indigo-900">{company.matchReason}</p>
        </div>
      )}

      {/* Contact details & Priority Display */}
      <div className="flex flex-col gap-1.5 bg-surface-container-low rounded-xl px-3 py-2.5 border border-outline-variant/40">
        {company.email ? (
          /* Primary: EMAIL */
          <div className="flex items-center gap-1.5 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-primary flex-shrink-0">email</span>
            <a href={`mailto:${company.email.split(',')[0].trim()}`} className="font-medium text-primary hover:underline truncate">
              {company.email.split(',')[0].trim()}
            </a>
          </div>
        ) : company.phone ? (
          /* Primary: PHONE */
          <div className="flex items-center gap-1.5 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-emerald-600 flex-shrink-0">call</span>
            <a href={`tel:${company.phone}`} className="font-medium text-emerald-700 hover:underline truncate">
              {company.phone}
            </a>
          </div>
        ) : company.linkedin ? (
          /* Primary: LINKEDIN (only when no email & no phone) */
          <div className="flex items-center gap-1.5 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-blue-600 flex-shrink-0">link</span>
            <a href={company.linkedin} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate font-medium">
              {company.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </div>
        ) : company.enriching ? (
          <div className="flex items-center gap-1.5 text-[11px] text-secondary italic">
            <span className="material-symbols-outlined text-[13px] text-amber-500 animate-spin flex-shrink-0">sync</span>
            <span>Scanning contacts (up to 30s)...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="material-symbols-outlined text-[13px] text-gray-400 flex-shrink-0">subtitles_off</span>
            <span>No direct contact info found</span>
          </div>
        )}

        {/* Website link — minimal, clean */}
        {company.website && (
          <div className="pt-1 mt-0.5 border-t border-outline-variant/30 flex items-center gap-1 text-[11px] text-secondary">
            <span className="material-symbols-outlined text-[12px] text-gray-400">language</span>
            <a
              href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noreferrer"
              className="text-secondary hover:text-primary hover:underline truncate"
            >
              {company.domain || company.displayUrl}
            </a>
          </div>
        )}
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

// ─── CSV Exporter ─────────────────────────────────────────────────────────────
function exportCompaniesToCSV(companies: Company[], keyword: string) {
  if (!companies || companies.length === 0) return;

  const headers = [
    'Company Name',
    'Website',
    'Domain',
    'Industry',
    'Country',
    'AI Fit Score (%)',
    'Trust Status',
    'Email',
    'Phone',
    'LinkedIn',
    'Contact Source Page',
    'Source Context',
    'Summary'
  ];

  const escapeCSV = (str: any) => {
    if (str === undefined || str === null) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = companies.map(c => [
    escapeCSV(c.name),
    escapeCSV(c.website),
    escapeCSV(c.domain),
    escapeCSV(c.industry),
    escapeCSV(c.country),
    escapeCSV(c.trustScore),
    escapeCSV(c.trustStatus),
    escapeCSV(c.email || 'N/A'),
    escapeCSV(c.phone || 'N/A'),
    escapeCSV(c.linkedin || 'N/A'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // \uFEFF for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeKeyword = (keyword || 'discovered').trim().replace(/[^a-z0-9]/gi, '_');
  link.href = url;
  link.setAttribute('download', `${safeKeyword}_leads_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('All Countries');
  const [city, setCity] = useState('');
  const [minTrust, setMinTrust] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFix, setErrorFix] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [lastKeyword, setLastKeyword] = useState('');
  const [lastCountry, setLastCountry] = useState('All Countries');
  const [lastCity, setLastCity] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState('');

  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Suggest Industries State & Handlers ─────────────────────────────────────
  const [suggestInput, setSuggestInput] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IndustrySuggestion[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);

  const handleSuggestIndustries = useCallback(async () => {
    const input = suggestInput.trim();
    if (!input) return;

    setSuggestLoading(true);
    setSuggestError(null);

    try {
      const res = await fetch('/api/suggest-industries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get industry suggestions');
      }

      setSuggestions(data.suggestions || []);
      setSelectedIndustries([]);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to suggest industries');
    } finally {
      setSuggestLoading(false);
    }
  }, [suggestInput]);

  const handleToggleIndustry = useCallback((industryName: string) => {
    setSelectedIndustries((prev) => {
      let next: string[];
      if (prev.includes(industryName)) {
        next = prev.filter((i) => i !== industryName);
      } else {
        next = [...prev, industryName];
      }
      setKeyword(next.join(', '));
      return next;
    });
  }, []);

  // ── Restore search state from sessionStorage on page mount ─────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('clientplus_discover_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.companies && parsed.companies.length > 0) {
          setCompanies(parsed.companies);
          setHasSearched(true);
          if (parsed.keyword) setKeyword(parsed.keyword);
          if (parsed.country) setCountry(parsed.country);
          if (parsed.city) setCity(parsed.city);
          if (parsed.minTrust !== undefined) setMinTrust(parsed.minTrust);
          if (parsed.lastKeyword) setLastKeyword(parsed.lastKeyword);
          if (parsed.lastCountry) setLastCountry(parsed.lastCountry);
          if (parsed.lastCity) setLastCity(parsed.lastCity);
          if (parsed.currentPage) setCurrentPage(parsed.currentPage);
          if (parsed.query) setQuery(parsed.query);
        }
      }
    } catch (e) {
      console.warn('Failed to restore discover session state:', e);
    }
  }, []);

  // ── Controlled Batched Background Enrichment Queue ─────────────────────────
  useEffect(() => {
    if (!companies || companies.length === 0) return;

    // Find unenriched and non-enriching companies
    const pending = companies.filter(c => !c.enriched && !c.enriching);
    if (pending.length === 0) return;

    // Process in small batches of 3 to avoid overwhelming backend or target sites
    const batch = pending.slice(0, 3);
    const batchIds = new Set(batch.map(b => b.id));

    // Immediately mark batch as enriching to prevent duplicate execution
    setCompanies(prev => prev.map(c => batchIds.has(c.id) ? { ...c, enriching: true } : c));

    batch.forEach(async (company) => {
      try {
        const res = await fetch('/api/enrich-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: company.name,
            website_url: company.website || company.domain
          })
        });
        if (!res.ok) throw new Error('Enrichment failed');
        const data = await res.json();

        setCompanies(prev => prev.map(c => {
          if (c.id !== company.id) return c;
          const newEmails = (Array.isArray(data.all_emails) && data.all_emails.length > 0)
            ? data.all_emails
            : ((Array.isArray(data.emails) && data.emails.length > 0) ? data.emails : []);
          const primaryEmail = data.primary_email || newEmails[0] || c.email;
          const finalEmail = primaryEmail || (newEmails.length > 0 ? newEmails.join(', ') : c.email);

          const newPhones = (Array.isArray(data.phones) && data.phones.length > 0) ? data.phones : [];
          const finalPhone = newPhones.length > 0 ? newPhones[0] : c.phone;
          const linkedinCompany = data.linkedin_company || data.linkedinUrl || c.linkedin;

          const updatedComp: Company = {
            ...c,
            email: finalEmail,
            phone: finalPhone,
            linkedin: linkedinCompany || c.linkedin,
            contactSource: data.contact_page_url ? {
              url: data.contact_page_url,
              label: data.source_label || 'Contact Page',
              context: data.source_context || data.email_source_context
            } : c.contactSource,
            enriching: false,
            enriched: true,
          };

          // If user saved client while enrichment was in-flight, update server record with new contact info
          if (c.saved) {
            fetch('/api/save-client', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: updatedComp.name,
                website: updatedComp.website,
                industry: updatedComp.industry,
                country: updatedComp.country,
                trustScore: updatedComp.trustScore,
                status: 'Pending',
                email: updatedComp.email || null,
                phone: updatedComp.phone || null,
                phones: data.phones || [],
                linkedin: updatedComp.linkedin || null,
                contactSource: updatedComp.contactSource || null,
                logoUrl: updatedComp.logoUrl || null,
              }),
            }).catch((e) => console.warn('Sync enriched contact to client error:', e));
          }

          return updatedComp;
        }));
      } catch {
        setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, enriching: false, enriched: true } : c));
      }
    });
  }, [companies]);

  // ── Auto-persist state to sessionStorage whenever companies/filters update ──
  useEffect(() => {
    if (companies && companies.length > 0) {
      try {
        sessionStorage.setItem('clientplus_discover_cache', JSON.stringify({
          companies,
          keyword,
          country,
          city,
          minTrust,
          lastKeyword: lastKeyword || keyword,
          lastCountry: lastCountry || country,
          lastCity: lastCity || city,
          currentPage,
          query,
        }));
      } catch (e) {
        console.warn('Failed to persist discover session:', e);
      }
    }
  }, [companies, keyword, country, city, minTrust, lastKeyword, lastCountry, lastCity, currentPage, query]);

  const handleClearSession = () => {
    try {
      sessionStorage.removeItem('clientplus_discover_cache');
    } catch (e) {}
    setCompanies([]);
    setHasSearched(false);
    setKeyword('');
    setCountry('All Countries');
    setCity('');
    setMinTrust(0);
    setLastKeyword('');
    setLastCountry('All Countries');
    setLastCity('');
    setCurrentPage(1);
    setQuery('');
    setError(null);
    setErrorFix(null);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [streamProgress, setStreamProgress] = useState<{
    found: number; target: number; page: number; active: boolean;
  } | null>(null);

  const handleSearch = useCallback(async (forceReset = false) => {
    if (!keyword.trim()) { setError('Please enter an industry or keyword to search.'); return; }
    setLoading(true);
    setError(null);
    setErrorFix(null);
    setCompanies([]);
    setStreamProgress(null);

    let nextPage = 1;
    const isSubsequent = !forceReset && keyword.trim() === lastKeyword && country === lastCountry && city === lastCity;
    if (isSubsequent) {
      nextPage = currentPage + 1;
    } else {
      setCurrentPage(1);
    }

    try {
      const payload = {
        keyword: keyword.trim(),
        country,
        city: city.trim(),
        minTrustScore: minTrust,
        pageno: nextPage,
        target_count: 10,
        ...(forceReset ? { clearCache: true, resetCursor: true } : {}),
      };

      const res = await fetch('/api/discover-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.fix) setErrorFix(errData.fix);
        throw new Error(errData.error || `Search failed (HTTP ${res.status})`);
      }

      const contentType = res.headers.get('content-type') || '';
      const isStream = contentType.includes('ndjson') || contentType.includes('stream') || contentType.includes('text/plain');

      if (isStream && res.body) {
        // ── Streaming NDJSON path ────────────────────────────────────────────
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const accumulated: Company[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);

              if (event.type === 'start') {
                setStreamProgress({ found: 0, target: event.target ?? 10, page: 1, active: true });
                setQuery(event.query ?? `${keyword.trim()} companies`);
              } else if (event.type === 'page_start') {
                setStreamProgress(prev => prev ? { ...prev, page: event.page } : null);
              } else if (event.type === 'page_end') {
                setStreamProgress(prev => prev ? { ...prev, found: event.qualified_so_far } : null);
              } else if (event.type === 'company') {
                const { type: _t, ...company } = event;
                const c = company as Company;
                // Client-side filter: confidence gate
                if ((c.matchConfidence ?? c.trustScore ?? 0) < (minTrust || 0)) continue;
                accumulated.push(c);
                setCompanies([...accumulated]);
                setStreamProgress(prev => prev ? { ...prev, found: accumulated.length } : null);
                setHasSearched(true);
              } else if (event.type === 'done') {
                setStreamProgress(null);
              }
            } catch {
              // Non-JSON line — skip silently
            }
          }
        }

        if (!isSubsequent) {
          setCurrentPage(1);
          setLastKeyword(keyword.trim());
          setLastCountry(country);
          setLastCity(city);
        }
        setHasSearched(true);

      } else {
        // ── Legacy JSON fallback ─────────────────────────────────────────────
        const data = await res.json();
        let rawCompanies: Company[] = [];
        if (Array.isArray(data)) {
          rawCompanies = data;
        } else if (data && Array.isArray(data.companies)) {
          rawCompanies = data.companies;
        } else if (data && Array.isArray(data.results)) {
          rawCompanies = data.results;
        }
        const qualifiedOnly = rawCompanies.filter(
          (c) => c.trustStatus !== 'Pending Review' && ((c.matchConfidence ?? c.trustScore ?? 0) > 0)
        );
        const newCompanies = minTrust > 0
          ? qualifiedOnly.filter((c) => (c.matchConfidence ?? c.trustScore ?? 0) >= minTrust)
          : qualifiedOnly;

        setCompanies(newCompanies);
        setQuery(data.query ?? `${keyword.trim()} companies`);
        setHasSearched(true);
        if (!isSubsequent) {
          setCurrentPage(1);
          setLastKeyword(keyword.trim());
          setLastCountry(country);
          setLastCity(city);
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
      setStreamProgress(null);
    }
  }, [keyword, country, city, minTrust, lastKeyword, lastCountry, lastCity, currentPage]);


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
          name: company.name,
          website: company.website,
          industry: company.industry,
          country: company.country,
          trustScore: company.trustScore,
          relevanceReason: relevanceReason || null,
          status: 'Pending',
          email: company.email || null,
          phone: company.phone || null,
          linkedin: company.linkedin || null,
          contactSource: company.contactSource || null,
          logoUrl: company.logoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      const clientId: string | undefined = data.client?.id;
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, saved: true } : c)));
      if (activeCompany?.id === company.id) setActiveCompany((prev) => prev ? { ...prev, saved: true } : prev);
      setActiveCompany(null);
      showToast(`${company.name} saved to Clients!`, 'success');

      // ── Stage 2: Background deep enrich (fire and forget) ─────────────────
      // Immediately returns to user; enrichment runs async and updates Supabase.
      if (clientId) {
        (async () => {
          try {
            const enrichRes = await fetch('/api/deep-enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                company_name: company.name,
                website_url: company.website || company.domain,
              }),
            });
            if (!enrichRes.ok) return;
            const enrichData = await enrichRes.json();

            const newEmail = enrichData.primary_email || company.email || null;
            const newPhone = (enrichData.phones && enrichData.phones.length > 0)
              ? enrichData.phones[0] : company.phone || null;
            const newLinkedin = enrichData.linkedin_company || company.linkedin || null;

            // Update Supabase record with Stage 2 contacts
            await fetch(`/api/clients/${clientId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: newEmail,
                phone: newPhone,
                phones: enrichData.phones?.join(', ') || null,
                linkedin_company: newLinkedin,
                contact_source_url: enrichData.contact_page_url || null,
                contact_source_label: enrichData.source_label || null,
                enrichment_json: JSON.stringify({
                  all_emails: enrichData.all_emails || [],
                  email_meta: enrichData.email_meta || [],
                  phones: enrichData.phones || [],
                  linkedin_company: enrichData.linkedin_company || null,
                  linkedin_people: enrichData.linkedin_people || [],
                  contact_page_url: enrichData.contact_page_url || null,
                  found: enrichData.found,
                  stage: 2,
                }),
              }),
            }).catch((e) => console.warn('[Stage 2] PATCH failed:', e));

            // Also update in-memory + sessionStorage so card reflects Stage 2
            setCompanies((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== company.id) return c;
                return {
                  ...c,
                  email: newEmail || c.email,
                  phone: newPhone || c.phone,
                  linkedin: newLinkedin || c.linkedin,
                };
              });
              try {
                const cached = sessionStorage.getItem('clientplus_discover_cache');
                if (cached) {
                  const parsed = JSON.parse(cached);
                  parsed.companies = updated;
                  sessionStorage.setItem('clientplus_discover_cache', JSON.stringify(parsed));
                }
              } catch {}
              return updated;
            });
          } catch (e) {
            console.warn('[Stage 2] Deep enrich failed silently:', e);
          }
        })();
      }
      // ── End Stage 2 ───────────────────────────────────────────────────────────
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

      {/* Suggest Industries Panel */}
      <motion.div
        className="bg-white rounded-2xl border border-outline-variant soft-shadow p-5 mb-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">lightbulb</span>
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-on-surface leading-tight">Suggest Target Industries</h3>
              <p className="text-[12px] text-secondary">
                Type a technology or service name to discover high-value target industries before searching.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
            <div className="relative flex-1">
              <input
                type="text"
                value={suggestInput}
                onChange={(e) => setSuggestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSuggestIndustries();
                  }
                }}
                placeholder="e.g. Drone mapping, LiDAR SLAM, AI perception..."
                className="w-full h-10 pl-3.5 pr-3 py-2 bg-surface border border-outline-variant rounded-xl text-[14px] text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSuggestIndustries}
              disabled={suggestLoading || !suggestInput.trim()}
              className="bg-surface border border-outline-variant text-on-surface font-semibold text-[14px] px-5 py-2 h-10 rounded-xl hover:bg-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 shrink-0"
            >
              <span className={`material-symbols-outlined text-[18px] text-primary ${suggestLoading ? 'animate-spin' : ''}`}>
                {suggestLoading ? 'progress_activity' : 'auto_awesome'}
              </span>
              {suggestLoading ? 'Thinking...' : 'Suggest Industries'}
            </motion.button>
          </div>

          {/* Suggest Error */}
          {suggestError && (
            <p className="text-[12px] text-red-600 font-medium flex items-center gap-1.5 mt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              {suggestError}
            </p>
          )}

          {/* Suggestions Results (Clickable Chips) */}
          {suggestions.length > 0 && (
            <div className="mt-2 pt-3 border-t border-outline-variant/60 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-primary">touch_app</span>
                  Click industry chip to auto-fill search field
                </span>
                <span className="text-[11px] text-secondary">
                  {suggestions.length} suggested industries
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((item, idx) => {
                  const isSelected = selectedIndustries.includes(item.industry) || keyword.includes(item.industry);
                  return (
                    <motion.button
                      key={idx}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleToggleIndustry(item.industry)}
                      title={item.reason ? `${item.industry}: ${item.reason}` : item.industry}
                      className={`group text-left px-3.5 py-2 rounded-xl text-[13px] transition-all flex flex-col gap-0.5 border ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-primary font-semibold shadow-sm'
                          : 'bg-surface border-outline-variant/80 text-on-surface hover:border-primary/50 hover:bg-surface-variant'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-[13px]">
                        <span className={`material-symbols-outlined text-[15px] ${isSelected ? 'text-primary' : 'text-secondary group-hover:text-primary'}`}>
                          {isSelected ? 'check_circle' : 'add_circle'}
                        </span>
                        <span>{item.industry}</span>
                      </div>
                      {item.reason && (
                        <span className={`text-[11px] leading-tight pl-5 max-w-xs ${isSelected ? 'text-primary/80 font-normal' : 'text-secondary'}`}>
                          {item.reason}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
          {/* Country & Optional Region/City Dropdown */}
          <CountryCitySelector
            country={country}
            city={city}
            onCountryChange={setCountry}
            onCityChange={setCity}
          />
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
              className="bg-surface border border-outline-variant text-on-surface font-semibold text-[15px] px-3.5 py-2 h-10 rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Fresh
            </motion.button>
            {hasSearched && (
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleClearSession} disabled={loading}
                title="Reset search and clear saved session"
                className="bg-red-50 border border-red-200 text-red-700 font-semibold text-[14px] px-3.5 py-2 h-10 rounded-xl hover:bg-red-100 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-70"
              >
                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                Reset
              </motion.button>
            )}
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
        {/* Live streaming status banner */}
        {loading && streamProgress && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              </div>
              <div>
                <p className="text-[14px] font-bold text-primary">
                  Searching Page {streamProgress.page}... Found {streamProgress.found} of {streamProgress.target} qualified target companies
                </p>
                <p className="text-[12px] text-secondary">
                  Evaluating web candidates with AI in real time. Cards appear as soon as verified.
                </p>
              </div>
            </div>
            <div className="px-3 py-1 bg-white rounded-xl text-[12px] font-semibold text-primary border border-primary/20 shadow-sm">
              {streamProgress.found} / {streamProgress.target} Target
            </div>
          </motion.div>
        )}

        {/* Initial loading skeleton (only before first company arrives) */}
        {loading && companies.length === 0 && (
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

        {/* Results (renders during streaming OR when finished) */}
        {companies.length > 0 && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!loading && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-white p-3.5 rounded-2xl border border-outline-variant/60">
                <p className="text-[14px] text-secondary flex items-center gap-2">
                  <span className="font-semibold text-on-surface text-[15px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-lg">{companies.length}</span>
                  <span>companies discovered</span>
                </p>
                
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => exportCompaniesToCSV(companies, keyword)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] px-3.5 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Export to CSV
                  </motion.button>
                  <div className="hidden md:flex items-center gap-1.5 text-[12px] text-secondary">
                    <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
                    <span>Click ✦ on any card for AI analysis</span>
                  </div>
                </div>
              </div>
            )}
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

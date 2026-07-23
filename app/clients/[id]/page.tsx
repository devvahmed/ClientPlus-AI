'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Client {
  id: string;
  name: string;
  website: string;
  industry: string;
  country: string;
  trust_score: number;
  relevance_reason: string;
  status: string;
  email?: string;
  phone?: string;
  logo_url?: string;
  created_at: string;
}

interface ContactMeta {
  email: string;
  source_url?: string;
  source_page?: string;
  source_context?: string;
  source_label?: string;
}

interface ContactData {
  primary_email: string | null;
  all_emails: string[];
  email_meta: ContactMeta[];
  phones: string[];
  linkedin_company: string | null;
  linkedin_people: string[];
  contact_page_url: string | null;
  source_label: string;
  source_context: string;
  stakeholder?: string;
  context_snippet?: string;
  outreach_suggestion?: string;
  found: boolean;
  loading: boolean;
}

const tabs = ['Overview', 'Contact Info', 'Email History'];

const STATUS_STYLES: Record<string, string> = {
  Qualified:           'bg-[#e8f5e9] text-[#2e7d32] border-[#c8e6c9]',
  'Awaiting Outreach': 'bg-[#fff8e1] text-[#f57f17] border-[#ffe082]',
  Contacted:           'bg-[#e3f2fd] text-[#1565c0] border-[#90caf9]',
  Cold:                'bg-[#ffebee] text-[#c62828] border-[#ef9a9a]',
  Pending:             'bg-yellow-100 text-yellow-800 border-yellow-200',
};

const LOGO_COLORS = [
  'bg-[#08478a]', 'bg-[#2e7d32]', 'bg-[#1565c0]',
  'bg-[#6a1b9a]', 'bg-[#00695c]', 'bg-[#c62828]',
];

function getTrustLabel(score: number) {
  if (score >= 85) return 'High Intent';
  if (score >= 70) return 'Good Fit';
  if (score >= 50) return 'Moderate';
  return 'Low Intent';
}

function getDomain(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0 ${
        copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <span className="material-symbols-outlined text-[12px]">{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Single contact row ───────────────────────────────────────────────────────
function ContactItem({ icon, label, value, href, iconColor }: {
  icon: string; label: string; value: string; href?: string; iconColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`material-symbols-outlined text-[18px] flex-shrink-0 ${iconColor || 'text-gray-400'}`}>{icon}</span>
        <span className="text-[13px] text-gray-500 whitespace-nowrap">{label}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer"
            className="text-[13px] font-semibold text-blue-600 hover:underline truncate max-w-[220px]">
            {value}
          </a>
        ) : (
          <span className="text-[13px] font-semibold text-gray-800 truncate max-w-[220px]">{value}</span>
        )}
        <CopyBtn value={value} />
      </div>
    </div>
  );
}

const DEFAULT_TASKS = [
  { label: 'Initial AI Analysis', done: false },
  { label: 'Outbound Email Sent', done: false },
  { label: 'Schedule Demo Call', done: false },
  { label: 'Prepare Custom Proposal', done: false },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient]   = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [tasks, setTasks]     = useState(DEFAULT_TASKS);
  const [contacts, setContacts] = useState<ContactData>({
    primary_email: null,
    all_emails: [],
    email_meta: [],
    phones: [],
    linkedin_company: null,
    linkedin_people: [],
    contact_page_url: null,
    source_label: 'Contact Page',
    source_context: '',
    found: false,
    loading: false,
  });

  // Load client data
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/clients/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Client not found');
        setClient(data.client);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Enrich contacts when Contact Info tab opens
  useEffect(() => {
    if (activeTab !== 'Contact Info' || !client) return;
    if (contacts.found || contacts.loading) return;

    setContacts(prev => ({ ...prev, loading: true }));
    const domain = client.website ? getDomain(client.website) : '';

    fetch(`/api/enrich-contacts?company=${encodeURIComponent(client.name)}&domain=${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(data => {
        const allEmails = [...new Set([
          ...(client.email ? [client.email] : []),
          ...(data.all_emails || data.emails || []),
        ])];
        const primaryEmail = data.primary_email || allEmails[0] || client.email || null;

        const phones = [...new Set([
          ...(client.phone ? [client.phone] : []),
          ...(data.phones || []),
        ])];

        const linkedinCompany = data.linkedin_company || data.linkedinUrl || null;
        const linkedinPeople = data.linkedin_people || [];
        const contactPageUrl = data.contact_page_url || (client.website ? `${client.website.replace(/\/+$/, '')}/contact-us` : null);
        const sourceLabel = data.source_label || 'Contact Page';
        const sourceContext = data.source_context || data.email_source_context || 'Verified from site';

        const outreachSuggestion = primaryEmail
          ? `Primary Email (${primaryEmail}) verified near ${sourceLabel}. Suggested channel: Cold Email outreach + LinkedIn Company connect.`
          : linkedinCompany
          ? `No public email found. Suggested channel: LinkedIn Company Outreach & InMail to team.`
          : `Contact company via website contact form at ${contactPageUrl || client.website}.`;

        setContacts({
          primary_email: primaryEmail,
          all_emails: allEmails,
          email_meta: data.email_meta || [],
          phones,
          linkedin_company: linkedinCompany,
          linkedin_people: linkedinPeople,
          contact_page_url: contactPageUrl,
          source_label: sourceLabel,
          source_context: sourceContext,
          stakeholder: data.stakeholder || 'Not found',
          context_snippet: data.context_snippet || 'Not found',
          outreach_suggestion: outreachSuggestion,
          found: Boolean(primaryEmail || allEmails.length > 0 || phones.length > 0 || linkedinCompany || linkedinPeople.length > 0),
          loading: false,
        });
      })
      .catch(() => {
        setContacts(prev => ({ ...prev, loading: false }));
      });
  }, [activeTab, client]);

  const toggleTask = (i: number) => {
    setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t));
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-5 w-40 rounded shimmer" />
        <div className="bg-white rounded-2xl p-5 border border-outline-variant soft-shadow">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-2xl shimmer flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-7 w-48 rounded shimmer" />
              <div className="h-4 w-72 rounded shimmer" />
            </div>
          </div>
        </div>
        <div className="h-64 rounded-2xl shimmer" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span className="material-symbols-outlined text-5xl mb-3 text-red-400">error</span>
        <p className="text-[18px] font-semibold text-red-600">{error || 'Client not found'}</p>
        <Link href="/clients" className="mt-4 text-primary hover:underline font-medium">← Back to Clients</Link>
      </div>
    );
  }

  const initials   = client.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const logoColor  = LOGO_COLORS[client.name.charCodeAt(0) % LOGO_COLORS.length];
  const score      = client.trust_score ?? 0;
  const trustLabel = getTrustLabel(score);
  const statusStyle = STATUS_STYLES[client.status] ?? STATUS_STYLES.Pending;
  const domain     = client.website ? getDomain(client.website) : '';
  const doneCount  = tasks.filter(t => t.done).length;

  return (
    <div className="p-4 md:p-6 pb-10">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px] text-secondary">
          <Link href="/clients" className="hover:text-primary transition-colors">Clients</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-on-surface font-medium">{client.name}</span>
        </nav>

        {/* Header Card */}
        <motion.div
          className="bg-white rounded-2xl p-5 border border-outline-variant soft-shadow"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {/* Logo + Name */}
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 overflow-hidden ${client.logo_url ? 'bg-white border border-outline-variant' : logoColor}`}>
                {client.logo_url ? (
                  <img src={client.logo_url} alt={initials} className="w-full h-full object-contain p-1"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : initials}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-[24px] font-bold text-on-surface">{client.name}</h1>
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${statusStyle}`}>
                    {client.status || 'Pending'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-secondary text-[13px]">
                  {domain && (
                    <a href={client.website?.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[14px]">language</span>{domain}
                    </a>
                  )}
                  {client.industry && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">domain</span>{client.industry}</span>}
                  {client.country  && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">location_on</span>{client.country}</span>}
                </div>
              </div>
            </div>

            {/* Trust Score */}
            <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl border border-gray-200">
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">AI Score</p>
                <p className="text-[14px] font-bold text-gray-700">{trustLabel}</p>
              </div>
              <div className="relative w-12 h-12">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                  <motion.circle cx="50" cy="50" r="42" fill="none" stroke="#2563eb" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray="264"
                    initial={{ strokeDashoffset: 264 }}
                    animate={{ strokeDashoffset: 264 - (264 * score / 100) }}
                    transition={{ delay: 0.3, duration: 1, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[13px] font-bold text-blue-600">{score}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Left: Tabs */}
          <div className="lg:col-span-7 flex flex-col gap-4">

            {/* Tab Bar */}
            <div className="bg-white border border-outline-variant rounded-2xl px-2 flex gap-1">
              {tabs.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`relative py-3.5 px-3 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab ? 'text-primary' : 'text-secondary hover:text-primary'
                  }`}>
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">

              {/* ── Overview ──────────────────────────────────────────── */}
              {activeTab === 'Overview' && (
                <motion.div key="ov" className="flex flex-col gap-4"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                  {/* AI Summary */}
                  <div className="bg-white rounded-2xl p-5 border border-outline-variant soft-shadow">
                    <h3 className="text-[14px] font-semibold text-on-surface mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
                      AI Qualification Summary
                    </h3>
                    <p className="text-[14px] text-gray-600 leading-relaxed">
                      {client.relevance_reason || 'No AI summary available.'}
                    </p>
                  </div>

                  {/* Basic Info */}
                  <div className="bg-white rounded-2xl border border-outline-variant soft-shadow">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[17px]">info</span>
                      <h3 className="text-[14px] font-semibold text-on-surface">Company Details</h3>
                    </div>
                    <div className="px-5 py-1">
                      <ContactItem icon="business"       label="Name"     value={client.name} />
                      <ContactItem icon="domain"         label="Industry" value={client.industry || '—'} />
                      <ContactItem icon="location_on"    label="Country"  value={client.country  || '—'} />
                      {domain && <ContactItem icon="language" label="Website" value={domain}
                        href={client.website?.startsWith('http') ? client.website : `https://${client.website}`}
                        iconColor="text-blue-500" />}
                      <ContactItem icon="flag"           label="Status"   value={client.status || 'Pending'} />
                      <ContactItem icon="calendar_today" label="Added"
                        value={new Date(client.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Contact Info ───────────────────────────────────────── */}
              {activeTab === 'Contact Info' && (
                <motion.div key="ci" className="bg-white rounded-2xl border border-outline-variant soft-shadow flex flex-col space-y-4 p-5"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">contacts</span>
                      <h3 className="text-[16px] font-bold text-on-surface">Contact Information</h3>
                    </div>
                    {contacts.loading && (
                      <div className="flex items-center gap-1.5 text-[12px] text-blue-600 font-medium bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Deep Crawling Web...
                      </div>
                    )}
                  </div>

                  {/* 1. Primary Email (Highlighted) */}
                  {contacts.primary_email ? (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                          <span className="material-symbols-outlined text-[20px]">mail</span>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Primary Contact Email</div>
                          <a href={`mailto:${contacts.primary_email}`} className="text-[16px] font-bold text-blue-950 hover:underline">
                            {contacts.primary_email}
                          </a>
                        </div>
                      </div>
                      <CopyBtn value={contacts.primary_email} />
                    </div>
                  ) : !contacts.loading && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 flex items-center gap-2.5 text-gray-500 text-[13px]">
                      <span className="material-symbols-outlined text-gray-400">mail_lock</span>
                      <span>No primary email identified yet</span>
                    </div>
                  )}

                  {/* 2. All Emails List with Source Reference */}
                  {contacts.all_emails.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">mark_email_read</span>
                        All Extracted Emails & Source References
                      </h4>
                      <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/40 divide-y divide-gray-100">
                        {contacts.all_emails.map((em, idx) => {
                          const meta = contacts.email_meta.find(m => m.email?.toLowerCase() === em.toLowerCase());
                          const label = meta?.source_label || contacts.source_label || 'Contact Page';
                          const page = meta?.source_page || '/contact-us';
                          return (
                            <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[13px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-[15px] text-blue-500">alternate_email</span>
                                <a href={`mailto:${em}`} className="font-semibold text-blue-600 hover:underline truncate">
                                  {em}
                                </a>
                                <span className="text-gray-400 font-normal shrink-0">
                                  — Found near <span className="font-medium text-gray-700">{label}</span> heading on <span className="font-mono text-gray-600">{page}</span> page
                                </span>
                              </div>
                              <CopyBtn value={em} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. All Phone Numbers */}
                  {contacts.phones.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600">call</span>
                        All Phone Numbers
                      </h4>
                      <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/40 flex flex-wrap gap-3">
                        {contacts.phones.map((phone, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                            <span className="material-symbols-outlined text-[16px] text-emerald-600">phone_in_talk</span>
                            <a href={`tel:${phone}`} className="font-semibold text-gray-800 hover:text-emerald-700 text-[13px]">
                              {phone}
                            </a>
                            <CopyBtn value={phone} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. LinkedIn Company URL & 5. LinkedIn People profiles */}
                  {(contacts.linkedin_company || contacts.linkedin_people.length > 0) && (
                    <div className="space-y-2">
                      <h4 className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#0077b5]">groups</span>
                        LinkedIn Presence & Team Profiles
                      </h4>
                      <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 space-y-2">
                        {contacts.linkedin_company && (
                          <div className="flex items-center justify-between text-[13px]">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-[#0077b5]">domain</span>
                              <span className="font-medium text-gray-600">Company Page:</span>
                              <a href={contacts.linkedin_company} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                                {contacts.linkedin_company.replace(/^https?:\/\/(www\.)?/, '')}
                              </a>
                            </div>
                            <CopyBtn value={contacts.linkedin_company} />
                          </div>
                        )}
                        {contacts.linkedin_people.map((pUrl, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[13px] pt-1 border-t border-blue-100/60">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-purple-600">person</span>
                              <span className="font-medium text-gray-600">People Profile #{idx + 1}:</span>
                              <a href={pUrl} target="_blank" rel="noreferrer" className="font-semibold text-purple-700 hover:underline">
                                {pUrl.replace(/^https?:\/\/(www\.)?/, '')}
                              </a>
                            </div>
                            <CopyBtn value={pUrl} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 6. Contact Page Direct Link */}
                  {contacts.contact_page_url && (
                    <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-outline-variant/40 text-[13px]">
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="material-symbols-outlined text-[18px] text-primary">link</span>
                        <span>Contact Page Direct Link:</span>
                        <a href={contacts.contact_page_url} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                          {contacts.contact_page_url} ↗
                        </a>
                      </div>
                      <CopyBtn value={contacts.contact_page_url} />
                    </div>
                  )}

                  {/* 7. Best Outreach Suggestion */}
                  {contacts.outreach_suggestion && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-1">
                      <div className="flex items-center gap-2 text-amber-900 font-bold text-[13px]">
                        <span className="material-symbols-outlined text-[18px] text-amber-600">auto_awesome</span>
                        Recommended Outreach Strategy
                      </div>
                      <p className="text-[13px] text-amber-950 leading-relaxed font-medium">
                        {contacts.outreach_suggestion}
                      </p>
                    </div>
                  )}

                  {/* Not found fallback */}
                  {!contacts.loading && !contacts.found && (
                    <div className="p-6 text-center text-[13px] text-gray-400">
                      <span className="material-symbols-outlined text-4xl block mb-2 text-gray-300">search_off</span>
                      Could not find contact info for <strong>{client.name}</strong> automatically.
                      <br />Try searching manually on{' '}
                      <a href={`https://www.linkedin.com/company/${client.name.toLowerCase().replace(/\s+/g, '-')}`}
                        target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">LinkedIn</a>.
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Email History ──────────────────────────────────────── */}
              {activeTab === 'Email History' && (
                <motion.div key="eh" className="bg-white rounded-2xl p-8 border border-outline-variant soft-shadow flex items-center justify-center"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ minHeight: 180 }}>
                  <div className="text-center text-gray-400">
                    <span className="material-symbols-outlined text-4xl mb-2 block">mail</span>
                    <p className="text-[14px] font-medium text-gray-600">No emails sent yet</p>
                    <p className="text-[12px]">AI outreach emails will appear here.</p>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Right: sidebar */}
          <div className="lg:col-span-5 flex flex-col gap-4">

            {/* Quick Actions */}
            <motion.div className="bg-white rounded-2xl border border-outline-variant soft-shadow"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[17px]">bolt</span>
                <h3 className="text-[14px] font-semibold text-on-surface">Quick Contact</h3>
              </div>
              <div className="p-4 flex flex-col gap-2.5">
                {/* Score + Status */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Trust Score</p>
                    <p className="text-[20px] font-bold text-gray-800">{score}<span className="text-[12px] text-gray-400 font-normal">/100</span></p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Status</p>
                    <p className="text-[15px] font-bold text-blue-600">{client.status || 'Pending'}</p>
                  </div>
                </div>

                {/* Direct links */}
                {domain && (
                  <a href={client.website?.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-[13px] font-medium">
                    <span className="material-symbols-outlined text-[17px]">open_in_new</span>
                    Visit {domain}
                  </a>
                )}
                <button onClick={() => setActiveTab('Contact Info')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors text-[13px] font-semibold justify-center">
                  <span className="material-symbols-outlined text-[17px]">contacts</span>
                  Find Contact Info
                </button>
              </div>
            </motion.div>

            {/* Action Items */}
            <motion.div className="bg-white rounded-2xl border border-outline-variant soft-shadow"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
              <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[17px]">checklist</span>
                  <h3 className="text-[14px] font-semibold text-on-surface">Action Items</h3>
                </div>
                <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                  {doneCount}/{tasks.length}
                </span>
              </div>
              <div className="p-2">
                {tasks.map((task, i) => (
                  <label key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors">
                    <input type="checkbox" checked={task.done} onChange={() => toggleTask(i)}
                      className="w-4 h-4 rounded text-primary cursor-pointer" />
                    <span className={`text-[13px] transition-colors ${task.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {task.label}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}

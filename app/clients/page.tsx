'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ClientCard from '@/components/clients/ClientCard';

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

// Same options as original
const statusOptions = [
  'All Statuses', 'Qualified', 'Awaiting Outreach', 'Contacted', 'Pending', 'Cold',
];
const industryOptions = [
  'All Industries', 'Technology', 'Finance', 'Healthcare', 'Retail',
  'Agriculture Tech', 'Manufacturing', 'Logistics', 'SaaS',
];

function exportClientsToCSV(clients: Client[]) {
  if (!clients || clients.length === 0) return;

  const headers = [
    'Client Name',
    'Website',
    'Industry',
    'Country',
    'Trust Score (%)',
    'Status',
    'Email',
    'Phone',
    'Relevance Reason',
    'Created At'
  ];

  const escapeCSV = (str: any) => {
    if (str === undefined || str === null) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = clients.map(c => [
    escapeCSV(c.name),
    escapeCSV(c.website),
    escapeCSV(c.industry),
    escapeCSV(c.country),
    escapeCSV(c.trust_score),
    escapeCSV(c.status),
    escapeCSV(c.email || 'N/A'),
    escapeCSV(c.phone || 'N/A'),
    escapeCSV(c.relevance_reason || 'N/A'),
    escapeCSV(c.created_at)
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `saved_clients_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Same filter states as original
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [industryFilter, setIndustryFilter] = useState('All Industries');
  const [trustMin, setTrustMin] = useState(0);

  // Dynamic fetch from Supabase via API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/clients');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load clients');
        setClients(data.clients || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load clients');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Same filter logic as original
  const filtered = clients.filter((c) => {
    const matchStatus = statusFilter === 'All Statuses' || c.status === statusFilter;
    const matchIndustry =
      industryFilter === 'All Industries' ||
      (c.industry || '').toLowerCase().includes(industryFilter.toLowerCase());
    const matchTrust = (c.trust_score ?? 0) >= trustMin;
    return matchStatus && matchIndustry && matchTrust;
  });

  return (
    <div className="p-6 pb-10">
      {/* Header — exactly like original */}
      <motion.div
        className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div>
          <h2 className="text-[36px] font-bold text-on-surface leading-tight tracking-tight">
            Saved Clients
          </h2>
          <p className="text-[16px] text-secondary mt-1">
            Manage and track your prospect pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => exportClientsToCSV(filtered)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[14px] px-4 py-2 rounded-xl transition-all shadow-card flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export CSV
          </motion.button>
        </div>
      </motion.div>

      {/* Filter Bar — exactly like original */}
      <motion.div
        className="bg-white rounded-xl border border-outline-variant soft-shadow p-3 mb-6 flex flex-wrap gap-4 items-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 30 }}
      >
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 min-w-[160px] bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-[14px] text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
        >
          {statusOptions.map((o) => <option key={o}>{o}</option>)}
        </select>

        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className="flex-1 min-w-[160px] bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-[14px] text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
        >
          {industryOptions.map((o) => <option key={o}>{o}</option>)}
        </select>

        <div className="flex-1 min-w-[200px] flex items-center gap-3 px-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary whitespace-nowrap">
            Trust &gt;
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={trustMin}
            onChange={(e) => setTrustMin(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-[13px] font-semibold text-on-surface w-8 text-right">
            {trustMin}
          </span>
        </div>

        <button className="text-primary font-semibold text-[14px] px-3 py-2 flex items-center gap-1 hover:bg-surface-container-low rounded-xl transition-colors">
          <span className="material-symbols-outlined text-[16px]">filter_list</span>
          More Filters
        </button>
      </motion.div>

      {/* Client Grid — with loading, error, and empty states */}
      <AnimatePresence mode="wait">

        {/* Loading skeleton */}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-outline-variant p-4 flex flex-col gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded shimmer" />
                    <div className="h-3 w-1/2 rounded shimmer" />
                  </div>
                </div>
                <div className="h-6 w-24 rounded shimmer" />
                <div className="h-2 w-full rounded-full shimmer" />
                <div className="h-9 w-full rounded-xl shimmer" />
              </div>
            ))}
          </motion.div>
        )}

        {/* Error state */}
        {!loading && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <span className="material-symbols-outlined text-5xl mb-3 block text-red-400">error</span>
            <p className="text-[16px] font-semibold text-red-600">{error}</p>
            <p className="text-[13px] text-secondary mt-2">Check your Supabase configuration in .env.local</p>
          </motion.div>
        )}

        {/* Empty state (no clients at all) */}
        {!loading && !error && clients.length === 0 && (
          <motion.div
            key="no-clients"
            className="text-center py-24 text-secondary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline">
              people_outline
            </span>
            <p className="text-[16px] font-semibold text-on-surface">No clients saved yet</p>
            <p className="text-[13px] text-secondary mt-1">
              Go to <strong>Discover Companies</strong> and save some leads first!
            </p>
          </motion.div>
        )}

        {/* Filtered empty state */}
        {!loading && !error && clients.length > 0 && filtered.length === 0 && (
          <motion.div
            key="filtered-empty"
            className="text-center py-24 text-secondary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline">
              search_off
            </span>
            <p className="text-[16px]">No clients match your filters.</p>
          </motion.div>
        )}

        {/* Client grid */}
        {!loading && !error && filtered.length > 0 && (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filtered.map((client, i) => (
              <ClientCard
                key={client.id}
                id={client.id}
                name={client.name}
                industry={client.industry}
                status={client.status || 'Pending'}
                trust_score={client.trust_score}
                website={client.website}
                logo_url={client.logo_url}
                email={client.email}
                phone={client.phone}
                index={i}
              />
            ))}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

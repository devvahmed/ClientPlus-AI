'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface SavedClient {
  id: string;
  name: string;
  website: string;
  industry: string;
  country: string;
  trust_score: number;
  relevance_reason: string;
  status: string;
  created_at: string;
  logo_url?: string;
  email?: string;
}

type Column = 'New Leads' | 'Contacted' | 'In Negotiation' | 'Closed Won';

const columns: Column[] = ['New Leads', 'Contacted', 'In Negotiation', 'Closed Won'];

const columnColors: Record<Column, string> = {
  'New Leads': 'bg-blue-600',
  'Contacted': 'bg-amber-500',
  'In Negotiation': 'bg-purple-600',
  'Closed Won': 'bg-emerald-600',
};

const LOGO_COLORS = [
  'bg-[#08478a]', 'bg-[#2e7d32]', 'bg-[#1565c0]',
  'bg-[#6a1b9a]', 'bg-[#00695c]', 'bg-[#c62828]',
];

export default function TasksPage() {
  const [clients, setClients] = useState<SavedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch real saved clients from Supabase via /api/clients
  useEffect(() => {
    async function loadClients() {
      try {
        setLoading(true);
        const res = await fetch('/api/clients');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch clients');
        setClients(data.clients || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading clients');
      } finally {
        setLoading(false);
      }
    }
    loadClients();
  }, []);

  // Move client to new stage
  const handleStageChange = async (clientId: string, newStatus: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.warn('[Stage Change Error]', err);
    }
  };

  // Filter clients by search query
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.industry && c.industry.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.country && c.country.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Group clients by pipeline stage
  const groupedColumns: Record<Column, SavedClient[]> = {
    'New Leads': filteredClients.filter(c => {
      const s = (c.status || 'Pending').toLowerCase();
      return s === 'pending' || s === 'qualified' || s === 'new lead' || !s;
    }),
    'Contacted': filteredClients.filter(c => {
      const s = (c.status || '').toLowerCase();
      return s === 'contacted' || s === 'awaiting outreach' || s === 'email sent';
    }),
    'In Negotiation': filteredClients.filter(c => {
      const s = (c.status || '').toLowerCase();
      return s === 'in negotiation' || s === 'negotiating' || s === 'proposal sent';
    }),
    'Closed Won': filteredClients.filter(c => {
      const s = (c.status || '').toLowerCase();
      return s === 'closed won' || s === 'won' || s === 'closed';
    }),
  };

  const totalClients = clients.length;

  return (
    <div className="p-4 md:p-6 pb-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[28px] font-bold text-on-surface leading-tight tracking-tight">Sales Pipeline Tasks</h2>
            <span className="bg-blue-50 text-blue-700 font-bold text-[12px] px-2.5 py-0.5 rounded-full border border-blue-200">
              Live Auto-Tracker
            </span>
          </div>
          <p className="text-[14px] text-gray-500 mt-1">
            Companies saved from Discovery are automatically tracked here. Total: <span className="font-semibold text-gray-800">{totalClients} saved clients</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Filter leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-500 transition-colors shadow-sm"
            />
          </div>

          <Link
            href="/discover"
            className="bg-primary hover:bg-primary/90 text-white font-semibold text-[13px] px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">travel_explore</span>
            Discover Leads
          </Link>
        </div>
      </motion.div>

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 rounded-2xl shimmer border border-gray-200/60" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-center">
          <p className="font-semibold">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-xs font-bold underline">Retry</button>
        </div>
      ) : (
        /* Kanban Pipeline Board */
        <div className="flex gap-4 overflow-x-auto pb-4 items-start scrollbar-thin">
          {columns.map((col, ci) => {
            const list = groupedColumns[col];
            return (
              <motion.div
                key={col}
                className="w-[280px] sm:w-[305px] shrink-0 bg-gray-50/70 rounded-2xl border border-gray-200 flex flex-col min-h-[500px]"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ci * 0.05 }}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-gray-200/80 bg-white rounded-t-2xl flex justify-between items-center shadow-2xs">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${columnColors[col]}`} />
                    {col}
                  </h3>
                  <span className="bg-gray-100 text-gray-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-gray-200">
                    {list.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-2.5 flex flex-col gap-2.5 overflow-y-auto flex-1">
                  <AnimatePresence>
                    {list.length === 0 ? (
                      <div className="py-12 text-center text-[12px] text-gray-400 space-y-1.5 border border-dashed border-gray-200 rounded-xl m-1">
                        <span className="material-symbols-outlined text-2xl text-gray-300 block">inbox</span>
                        <p className="font-medium text-gray-500">No leads in {col}</p>
                        {col === 'New Leads' && (
                          <p className="text-[11px] text-gray-400">Save companies from Discovery to add them here automatically.</p>
                        )}
                        {col === 'Contacted' && (
                          <p className="text-[11px] text-gray-400">Leads automatically move here when Outreach Email is generated.</p>
                        )}
                      </div>
                    ) : (
                      list.map((client, ti) => {
                        const initials = client.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
                        const logoColor = LOGO_COLORS[client.name.charCodeAt(0) % LOGO_COLORS.length];

                        return (
                          <motion.div
                            key={client.id}
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ delay: ti * 0.03 }}
                            whileHover={{ y: -2, boxShadow: '0px 4px 14px rgba(0,0,0,0.06)' }}
                            className="bg-white rounded-xl border border-gray-200/80 p-3.5 shadow-2xs hover:border-blue-300 transition-all group"
                          >
                            {/* Card Header: Score + Stage Selector */}
                            <div className="flex items-center justify-between mb-2.5 gap-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100 shrink-0">
                                Trust: {client.trust_score ?? 80}/100
                              </span>

                              <select
                                value={client.status === 'Contacted' ? 'Contacted' : client.status === 'In Negotiation' ? 'In Negotiation' : client.status === 'Closed Won' ? 'Closed Won' : 'Pending'}
                                onChange={(e) => handleStageChange(client.id, e.target.value)}
                                className="text-[11px] font-bold bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 text-gray-700 focus:outline-none cursor-pointer hover:bg-gray-100 transition-colors"
                              >
                                <option value="Pending">New Lead</option>
                                <option value="Contacted">Contacted</option>
                                <option value="In Negotiation">Negotiating</option>
                                <option value="Closed Won">Closed Won</option>
                              </select>
                            </div>

                            {/* Company Logo + Name */}
                            <Link href={`/clients/${client.id}`} className="block group-hover:text-blue-600 transition-colors mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${logoColor}`}>
                                  {initials || 'CO'}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-[14px] font-bold text-gray-800 truncate leading-snug group-hover:text-blue-600">
                                    {client.name}
                                  </h4>
                                  <p className="text-[11px] text-gray-400 truncate">
                                    {client.industry || 'B2B Client'}
                                  </p>
                                </div>
                              </div>
                            </Link>

                            {/* Description / Summary */}
                            {client.relevance_reason && (
                              <p className="text-[12px] text-gray-500 line-clamp-2 leading-relaxed mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                {client.relevance_reason}
                              </p>
                            )}

                            {/* Contacted Column: Follow-up Due Banner */}
                            {col === 'Contacted' && (
                              <div className="mb-2.5 bg-amber-50/80 border border-amber-200 rounded-lg p-2 flex items-center justify-between text-[11px]">
                                <span className="font-bold text-amber-900 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-amber-600">schedule</span>
                                  Follow-up Nudge Ready
                                </span>
                                <Link
                                  href={`/clients/${client.id}`}
                                  className="text-amber-800 hover:text-amber-950 font-extrabold underline flex items-center gap-0.5"
                                >
                                  Follow-up
                                  <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                                </Link>
                              </div>
                            )}

                            {/* In Negotiation Column: AI Strategy Assistant Banner */}
                            {col === 'In Negotiation' && (
                              <div className="mb-2.5 bg-purple-50/80 border border-purple-200 rounded-lg p-2 flex items-center justify-between text-[11px]">
                                <span className="font-bold text-purple-900 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-purple-600">psychology</span>
                                  AI Strategy Assistant
                                </span>
                                <Link
                                  href={`/clients/${client.id}`}
                                  className="text-purple-800 hover:text-purple-950 font-extrabold underline flex items-center gap-0.5"
                                >
                                  Counter-Offer
                                  <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                                </Link>
                              </div>
                            )}

                            {/* Card Footer */}
                            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                              <div className="flex items-center gap-1 font-medium text-gray-600">
                                <span className="material-symbols-outlined text-[13px] text-gray-400">location_on</span>
                                {client.country || 'Global'}
                              </div>
                              <Link
                                href={`/clients/${client.id}`}
                                className="flex items-center gap-1 text-blue-600 font-bold hover:underline"
                              >
                                Detail
                                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                              </Link>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

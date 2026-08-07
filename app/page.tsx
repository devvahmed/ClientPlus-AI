'use client';

import { useState, useEffect } from 'react';
import DashboardCards, { DashboardStatsData } from '@/components/dashboard/DashboardCards';
import OutreachChart from '@/components/dashboard/OutreachChart';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import ClientTable from '@/components/dashboard/ClientTable';
import { getAuthToken, getSavedCompany, CompanyProfile } from '@/lib/auth';

export default function DashboardPage() {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = getSavedCompany();
    if (saved) {
      setCompany(saved);
    }

    const fetchStats = async () => {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/dashboard-stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setStats(data);
          if (data.company_name) {
            setCompany(prev => prev ? { ...prev, name: data.company_name } : null);
          }
        }
      } catch (err) {
        console.error('[Dashboard Page Fetch Error]:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="p-6 pb-10">
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-[36px] font-bold text-on-surface leading-tight tracking-tight">
            Dashboard Overview
          </h2>
          <p className="text-[16px] text-secondary mt-1">
            Welcome back, <span className="text-primary font-semibold">{company?.name || 'Partner'}</span>. Here&apos;s your live pipeline status today.
          </p>
        </div>
        <a
          href="/discover"
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl font-semibold text-[14px] flex items-center gap-2 transition-all shadow-md shadow-primary/20 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">travel_explore</span>
          Discover New Leads
        </a>
      </div>

      {/* Dynamic Stat Cards */}
      <DashboardCards stats={stats} />

      {/* Chart + Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <OutreachChart activeOutreach={stats?.active_outreach || 0} />
        <ActivityFeed activities={stats?.recent_activity || []} />
      </div>

      {/* Clients Table */}
      <ClientTable />
    </div>
  );
}

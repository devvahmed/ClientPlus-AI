import DashboardCards from '@/components/dashboard/DashboardCards';
import OutreachChart from '@/components/dashboard/OutreachChart';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import ClientTable from '@/components/dashboard/ClientTable';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — ClientPlus AI',
  description: 'Overview of your sales pipeline, outreach activity, and client health.',
};

export default function DashboardPage() {
  return (
    <div className="p-6 pb-10">
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-[36px] font-bold text-on-surface leading-tight tracking-tight">
            Dashboard Overview
          </h2>
          <p className="text-[16px] text-secondary mt-1">Welcome back, Alex. Here&apos;s what&apos;s happening today.</p>
        </div>
        <button className="bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-xl font-semibold text-[15px] flex items-center gap-2 transition-colors shadow-card shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Campaign
        </button>
      </div>

      {/* Stat Cards */}
      <DashboardCards />

      {/* Chart + Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <OutreachChart />
        <ActivityFeed />
      </div>

      {/* Clients Table */}
      <ClientTable />
    </div>
  );
}

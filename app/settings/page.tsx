import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings — ClientPlus AI' };

export default function SettingsPage() {
  return (
    <div className="p-6 pb-10">
      <div className="mb-6">
        <h2 className="text-[36px] font-bold text-on-surface leading-tight">Settings</h2>
        <p className="text-[16px] text-secondary mt-1">Configure your account and preferences.</p>
      </div>
      <div className="bg-white rounded-2xl border border-outline-variant soft-shadow p-8 flex items-center justify-center min-h-[300px]">
        <div className="text-center text-secondary">
          <span className="material-symbols-outlined text-5xl mb-3 block text-outline">settings</span>
          <p className="text-[16px]">Settings panel will connect to your backend API.</p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <TopNav onMenuClick={() => setMobileOpen(true)} />
      <main className="md:ml-[280px] pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}

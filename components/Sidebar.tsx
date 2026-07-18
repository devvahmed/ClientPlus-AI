'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { href: '/', icon: 'dashboard', label: 'Dashboard' },
  { href: '/discover', icon: 'search_insights', label: 'Discover Companies' },
  { href: '/clients', icon: 'group', label: 'Clients' },
  { href: '/tasks', icon: 'assignment', label: 'Tasks' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full py-6 w-full">
      {/* Brand */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <motion.div
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-elevated"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          <span className="material-symbols-outlined icon-fill text-[20px]">analytics</span>
        </motion.div>
        <div>
          <h1 className="font-bold text-[18px] leading-6 text-primary">ClientPlus AI</h1>
          <p className="text-[11px] leading-4 tracking-wider uppercase text-secondary">Enterprise Plan</p>
        </div>
      </div>

      {/* Nav Links */}
      <ul className="flex-1 space-y-1 px-3">
        {navItems.map((item, i) => {
          const active = isActive(item.href);
          return (
            <motion.li
              key={item.href}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 + 0.1 }}
            >
              <Link
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative
                  ${active
                    ? 'text-primary font-bold bg-surface-container-high border-l-4 border-primary ml-0'
                    : 'text-secondary hover:text-primary hover:bg-surface-container-low ml-[4px]'
                  }`}
              >
                {active && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-surface-container-high rounded-xl"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span
                  className={`material-symbols-outlined text-[22px] relative z-10 transition-transform duration-200 group-hover:scale-110
                    ${active ? 'icon-fill' : ''}`}
                >
                  {item.icon}
                </span>
                <span className="relative z-10 text-[15px] font-medium">{item.label}</span>
              </Link>
            </motion.li>
          );
        })}
      </ul>

      {/* Bottom links */}
      <div className="px-3 mt-4 space-y-1 border-t border-outline-variant pt-4">
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-secondary hover:text-primary hover:bg-surface-container-low transition-all duration-200 group ml-[4px]"
        >
          <span className="material-symbols-outlined text-[22px] transition-transform duration-200 group-hover:rotate-45">settings</span>
          <span className="text-[15px] font-medium">Settings</span>
        </Link>
      </div>

      {/* User Profile */}
      <div className="px-4 mt-4">
        <motion.div
          className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant cursor-pointer"
          whileHover={{ scale: 1.01, boxShadow: '0 4px 20px rgba(8,71,138,0.08)' }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold text-sm border border-primary-fixed">
            AM
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-on-surface truncate">Alex Mercer</p>
            <p className="text-[12px] text-secondary truncate">Director of Sales</p>
          </div>
          <span className="material-symbols-outlined text-[16px] text-secondary">more_vert</span>
        </motion.div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="bg-surface w-[280px] h-screen fixed left-0 top-0 border-r border-outline-variant shadow-sm z-20 hidden md:flex flex-col">
        {sidebarContent}
      </nav>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 sidebar-overlay md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.nav
              className="fixed left-0 top-0 h-full w-[280px] bg-surface border-r border-outline-variant shadow-deep z-50 flex flex-col md:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {sidebarContent}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

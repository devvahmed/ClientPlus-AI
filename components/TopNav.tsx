'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TopNavProps {
  onMenuClick: () => void;
  placeholder?: string;
}

export default function TopNav({ onMenuClick, placeholder = 'Search companies, clients...' }: TopNavProps) {
  const [focused, setFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="bg-white border-b border-outline-variant shadow-sm fixed top-0 right-0 w-full md:w-[calc(100%-280px)] h-16 z-30 flex items-center px-6">
      <div className="flex justify-between items-center w-full gap-4">
        {/* Left: Mobile menu + Search */}
        <div className="flex items-center gap-4 flex-1">
          {/* Mobile menu toggle */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl transition-all"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>

          {/* Search Bar */}
          <motion.div
            className={`relative flex-1 max-w-sm sm:max-w-md transition-all duration-300`}
            animate={{ width: focused ? '100%' : undefined }}
          >
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[20px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder={placeholder}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={`w-full pl-10 pr-4 py-2 rounded-full text-[14px] border transition-all duration-200 outline-none
                bg-surface-container-low
                ${focused
                  ? 'border-primary ring-2 ring-primary/20 bg-white shadow-sm'
                  : 'border-outline-variant hover:border-outline'
                }`}
            />
          </motion.div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setNotifOpen(!notifOpen)}
              className="p-2 text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl transition-all relative"
            >
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border-2 border-white animate-pulse-soft" />
            </motion.button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-outline-variant shadow-deep z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
                    <h3 className="font-semibold text-[15px] text-on-surface">Notifications</h3>
                    <span className="text-[11px] text-primary font-semibold uppercase tracking-wider cursor-pointer hover:underline">Mark all read</span>
                  </div>
                  {[
                    { icon: 'mail', text: 'Email opened by Sarah J. at TechCorp', time: '10 mins ago', color: 'bg-surface-container-high text-primary' },
                    { icon: 'check_circle', text: 'Meeting booked with Innovate Inc.', time: '1 hour ago', color: 'bg-green-100 text-green-700' },
                    { icon: 'warning', text: 'Trust Score dropped for Apex Solutions', time: 'Yesterday', color: 'bg-yellow-100 text-yellow-700' },
                  ].map((n, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex gap-3 p-4 hover:bg-surface-container-lowest cursor-pointer border-b border-outline-variant last:border-0"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.color}`}>
                        <span className="material-symbols-outlined text-[16px]">{n.icon}</span>
                      </div>
                      <div>
                        <p className="text-[13px] text-on-surface">{n.text}</p>
                        <p className="text-[11px] text-secondary mt-0.5">{n.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Help */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl transition-all"
          >
            <span className="material-symbols-outlined">help</span>
          </motion.button>

          {/* Avatar */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 rounded-full bg-primary-container border border-outline-variant cursor-pointer flex items-center justify-center text-primary font-bold text-sm overflow-hidden"
          >
            AM
          </motion.div>
        </div>
      </div>
    </header>
  );
}

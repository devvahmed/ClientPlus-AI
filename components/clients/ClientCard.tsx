'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface ClientCardProps {
  id: string;
  name: string;
  industry: string;
  status: string;
  trust_score: number;
  website?: string;
  logo_url?: string;
  email?: string;
  phone?: string;
  index: number;
}

// Same status styles as the original design
function getStatusStyle(status: string) {
  switch (status) {
    case 'Qualified':        return 'bg-[#e8f5e9] text-[#2e7d32]';
    case 'Awaiting Outreach': return 'bg-[#fff8e1] text-[#f57f17]';
    case 'Contacted':        return 'bg-[#e3f2fd] text-[#1565c0]';
    case 'Cold':             return 'bg-[#ffebee] text-[#c62828]';
    case 'Pending':
    default:                 return 'bg-yellow-100 text-yellow-800';
  }
}

function getTrustBarColor(score: number) {
  if (score >= 80) return 'bg-primary';
  if (score >= 60) return 'bg-[#ffb870]'; // tertiary-fixed-dim equivalent
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

const LOGO_COLORS = [
  'bg-[#08478a]', 'bg-[#2e7d32]', 'bg-[#1565c0]',
  'bg-[#6a1b9a]', 'bg-[#00695c]', 'bg-[#c62828]',
  'bg-[#e65100]', 'bg-[#283593]',
];

export default function ClientCard({
  id, name, industry, status, trust_score, website, logo_url, index,
}: ClientCardProps) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  const logoColor = LOGO_COLORS[index % LOGO_COLORS.length];
  const score = trust_score ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 300, damping: 30 }}
      whileHover={{ y: -6, boxShadow: '0 12px 32px rgba(8,71,138,0.10)' }}
      className="bg-white rounded-xl border border-outline-variant soft-shadow p-4 flex flex-col cursor-pointer"
    >
      {/* Header — same as original */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {/* Logo with clearbit fallback to initials */}
          <div className={`w-12 h-12 rounded-xl ${logo_url ? 'bg-white border border-outline-variant overflow-hidden' : logoColor} flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0`}>
            {logo_url ? (
              <img
                src={logo_url}
                alt={initials}
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  // On error, hide img and show initials via parent class swap
                  const parent = (e.target as HTMLElement).parentElement;
                  if (parent) {
                    parent.className = `w-12 h-12 rounded-xl ${logoColor} flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0`;
                    parent.innerHTML = initials;
                  }
                }}
              />
            ) : initials}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-on-surface">{name}</h3>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-secondary">
              {industry || 'General'}
            </span>
          </div>
        </div>
        <button className="text-outline hover:text-primary transition-colors p-1 rounded-lg hover:bg-surface-container-low">
          <span className="material-symbols-outlined text-[20px]">more_vert</span>
        </button>
      </div>

      {/* Status Badge — same as original */}
      <div className="mb-4">
        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider ${getStatusStyle(status)}`}>
          {status || 'Pending'}
        </span>
      </div>

      {/* Trust Score — same as original layout */}
      <div className="mb-5 flex-1">
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-[13px] text-secondary">Trust Score</span>
          <span className="text-[15px] font-semibold text-on-surface">{score}/100</span>
        </div>
        <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
          <motion.div
            className={`${getTrustBarColor(score)} h-full rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ delay: index * 0.07 + 0.3, duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Action — same "View Details" button as original */}
      <div className="pt-4 border-t border-outline-variant mt-auto">
        <Link href={`/clients/${id}`}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-white border border-outline-variant text-primary font-semibold text-[14px] py-2 rounded-xl hover:border-primary hover:bg-surface-container-lowest transition-all flex items-center justify-center gap-2 group"
          >
            View Details
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
              arrow_forward
            </span>
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
}

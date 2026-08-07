'use client';

import { motion, Variants } from 'framer-motion';

export interface DashboardStatsData {
  total_companies_found: number;
  qualified_leads: number;
  active_outreach: number;
  avg_trust_score: number;
}

interface StatCard {
  label: string;
  value: string;
  icon: string;
  trend: string;
  trendType: 'up' | 'down' | 'stable';
  trendIcon: string;
}

const trendColors = {
  up: 'text-green-600',
  down: 'text-error',
  stable: 'text-secondary',
};

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
};

export default function DashboardCards({ stats }: { stats?: DashboardStatsData | null }) {
  const hasData = stats && (stats.total_companies_found > 0 || stats.qualified_leads > 0);

  const cards: StatCard[] = [
    {
      label: 'Total Companies Found',
      value: stats ? stats.total_companies_found.toLocaleString() : '0',
      icon: 'corporate_fare',
      trend: hasData ? 'Live discovery count' : 'No data recorded yet',
      trendType: hasData ? 'up' : 'stable',
      trendIcon: hasData ? 'trending_up' : 'trending_flat',
    },
    {
      label: 'Qualified Leads',
      value: stats ? stats.qualified_leads.toLocaleString() : '0',
      icon: 'verified_user',
      trend: hasData ? 'Fit score >= 60%' : 'No data recorded yet',
      trendType: hasData ? 'up' : 'stable',
      trendIcon: hasData ? 'trending_up' : 'trending_flat',
    },
    {
      label: 'Active Outreach',
      value: stats ? stats.active_outreach.toLocaleString() : '0',
      icon: 'outgoing_mail',
      trend: hasData ? 'Engaged prospects' : 'No data recorded yet',
      trendType: 'stable',
      trendIcon: 'trending_flat',
    },
    {
      label: 'Avg Trust Score',
      value: stats && stats.avg_trust_score > 0 ? `${stats.avg_trust_score}/100` : '0',
      icon: 'health_and_safety',
      trend: hasData ? 'Average fit rating' : 'No data recorded yet',
      trendType: hasData ? 'up' : 'stable',
      trendIcon: hasData ? 'trending_up' : 'trending_flat',
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={cardVariants}
          whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(8,71,138,0.12)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-xl p-4 border border-outline-variant card-shadow stat-card-gradient relative overflow-hidden group cursor-pointer"
        >
          {/* Subtle background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-surface-container-low opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

          <div className="flex justify-between items-start mb-4 relative">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary mb-1">
                {card.label}
              </p>
              <motion.h3
                className="text-[28px] font-bold text-on-surface leading-tight"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {card.value}
              </motion.h3>
            </div>
            <motion.div
              className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-primary"
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <span className="material-symbols-outlined text-[22px]">{card.icon}</span>
            </motion.div>
          </div>

          <div className="flex items-center gap-1.5 text-[12px] font-medium relative">
            <span className={`material-symbols-outlined text-[16px] ${trendColors[card.trendType]}`}>
              {card.trendIcon}
            </span>
            <span className={trendColors[card.trendType]}>{card.trend}</span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

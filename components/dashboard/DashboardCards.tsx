'use client';

import { motion, Variants } from 'framer-motion';

interface StatCard {
  label: string;
  value: string;
  icon: string;
  trend: string;
  trendType: 'up' | 'down' | 'stable';
  trendIcon: string;
}

const cards: StatCard[] = [
  {
    label: 'Total Companies Found',
    value: '12,450',
    icon: 'corporate_fare',
    trend: '+14% from last week',
    trendType: 'up',
    trendIcon: 'trending_up',
  },
  {
    label: 'Qualified Leads',
    value: '3,820',
    icon: 'verified_user',
    trend: '+8% from last week',
    trendType: 'up',
    trendIcon: 'trending_up',
  },
  {
    label: 'Active Outreach',
    value: '1,204',
    icon: 'outgoing_mail',
    trend: 'Stable',
    trendType: 'stable',
    trendIcon: 'trending_flat',
  },
  {
    label: 'Avg Trust Score',
    value: '86/100',
    icon: 'health_and_safety',
    trend: '+2 pts from last week',
    trendType: 'up',
    trendIcon: 'trending_up',
  },
];

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

export default function DashboardCards() {
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
              className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary"
              whileHover={{ scale: 1.15, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <span className="material-symbols-outlined text-[20px]">{card.icon}</span>
            </motion.div>
          </div>

          <div className={`flex items-center gap-1 text-[13px] font-medium ${trendColors[card.trendType]}`}>
            <span className="material-symbols-outlined text-[16px]">{card.trendIcon}</span>
            <span>{card.trend}</span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

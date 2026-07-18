'use client';

import { motion } from 'framer-motion';

interface FeedItem {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  time: string;
  isLast?: boolean;
}

const feedItems: FeedItem[] = [
  {
    icon: 'mail',
    iconBg: 'bg-surface-container-high',
    iconColor: 'text-primary',
    title: 'Email opened',
    description: 'by Sarah J. at TechCorp',
    time: '10 mins ago',
  },
  {
    icon: 'check_circle',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    title: 'Meeting booked',
    description: 'with Innovate Inc.',
    time: '1 hour ago',
  },
  {
    icon: 'person_add',
    iconBg: 'bg-surface-container-high',
    iconColor: 'text-primary',
    title: 'New Lead',
    description: 'assigned from Global Logistics',
    time: '3 hours ago',
  },
  {
    icon: 'warning',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-700',
    title: 'Trust Score Dropped',
    description: 'for Apex Solutions',
    time: 'Yesterday',
    isLast: true,
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
};

export default function ActivityFeed() {
  return (
    <motion.div
      className="bg-white rounded-xl border border-outline-variant card-shadow flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="p-4 border-b border-outline-variant bg-surface-bright rounded-t-xl">
        <h3 className="text-[15px] font-semibold text-on-surface">Recent Activity</h3>
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {feedItems.map((item, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="flex gap-3 group"
            >
              <div className="relative flex flex-col items-center">
                <motion.div
                  className={`w-8 h-8 rounded-full ${item.iconBg} flex items-center justify-center ${item.iconColor} z-10 outline outline-4 outline-white`}
                  whileHover={{ scale: 1.15 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                </motion.div>
                {!item.isLast && (
                  <div className="w-[2px] h-full bg-outline-variant absolute top-8 bottom-0" />
                )}
              </div>

              <div className="pb-4 flex-1">
                <p className="text-[14px] text-on-surface">
                  <span className="font-semibold">{item.title}</span>
                  {' '}{item.description}
                </p>
                <p className="text-[12px] text-secondary mt-1">{item.time}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="p-3 border-t border-outline-variant">
        <button className="w-full text-[13px] text-primary font-semibold hover:bg-surface-container-low rounded-lg py-1.5 transition-colors">
          View All Activity
        </button>
      </div>
    </motion.div>
  );
}

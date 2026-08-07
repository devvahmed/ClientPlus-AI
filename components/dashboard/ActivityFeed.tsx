'use client';

import { motion } from 'framer-motion';

export interface ActivityItem {
  company_name?: string;
  contact_email?: string;
  sent_at?: string;
  probability_score?: number;
  suggested_action?: string;
}

export default function ActivityFeed({ activities = [] }: { activities?: ActivityItem[] }) {
  const hasItems = activities && activities.length > 0;

  return (
    <motion.div
      className="bg-white rounded-xl border border-outline-variant card-shadow flex flex-col min-h-[320px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="p-4 border-b border-outline-variant bg-surface-bright rounded-t-xl flex justify-between items-center">
        <h3 className="text-[15px] font-semibold text-on-surface">Recent Activity</h3>
        {hasItems && (
          <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            Live
          </span>
        )}
      </div>

      <div className="p-4 overflow-y-auto flex-1 flex flex-col justify-center">
        {!hasItems ? (
          <div className="text-center py-8 px-4 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-secondary mb-3">
              <span className="material-symbols-outlined text-[24px]">history</span>
            </div>
            <p className="text-sm font-semibold text-on-surface mb-1">No recent activity yet</p>
            <p className="text-xs text-secondary max-w-[220px]">
              Discovered companies and outreach campaigns will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-surface-container-low transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[16px]">domain</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-on-surface truncate">{item.company_name || 'Prospect Company'}</p>
                  <p className="text-[11px] text-secondary truncate">{item.suggested_action || 'Qualified by AI Discovery'}</p>
                  <span className="text-[10px] text-primary font-medium">Fit Score: {item.probability_score || 70}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

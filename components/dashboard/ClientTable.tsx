'use client';

import { motion } from 'framer-motion';

interface Client {
  company: string;
  status: string;
  statusStyle: string;
  trustScore: number;
  trustColor: string;
  lastActivity: string;
  actionLabel: string;
  actionStyle: string;
}

const clients: Client[] = [
  {
    company: 'Apex Solutions',
    status: 'Pending',
    statusStyle: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    trustScore: 45,
    trustColor: 'bg-orange-500',
    lastActivity: '4 days ago',
    actionLabel: 'Follow Up',
    actionStyle: 'text-primary border border-primary hover:bg-surface-container-low',
  },
  {
    company: 'Nexus Industries',
    status: 'Cold',
    statusStyle: 'bg-red-100 text-red-800 border-red-200',
    trustScore: 20,
    trustColor: 'bg-red-500',
    lastActivity: '2 weeks ago',
    actionLabel: 'Re-engage',
    actionStyle: 'text-primary border border-primary hover:bg-surface-container-low',
  },
  {
    company: 'Global Logistics',
    status: 'Qualified',
    statusStyle: 'bg-green-100 text-green-800 border-green-200',
    trustScore: 92,
    trustColor: 'bg-green-500',
    lastActivity: '3 hrs ago',
    actionLabel: 'Convert',
    actionStyle: 'bg-primary text-white hover:bg-primary-container',
  },
  {
    company: 'Summit Tech',
    status: 'Contacted',
    statusStyle: 'bg-blue-100 text-blue-800 border-blue-200',
    trustScore: 68,
    trustColor: 'bg-blue-500',
    lastActivity: 'Yesterday',
    actionLabel: 'View Log',
    actionStyle: 'text-primary border border-primary hover:bg-surface-container-low',
  },
];

const trustTextColor: Record<string, string> = {
  'bg-orange-500': 'text-orange-600',
  'bg-red-500': 'text-red-600',
  'bg-green-500': 'text-green-600',
  'bg-blue-500': 'text-blue-600',
};

export default function ClientTable() {
  return (
    <motion.div
      className="bg-white rounded-xl border border-outline-variant card-shadow overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
        <h3 className="text-[15px] font-semibold text-on-surface">Clients Needing Attention</h3>
        <button className="text-primary text-[13px] font-semibold hover:underline">View All</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F1F5F9] border-b border-outline-variant">
              {['Company Name', 'Status', 'Trust Score', 'Last Activity', 'Action'].map((h, i) => (
                <th
                  key={h}
                  className={`text-[11px] font-semibold uppercase tracking-wider text-secondary p-4 ${i === 4 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[14px]">
            {clients.map((client, i) => (
              <motion.tr
                key={client.company}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07 }}
                className="border-b border-outline-variant hover:bg-surface-container-lowest transition-colors h-[52px] group"
              >
                <td className="p-4 font-medium text-on-surface">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary text-[11px] font-bold flex-shrink-0 group-hover:scale-110 transition-transform">
                      {client.company.slice(0, 2)}
                    </div>
                    {client.company}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${client.statusStyle}`}>
                    {client.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-[60px] bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className={`${client.trustColor} h-1.5 rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${client.trustScore}%` }}
                        transition={{ delay: 0.6 + i * 0.07, duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <span className={`font-semibold ${trustTextColor[client.trustColor]}`}>
                      {client.trustScore}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-secondary">{client.lastActivity}</td>
                <td className="p-4 text-right">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className={`${client.actionStyle} px-3 py-1 rounded-lg transition-colors text-[12px] font-semibold`}
                  >
                    {client.actionLabel}
                  </motion.button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

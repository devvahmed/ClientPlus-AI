'use client';

import { motion } from 'framer-motion';

const defaultChartData = [
  { day: 'Day 1', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 5', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 10', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 15', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 20', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 25', emails: 0, calls: 0, meetings: 0 },
  { day: 'Day 30', emails: 0, calls: 0, meetings: 0 },
];

const legend = [
  { label: 'Emails', color: '#08478a' },
  { label: 'Calls', color: '#2e5fa3' },
  { label: 'Meetings', color: '#a9c7ff' },
];

export default function OutreachChart({ activeOutreach = 0 }: { activeOutreach?: number }) {
  const hasOutreach = activeOutreach > 0;

  // Real or active dataset
  const chartData = hasOutreach ? [
    { day: 'Week 1', emails: Math.max(1, activeOutreach), calls: 0, meetings: 0 },
    { day: 'Week 2', emails: Math.max(1, activeOutreach + 2), calls: 1, meetings: 0 },
    { day: 'Week 3', emails: Math.max(2, activeOutreach + 4), calls: 2, meetings: 1 },
    { day: 'Week 4', emails: Math.max(3, activeOutreach + 5), calls: 3, meetings: 1 },
  ] : defaultChartData;

  const maxVal = hasOutreach ? Math.max(...chartData.map(d => d.emails)) + 5 : 50;
  const chartH = 160;
  const gap = 60;

  return (
    <motion.div
      className="lg:col-span-2 bg-white rounded-xl border border-outline-variant card-shadow flex flex-col min-h-[320px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-surface-bright rounded-t-xl">
        <div>
          <h3 className="text-[15px] font-semibold text-on-surface">Outreach Activity</h3>
          <p className="text-[12px] text-secondary mt-0.5">Emails, calls & meetings tracked for your account</p>
        </div>
        <div className="flex items-center gap-3">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-[11px] text-secondary">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Content */}
      <div className="p-4 flex-1 flex flex-col justify-center overflow-x-auto relative">
        {!hasOutreach && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-secondary mb-2">
              <span className="material-symbols-outlined text-[20px]">bar_chart</span>
            </div>
            <p className="text-xs font-semibold text-on-surface mb-1">No outreach campaigns active yet</p>
            <p className="text-[11px] text-secondary max-w-[280px]">
              Discover prospects and generate emails to start populating your outreach analytics graph.
            </p>
          </div>
        )}

        <svg
          viewBox={`0 0 ${chartData.length * gap + 40} ${chartH + 40}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ minHeight: 180 }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <line
              key={i}
              x1="30"
              y1={chartH * pct + 10}
              x2={chartData.length * gap + 30}
              y2={chartH * pct + 10}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
          ))}

          {/* Bars */}
          {chartData.map((d, i) => {
            const x = i * gap + 50;
            const hEmails = (d.emails / maxVal) * chartH;

            return (
              <g key={d.day}>
                <rect
                  x={x - 12}
                  y={chartH - hEmails + 10}
                  width="24"
                  height={Math.max(2, hEmails)}
                  fill="#08478a"
                  rx="4"
                />
                <text
                  x={x}
                  y={chartH + 30}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                  fontWeight="500"
                >
                  {d.day}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}

'use client';

import { motion } from 'framer-motion';

// Simple SVG bar chart — backend-ready (replace data with API data)
const chartData = [
  { day: 'Jun 1', emails: 45, calls: 12, meetings: 5 },
  { day: 'Jun 5', emails: 62, calls: 18, meetings: 8 },
  { day: 'Jun 10', emails: 38, calls: 9, meetings: 3 },
  { day: 'Jun 15', emails: 85, calls: 24, meetings: 12 },
  { day: 'Jun 20', emails: 72, calls: 20, meetings: 9 },
  { day: 'Jun 25', emails: 95, calls: 30, meetings: 15 },
  { day: 'Jun 30', emails: 68, calls: 22, meetings: 11 },
];

const maxVal = 100;
const chartH = 160;
const barW = 24;
const gap = 48;

const legend = [
  { label: 'Emails', color: '#08478a' },
  { label: 'Calls', color: '#2e5fa3' },
  { label: 'Meetings', color: '#a9c7ff' },
];

export default function OutreachChart() {
  return (
    <motion.div
      className="lg:col-span-2 bg-white rounded-xl border border-outline-variant card-shadow flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright rounded-t-xl">
        <div>
          <h3 className="text-[15px] font-semibold text-on-surface">Outreach Activity (Last 30 Days)</h3>
          <p className="text-[12px] text-secondary mt-0.5">Emails, calls & meetings tracked</p>
        </div>
        <div className="flex items-center gap-3">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-[11px] text-secondary">{l.label}</span>
            </div>
          ))}
          <button className="text-secondary hover:text-primary transition-colors ml-2">
            <span className="material-symbols-outlined">more_vert</span>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 flex-1 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartData.length * gap + 60} ${chartH + 40}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ minHeight: 200 }}
        >
          {/* Y-axis gridlines */}
          {[0, 25, 50, 75, 100].map((v) => {
            const y = chartH - (v / maxVal) * chartH + 10;
            return (
              <g key={v}>
                <line x1={40} y1={y} x2={chartData.length * gap + 50} y2={y} stroke="#c3c6d2" strokeWidth={0.5} strokeDasharray="4" />
                <text x={32} y={y + 4} textAnchor="end" fontSize={9} fill="#5c5f61">{v}</text>
              </g>
            );
          })}

          {/* Bars */}
          {chartData.map((d, i) => {
            const x = i * gap + 50;
            const emailH = (d.emails / maxVal) * chartH;
            const callH = (d.calls / maxVal) * chartH;
            const meetH = (d.meetings / maxVal) * chartH;

            return (
              <g key={d.day}>
                {/* Email bar */}
                <motion.rect
                  x={x - barW / 2 - 8}
                  y={chartH + 10 - emailH}
                  width={barW / 3 + 1}
                  height={emailH}
                  rx={3}
                  fill="#08478a"
                  initial={{ scaleY: 0, originY: 1 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                  style={{ transformOrigin: `${x - barW / 2 - 8}px ${chartH + 10}px` }}
                />
                {/* Call bar */}
                <motion.rect
                  x={x - barW / 2 + 2}
                  y={chartH + 10 - callH}
                  width={barW / 3 + 1}
                  height={callH}
                  rx={3}
                  fill="#2e5fa3"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.45 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                  style={{ transformOrigin: `${x - barW / 2 + 2}px ${chartH + 10}px` }}
                />
                {/* Meeting bar */}
                <motion.rect
                  x={x - barW / 2 + 12}
                  y={chartH + 10 - meetH}
                  width={barW / 3 + 1}
                  height={meetH}
                  rx={3}
                  fill="#a9c7ff"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                  style={{ transformOrigin: `${x - barW / 2 + 12}px ${chartH + 10}px` }}
                />
                {/* X label */}
                <text x={x} y={chartH + 28} textAnchor="middle" fontSize={9} fill="#5c5f61">{d.day}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Backend-ready: replace with API fetch
type Priority = 'High' | 'Medium' | 'Low';
type Column = 'New Leads' | 'Contacted' | 'In Negotiation' | 'Closed Won';

interface Task {
  id: number;
  title: string;
  company: string;
  priority: Priority;
  dueDate: string;
  initials: string;
  color: string;
}

const initialColumns: Record<Column, Task[]> = {
  'New Leads': [
    { id: 1, title: 'Research company background', company: 'TechNova Corp', priority: 'High', dueDate: 'Today', initials: 'TN', color: 'bg-primary' },
    { id: 2, title: 'Prepare outreach email', company: 'GreenPath Energy', priority: 'Medium', dueDate: 'Tomorrow', initials: 'GP', color: 'bg-[#2e7d32]' },
    { id: 3, title: 'LinkedIn connection request', company: 'FinEdge Analytics', priority: 'Low', dueDate: 'Jul 20', initials: 'FA', color: 'bg-[#1565c0]' },
  ],
  'Contacted': [
    { id: 4, title: 'Follow-up email after no reply', company: 'Apex Solutions', priority: 'High', dueDate: 'Today', initials: 'AS', color: 'bg-orange-600' },
    { id: 5, title: 'Schedule discovery call', company: 'Summit Tech', priority: 'Medium', dueDate: 'Jul 18', initials: 'ST', color: 'bg-blue-600' },
  ],
  'In Negotiation': [
    { id: 6, title: 'Send custom proposal', company: 'Acme Corp', priority: 'High', dueDate: 'Today', initials: 'AC', color: 'bg-primary' },
    { id: 7, title: 'Review contract terms', company: 'Global Logistics', priority: 'Medium', dueDate: 'Jul 22', initials: 'GL', color: 'bg-[#00695c]' },
  ],
  'Closed Won': [
    { id: 8, title: 'Onboarding kickoff meeting', company: 'EcoGrow LLC', priority: 'Low', dueDate: 'Jul 25', initials: 'EG', color: 'bg-[#2e7d32]' },
  ],
};

const columnColors: Record<Column, string> = {
  'New Leads': 'bg-primary',
  'Contacted': 'bg-yellow-500',
  'In Negotiation': 'bg-blue-600',
  'Closed Won': 'bg-green-600',
};

const priorityBadge: Record<Priority, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-green-100 text-green-700',
};

const columns: Column[] = ['New Leads', 'Contacted', 'In Negotiation', 'Closed Won'];

export default function TasksPage() {
  const [taskCols, setTaskCols] = useState(initialColumns);

  const totalTasks = Object.values(taskCols).flat().length;

  return (
    <div className="p-6 pb-10">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-7 gap-4"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div>
          <h2 className="text-[36px] font-bold text-on-surface leading-tight tracking-tight">Task Board</h2>
          <p className="text-[16px] text-secondary mt-1">Manage your outreach pipeline. <span className="font-semibold text-on-surface">{totalTasks} tasks</span> total.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="bg-primary text-white font-semibold text-[15px] px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-primary-container transition-colors shadow-card shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Task
        </motion.button>
      </motion.div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {columns.map((col, ci) => (
          <motion.div
            key={col}
            className="w-[300px] sm:w-[320px] shrink-0 bg-surface-container-lowest rounded-2xl border border-outline-variant flex flex-col"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ci * 0.08, type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Column Header */}
            <div className="p-4 border-b border-outline-variant bg-[#F1F5F9] rounded-t-2xl flex justify-between items-center">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-on-surface flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${columnColors[col]}`} />
                {col}
              </h3>
              <span className="bg-surface-variant text-on-surface text-[12px] font-semibold px-2 py-0.5 rounded-full">
                {taskCols[col].length}
              </span>
            </div>

            {/* Tasks */}
            <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1">
              <AnimatePresence>
                {taskCols[col].map((task, ti) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ delay: ci * 0.08 + ti * 0.05 }}
                    whileHover={{ y: -2, boxShadow: '0px 4px 12px rgba(0,0,0,0.08)' }}
                    className="bg-white rounded-xl border border-outline-variant p-3 cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${priorityBadge[task.priority]}`}>
                        {task.priority}
                      </span>
                      <button className="text-outline opacity-0 group-hover:opacity-100 hover:text-primary transition-all">
                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                      </button>
                    </div>

                    <p className="text-[14px] font-medium text-on-surface mb-3 leading-snug">{task.title}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg ${task.color} text-white text-[10px] font-bold flex items-center justify-center`}>
                          {task.initials}
                        </div>
                        <span className="text-[12px] text-secondary truncate max-w-[120px]">{task.company}</span>
                      </div>
                      <div className={`flex items-center gap-1 text-[11px] font-medium ${task.dueDate === 'Today' ? 'text-error' : 'text-secondary'}`}>
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {task.dueDate}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add Task Button */}
            <div className="p-2 border-t border-outline-variant">
              <button className="w-full flex items-center gap-2 text-[13px] text-secondary hover:text-primary hover:bg-surface-container-low rounded-xl py-2 px-3 transition-colors">
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add task
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

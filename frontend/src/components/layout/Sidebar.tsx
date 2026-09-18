import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Upload,
  Briefcase,
  FileBarChart,
  Settings,
  GitBranch,
  Activity,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/active-users', icon: Activity, label: 'Active Users' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/results', icon: FileBarChart, label: 'Results' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 z-40 border-r border-[var(--border-color)] bg-[var(--sidebar-bg)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">GitFlow</h1>
          <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-widest">Manager</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to}>
              <motion.div
                className={cn('sidebar-item relative', isActive && 'active')}
                whileHover={{ x: 4 }}
                transition={{ duration: 0.15 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-brand-500"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[var(--border-color)]">
        <p className="text-[11px] text-[var(--text-muted)]">
          GitFlow Manager v1.0
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
          Secure &amp; Transparent
        </p>
      </div>
    </aside>
  );
}

import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Upload, Briefcase, FileBarChart, Settings, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/active-users', icon: Activity, label: 'Active' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/results', icon: FileBarChart, label: 'Results' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-[var(--border-color)]">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors',
                isActive ? 'text-brand-500' : 'text-[var(--text-muted)]'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

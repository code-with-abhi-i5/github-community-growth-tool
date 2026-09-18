import React from 'react';
import { Sun, Moon, LogOut, Github } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 glass border-b border-[var(--border-color)]">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left — mobile title */}
        <div className="lg:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Github className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[var(--text-primary)]">GitFlow</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Connection status */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-soft" />
              Connected
            </div>
          )}

          {/* Theme toggle */}
          <motion.button
            onClick={toggleTheme}
            className="btn-icon"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.button>

          {/* User profile */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.githubUsername}
                    className="w-8 h-8 rounded-full ring-2 ring-brand-500/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
                    {user.githubUsername[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:block text-sm font-medium text-[var(--text-primary)]">
                  {user.githubUsername}
                </span>
              </div>

              <motion.button
                onClick={logout}
                className="btn-icon"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

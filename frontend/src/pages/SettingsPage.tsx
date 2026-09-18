import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Github, LogOut, Shield, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Manage your preferences and account</p>
      </div>

      {/* Appearance */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          Appearance
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text-primary)]">Theme</p>
            <p className="text-xs text-[var(--text-muted)]">Switch between dark and light mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="relative w-14 h-7 rounded-full transition-colors duration-200"
            style={{ background: theme === 'dark' ? 'linear-gradient(135deg, #4c6ef5, #7c3aed)' : '#e9ecef' }}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-lg flex items-center justify-center"
              animate={{ left: theme === 'dark' ? '30px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              {theme === 'dark' ? <Moon className="w-3 h-3 text-brand-600" /> : <Sun className="w-3 h-3 text-yellow-500" />}
            </motion.div>
          </button>
        </div>
      </motion.div>

      {/* GitHub Account */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Github className="w-5 h-5" />
          GitHub Account
        </h3>
        {user && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--bg-secondary)]">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.githubUsername} className="w-12 h-12 rounded-full ring-2 ring-brand-500/30" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white text-lg font-bold">
                  {user.githubUsername[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{user.githubUsername}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-green-500 font-medium">Connected</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={`https://github.com/${user.githubUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm inline-flex items-center gap-2"
              >
                <Github className="w-4 h-4" /> View Profile
              </a>
              <button onClick={logout} className="btn-danger text-sm inline-flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Disconnect
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Security Info */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security
        </h3>
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
            <Info className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <p>OAuth tokens are stored server-side only. They are never exposed to the browser.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
            <Info className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <p>Sessions use secure HTTP-only cookies that cannot be read by JavaScript.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
            <Info className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <p>Only minimum required GitHub permissions are requested (user:follow, read:user).</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
            <Info className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <p>All API interactions use GitHub's official documented endpoints. No rate-limit bypass.</p>
          </div>
        </div>
      </motion.div>

      {/* About */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="font-semibold text-[var(--text-primary)] mb-2">About GitFlow Manager</h3>
        <p className="text-sm text-[var(--text-muted)]">
          Version 1.0.0 — A secure, transparent tool for managing GitHub follow lists
          using the official GitHub API.
        </p>
      </motion.div>
    </div>
  );
}

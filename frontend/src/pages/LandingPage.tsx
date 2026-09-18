import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Github, Shield, FileSpreadsheet, Activity, Briefcase, Download, Gauge } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../lib/api';

const features = [
  { icon: Shield, title: 'Secure GitHub OAuth', desc: 'No passwords stored. Official OAuth flow only.' },
  { icon: FileSpreadsheet, title: 'CSV & Excel Import', desc: 'Upload spreadsheets with auto-column detection.' },
  { icon: Activity, title: 'Real-Time Progress', desc: 'Live WebSocket updates as each action processes.' },
  { icon: Briefcase, title: 'Job Management', desc: 'Start, pause, resume, and stop with full control.' },
  { icon: Download, title: 'Exportable Results', desc: 'Download CSV or XLSX with summary reports.' },
  { icon: Gauge, title: 'Rate-Limit Aware', desc: 'Automatic backoff respecting GitHub API limits.' },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 rounded-full border-4 border-brand-500/30 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-600/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Github className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold">GitFlow Manager</span>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-sm font-medium mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Shield className="w-4 h-4" />
            Secure &amp; Transparent
          </motion.div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
            <span className="gradient-text">GitFlow Manager</span>
          </h1>

          <p className="text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Manage large GitHub username lists with a secure, transparent workflow.
            Upload spreadsheets, process follow actions through the official API,
            and track everything in real time.
          </p>

          <motion.a
            href={authApi.loginUrl}
            className="btn-primary inline-flex items-center gap-3 text-lg px-8 py-4"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </motion.a>

          <p className="text-xs text-[var(--text-muted)] mt-4">
            We only request the minimum permissions required. Your credentials are never stored.
          </p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto mt-20 w-full"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              className="glass-card group hover:border-brand-500/30 transition-colors"
              variants={item}
              whileHover={{ y: -4 }}
            >
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center mb-3 group-hover:bg-brand-500/20 transition-colors">
                <feature.icon className="w-5 h-5 text-brand-500" />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">{feature.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center px-6 py-6 text-xs text-[var(--text-muted)]">
        <p>Uses GitHub's official documented API only. No rate-limit bypass or browser automation.</p>
      </footer>
    </div>
  );
}

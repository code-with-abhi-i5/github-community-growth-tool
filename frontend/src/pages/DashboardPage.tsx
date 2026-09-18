import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, UserCheck, UserX, Clock, AlertTriangle, Ban, Gauge, ArrowRight, Upload,
} from 'lucide-react';
import { jobsApi, type Job } from '../lib/api';
import { getStatusLabel, formatRelativeTime } from '../lib/utils';

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  delay?: number;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(interval);
      } else {
        setDisplay(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{display.toLocaleString()}</span>;
}

function StatCard({ icon: Icon, label, value, color, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.4 }}
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-[var(--text-primary)]">
          <AnimatedNumber value={value} />
        </p>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

export function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data.jobs);
    } catch (e) {
      console.error('Failed to load jobs', e);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate stats across all jobs
  const stats = jobs.reduce(
    (acc, job) => ({
      total: acc.total + job.totalCount,
      pending: acc.pending + job.pendingCount,
      processing: acc.processing + job.processingCount,
      followed: acc.followed + job.followedCount,
      alreadyFollowing: acc.alreadyFollowing + job.alreadyFollowingCount,
      failed: acc.failed + job.failedCount,
      notFound: acc.notFound + job.notFoundCount,
      rateLimited: acc.rateLimited + job.rateLimitedCount,
    }),
    { total: 0, pending: 0, processing: 0, followed: 0, alreadyFollowing: 0, failed: 0, notFound: 0, rateLimited: 0 }
  );

  const activeJobs = jobs.filter((j) => j.status === 'PROCESSING' || j.status === 'PAUSED');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)]" />
              <div className="mt-3 space-y-2">
                <div className="h-7 w-16 bg-[var(--bg-secondary)] rounded" />
                <div className="h-4 w-24 bg-[var(--bg-secondary)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Overview of all your follow management activity</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Users" value={stats.total} color="bg-brand-500/10 text-brand-500" delay={0} />
        <StatCard icon={UserCheck} label="Followed" value={stats.followed} color="bg-green-500/10 text-green-500" delay={1} />
        <StatCard icon={Users} label="Already Following" value={stats.alreadyFollowing} color="bg-gray-500/10 text-gray-400" delay={2} />
        <StatCard icon={Clock} label="Pending" value={stats.pending} color="bg-yellow-500/10 text-yellow-500" delay={3} />
        <StatCard icon={Gauge} label="Processing" value={stats.processing} color="bg-blue-500/10 text-blue-500" delay={4} />
        <StatCard icon={UserX} label="Failed" value={stats.failed} color="bg-red-500/10 text-red-500" delay={5} />
        <StatCard icon={Ban} label="Not Found" value={stats.notFound} color="bg-gray-600/10 text-gray-500" delay={6} />
        <StatCard icon={AlertTriangle} label="Rate Limited" value={stats.rateLimited} color="bg-orange-500/10 text-orange-500" delay={7} />
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">Active Jobs</h3>
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const processed = job.totalCount - job.pendingCount - job.processingCount;
              const percent = job.totalCount > 0 ? Math.round((processed / job.totalCount) * 100) : 0;

              return (
                <Link key={job.id} to={`/jobs/${job.id}`} className="block">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-card)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {job.fileName || `Job ${job.id.slice(0, 8)}`}
                        </span>
                        <span className={`badge ${job.status === 'PROCESSING' ? 'badge-processing' : 'badge-pending'}`}>
                          {getStatusLabel(job.status)}
                        </span>
                      </div>
                      <div className="progress-bar mt-2">
                        <motion.div
                          className="progress-bar-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${percent}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--text-muted)]">
                        <span>{percent}% complete</span>
                        <span>{processed} / {job.totalCount} processed</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            Upload File
          </Link>
          <Link to="/jobs" className="btn-secondary inline-flex items-center gap-2 text-sm">
            <Users className="w-4 h-4" />
            View All Jobs
          </Link>
        </div>
      </motion.div>

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)]">Recent Jobs</h3>
            <Link to="/jobs" className="text-sm text-brand-500 hover:text-brand-400 font-medium">
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">File</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Followed</th>
                  <th className="table-header">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 5).map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="table-cell">
                      <Link to={`/jobs/${job.id}`} className="text-brand-500 hover:underline font-medium">
                        {job.fileName || `Job ${job.id.slice(0, 8)}`}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        job.status === 'COMPLETED' ? 'badge-followed' :
                        job.status === 'PROCESSING' ? 'badge-processing' :
                        job.status === 'PAUSED' ? 'badge-pending' :
                        job.status === 'FAILED' ? 'badge-failed' :
                        job.status === 'STOPPED' ? 'badge-ratelimited' :
                        'badge-pending'
                      }`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-sm">{job.totalCount}</td>
                    <td className="table-cell font-mono text-sm text-green-500">{job.followedCount}</td>
                    <td className="table-cell text-[var(--text-muted)]">{formatRelativeTime(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {jobs.length === 0 && (
        <motion.div
          className="glass-card text-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Upload className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No jobs yet</h3>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Upload a CSV or Excel file to get started.
          </p>
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Your First File
          </Link>
        </motion.div>
      )}
    </div>
  );
}

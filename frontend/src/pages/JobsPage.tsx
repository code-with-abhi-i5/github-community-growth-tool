import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, Trash2, Download, ArrowRight, Upload } from 'lucide-react';
import { jobsApi, type Job } from '../lib/api';
import { getStatusLabel, formatDate, downloadBlob } from '../lib/utils';
import toast from 'react-hot-toast';

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data.jobs);
    } catch {
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Delete this job? This cannot be undone.')) return;
    try {
      await jobsApi.delete(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success('Job deleted');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      toast.error(msg);
    }
  };

  const handleExport = async (jobId: string, format: 'csv' | 'xlsx') => {
    try {
      const blob = format === 'csv'
        ? await jobsApi.exportCsv(jobId)
        : await jobsApi.exportXlsx(jobId);
      downloadBlob(blob, `gitflow-results.${format}`);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Jobs</h2>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="glass-card animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Jobs</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">{jobs.length} total jobs</p>
        </div>
        <Link to="/upload" className="btn-primary text-sm inline-flex items-center gap-2">
          <Upload className="w-4 h-4" />
          New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <motion.div
          className="glass-card text-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Briefcase className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No jobs yet</h3>
          <p className="text-sm text-[var(--text-muted)] mb-6">Upload a file to create your first job.</p>
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload File
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job, index) => {
            const processed = job.totalCount - job.pendingCount - job.processingCount;
            const percent = job.totalCount > 0 ? Math.round((processed / job.totalCount) * 100) : 0;
            const jobStatusClass =
              job.status === 'COMPLETED' ? 'badge-followed' :
              job.status === 'PROCESSING' ? 'badge-processing' :
              job.status === 'PAUSED' ? 'badge-pending' :
              job.status === 'FAILED' ? 'badge-failed' :
              job.status === 'STOPPED' ? 'badge-ratelimited' :
              'badge-pending';

            return (
              <motion.div
                key={job.id}
                className="glass-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-[var(--text-primary)] truncate">
                        {job.fileName || `Job ${job.id.slice(0, 8)}`}
                      </h3>
                      <span className={`badge ${jobStatusClass}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>{job.totalCount} users</span>
                      <span>Created {formatDate(job.createdAt)}</span>
                      {job.completedAt && <span>Completed {formatDate(job.completedAt)}</span>}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--text-muted)]">
                        <span>{percent}%</span>
                        <span className="text-green-500">{job.followedCount} followed</span>
                        <span className="text-gray-400">{job.alreadyFollowingCount} already</span>
                        {job.failedCount > 0 && <span className="text-red-500">{job.failedCount} failed</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleExport(job.id, 'csv')}
                      className="btn-icon"
                      title="Export CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="btn-icon hover:text-red-500"
                      title="Delete job"
                      disabled={job.status === 'PROCESSING'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="btn-primary text-sm inline-flex items-center gap-2 px-4 py-2"
                    >
                      Open <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

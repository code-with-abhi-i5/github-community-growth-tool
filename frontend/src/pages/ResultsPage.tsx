import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileBarChart, ExternalLink, Copy } from 'lucide-react';
import { jobsApi, type Job, type JobItem } from '../lib/api';
import { getStatusColor, getStatusLabel, getStatusEmoji, downloadBlob, copyToClipboard } from '../lib/utils';
import toast from 'react-hot-toast';

const FILTER_TABS = ['ALL', 'FOLLOWED', 'ALREADY_FOLLOWING', 'FAILED', 'NOT_FOUND', 'RATE_LIMITED'];

export function ResultsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [items, setItems] = useState<JobItem[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data.jobs);
      if (data.jobs.length > 0) {
        setSelectedJobId(data.jobs[0].id);
      }
    } catch {
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedJobId) loadItems();
  }, [selectedJobId, filter]);

  const loadItems = async () => {
    try {
      const data = await jobsApi.getItems(selectedJobId, {
        limit: 100,
        status: filter === 'ALL' ? undefined : filter,
      });
      setItems(data.items);
    } catch {
      console.error('Failed to load items');
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!selectedJobId) return;
    try {
      const blob = format === 'csv'
        ? await jobsApi.exportCsv(selectedJobId)
        : await jobsApi.exportXlsx(selectedJobId);
      downloadBlob(blob, `gitflow-results.${format}`);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Results</h2>
        <div className="glass-card animate-pulse h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Results</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">View and export follow results</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary text-sm inline-flex items-center gap-2" disabled={!selectedJobId}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => handleExport('xlsx')} className="btn-primary text-sm inline-flex items-center gap-2" disabled={!selectedJobId}>
            <Download className="w-4 h-4" /> Export XLSX
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="glass-card text-center py-16">
          <FileBarChart className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No results yet</h3>
          <p className="text-sm text-[var(--text-muted)]">Complete a job to see results here.</p>
        </div>
      ) : (
        <>
          {/* Job selector */}
          <div className="glass-card">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Select Job</label>
            <select
              className="input"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.fileName || `Job ${job.id.slice(0, 8)}`} — {job.totalCount} users — {getStatusLabel(job.status)}
                </option>
              ))}
            </select>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === tab
                    ? 'bg-brand-500 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab === 'ALL' ? 'All' : getStatusLabel(tab)}
              </button>
            ))}
          </div>

          {/* Results table */}
          <div className="glass-card overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="table-header">Username</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Message</th>
                  <th className="table-header w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    className="hover:bg-[var(--bg-secondary)] transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.01 }}
                  >
                    <td className="table-cell font-mono text-sm font-medium">{item.username}</td>
                    <td className="table-cell">
                      <span className={`badge ${getStatusColor(item.status)}`}>
                        {getStatusEmoji(item.status)} {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="table-cell text-sm text-[var(--text-secondary)]">{item.message || '—'}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { copyToClipboard(item.username); toast.success('Copied!'); }}
                          className="btn-icon p-1.5"
                          title="Copy"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <a
                          href={`https://github.com/${item.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-icon p-1.5"
                          title="GitHub Profile"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">
                No results match this filter.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

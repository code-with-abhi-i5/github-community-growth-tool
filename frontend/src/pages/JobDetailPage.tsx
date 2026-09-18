import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play, Pause, Square, RotateCcw, Search, ExternalLink, Copy, Download,
  ChevronLeft, ChevronRight, Filter, AlertTriangle,
} from 'lucide-react';
import { jobsApi, type Job, type JobItem } from '../lib/api';
import { wsClient } from '../lib/websocket';
import { getStatusColor, getStatusLabel, getStatusEmoji, formatDate, downloadBlob, copyToClipboard } from '../lib/utils';
import toast from 'react-hot-toast';

const STATUSES = ['ALL', 'PENDING', 'PROCESSING', 'FOLLOWED', 'ALREADY_FOLLOWING', 'FAILED', 'NOT_FOUND', 'RATE_LIMITED'];

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    if (!id) return;
    try {
      const data = await jobsApi.get(id);
      setJob(data.job);
    } catch {
      toast.error('Failed to load job');
    }
  }, [id]);

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      const data = await jobsApi.getItems(id, {
        page,
        limit: pageSize,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search || undefined,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
      setTotalItems(data.pagination.total);
    } catch {
      console.error('Failed to load items');
    }
  }, [id, page, pageSize, statusFilter, search]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadJob(), loadItems()]);
      setLoading(false);
    };
    init();
  }, [loadJob, loadItems]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!id) return;

    wsClient.subscribeToJob(id);

    const unsubs = [
      wsClient.on('item:status', (data) => {
        if (data.jobId !== id) return;
        setItems((prev) => prev.map((item) =>
          item.id === data.itemId
            ? { ...item, status: data.status as string, message: data.message as string | null, attempts: data.attempts as number, processedAt: data.processedAt as string | null, updatedAt: new Date().toISOString() }
            : item
        ));
      }),
      wsClient.on('job:progress', (data) => {
        if (data.jobId !== id) return;
        setJob((prev) => prev ? {
          ...prev,
          pendingCount: data.pending as number,
          processingCount: data.processing as number,
          followedCount: data.followed as number,
          alreadyFollowingCount: data.alreadyFollowing as number,
          failedCount: data.failed as number,
          notFoundCount: data.notFound as number,
          rateLimitedCount: data.rateLimited as number,
        } : prev);
      }),
      wsClient.on('job:status', (data) => {
        if (data.jobId !== id) return;
        setJob((prev) => prev ? { ...prev, status: data.status as string } : prev);
        if (data.status === 'COMPLETED') {
          toast.success('Job completed!');
        }
      }),
      wsClient.on('rate-limit:warning', (data) => {
        if (data.jobId !== id) return;
        setRateLimitWarning(data.message as string);
        setTimeout(() => setRateLimitWarning(null), 30000);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      wsClient.unsubscribeFromJob(id);
    };
  }, [id]);

  const handleAction = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!id || actionLoading) return;

    if (action === 'stop') {
      if (!confirm('Stop this job?\n\nCompleted results will be preserved.\nPending users will remain pending.')) return;
    }

    setActionLoading(action);
    try {
      switch (action) {
        case 'start': await jobsApi.start(id); break;
        case 'pause': await jobsApi.pause(id); break;
        case 'resume': await jobsApi.resume(id); break;
        case 'stop': await jobsApi.stop(id); break;
      }
      await loadJob();
      toast.success(`Job ${action}ed`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Failed to ${action}`;
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (itemId: string) => {
    if (!id) return;
    try {
      await jobsApi.retryItem(id, itemId);
      toast.success('Item queued for retry');
      await loadItems();
    } catch {
      toast.error('Retry failed');
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!id) return;
    try {
      const blob = format === 'csv' ? await jobsApi.exportCsv(id) : await jobsApi.exportXlsx(id);
      downloadBlob(blob, `gitflow-results.${format}`);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  if (loading || !job) {
    return (
      <div className="space-y-6">
        <div className="glass-card animate-pulse h-40" />
        <div className="glass-card animate-pulse h-96" />
      </div>
    );
  }

  const processed = job.totalCount - job.pendingCount - job.processingCount;
  const percent = job.totalCount > 0 ? Math.round((processed / job.totalCount) * 100) : 0;

  const renderPagination = (position: 'top' | 'bottom') => {
    if (totalItems === 0) return null;

    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalItems);

    return (
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${
          position === 'top' ? 'mb-4 pb-3 border-b' : 'mt-4 pt-4 border-t'
        } border-[var(--border-color)]`}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>
            Showing <strong className="text-[var(--text-primary)] font-semibold">{startItem}</strong> to{' '}
            <strong className="text-[var(--text-primary)] font-semibold">{endItem}</strong> of{' '}
            <strong className="text-[var(--text-primary)] font-semibold">{totalItems}</strong> items
          </span>

          <div className="flex items-center gap-1.5 ml-1">
            <span>Per page:</span>
            <select
              className="input py-1 px-2 text-xs w-auto h-7 bg-[var(--bg-secondary)]"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50 (Default)</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] mr-2 font-medium">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="btn-secondary text-xs py-1 px-2 disabled:opacity-30 disabled:cursor-not-allowed"
            title="First Page"
          >
            First
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-icon p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Number jump buttons */}
          <div className="hidden sm:flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                    page === pageNum
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn-icon p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="btn-secondary text-xs py-1 px-2 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Last Page"
          >
            Last
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            {job.fileName || `Job ${job.id.slice(0, 8)}`}
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Created {formatDate(job.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary text-sm inline-flex items-center gap-2">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => handleExport('xlsx')} className="btn-secondary text-sm inline-flex items-center gap-2">
            <Download className="w-4 h-4" /> XLSX
          </button>
        </div>
      </div>

      {/* Rate limit warning */}
      {rateLimitWarning && (
        <motion.div
          className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-500">{rateLimitWarning}</p>
            <p className="text-xs text-orange-500/70 mt-0.5">The job will resume when it is safe to continue.</p>
          </div>
        </motion.div>
      )}

      {/* Progress & Controls */}
      <div className="glass-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <span className={`badge ${
            job.status === 'PROCESSING' ? 'badge-processing' :
            job.status === 'PAUSED' ? 'badge-pending' :
            job.status === 'COMPLETED' ? 'badge-followed' :
            job.status === 'STOPPED' ? 'badge-ratelimited' :
            'badge-pending'
          } text-sm`}>
            {getStatusLabel(job.status)}
          </span>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {(job.status === 'PENDING' || job.status === 'STOPPED') && (
              <motion.button
                onClick={() => handleAction('start')}
                className="btn-primary text-sm inline-flex items-center gap-2 px-4 py-2"
                disabled={actionLoading !== null}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Play className="w-4 h-4" /> Start
              </motion.button>
            )}
            {job.status === 'PROCESSING' && (
              <motion.button
                onClick={() => handleAction('pause')}
                className="btn-secondary text-sm inline-flex items-center gap-2 px-4 py-2"
                disabled={actionLoading !== null}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Pause className="w-4 h-4" /> Pause
              </motion.button>
            )}
            {job.status === 'PAUSED' && (
              <motion.button
                onClick={() => handleAction('resume')}
                className="btn-primary text-sm inline-flex items-center gap-2 px-4 py-2"
                disabled={actionLoading !== null}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Play className="w-4 h-4" /> Resume
              </motion.button>
            )}
            {(job.status === 'PROCESSING' || job.status === 'PAUSED') && (
              <motion.button
                onClick={() => handleAction('stop')}
                className="btn-danger text-sm inline-flex items-center gap-2 px-4 py-2"
                disabled={actionLoading !== null}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Square className="w-4 h-4" /> Stop
              </motion.button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-bar h-3 mb-3">
          <motion.div
            className="progress-bar-fill h-full"
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span className="font-mono">{percent}%</span>
          <span>{processed} / {job.totalCount} processed</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 mt-4 pt-4 border-t border-[var(--border-color)]">
          <div className="text-center">
            <p className="text-lg font-bold text-green-500">{job.followedCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Followed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-400">{job.alreadyFollowingCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Already</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-500">{job.pendingCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-500">{job.processingCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Processing</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-500">{job.failedCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-500">{job.notFoundCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Not Found</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-orange-500">{job.rateLimitedCount}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Rate Limited</p>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search username..."
              className="input pl-10"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--text-muted)]" />
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Status' : getStatusLabel(s)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Top Pagination */}
        {renderPagination('top')}

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr>
                <th className="table-header w-12">#</th>
                <th className="table-header">Username</th>
                <th className="table-header">Profile</th>
                <th className="table-header">Status</th>
                <th className="table-header">Attempts</th>
                <th className="table-header">Message</th>
                <th className="table-header">Updated</th>
                <th className="table-header w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <motion.tr
                  key={item.id}
                  className="hover:bg-[var(--bg-secondary)] transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <td className="table-cell text-[var(--text-muted)] font-mono text-xs">
                    {(page - 1) * 50 + index + 1}
                  </td>
                  <td className="table-cell font-medium font-mono text-sm">
                    {item.username}
                  </td>
                  <td className="table-cell">
                    <a
                      href={`https://github.com/${item.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-400 inline-flex items-center gap-1 text-xs"
                    >
                      <ExternalLink className="w-3 h-3" /> Profile
                    </a>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${getStatusColor(item.status)}`}>
                      {getStatusEmoji(item.status)} {getStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="table-cell font-mono text-xs text-[var(--text-muted)]">
                    {item.attempts}
                  </td>
                  <td className="table-cell text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                    {item.message || '—'}
                  </td>
                  <td className="table-cell text-xs text-[var(--text-muted)]">
                    {item.processedAt ? formatDate(item.processedAt) : '—'}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { copyToClipboard(item.username); toast.success('Copied!'); }}
                        className="btn-icon p-1.5"
                        title="Copy username"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {(item.status === 'FAILED' || item.status === 'NOT_FOUND' || item.status === 'RATE_LIMITED') && (
                        <button
                          onClick={() => handleRetry(item.id)}
                          className="btn-icon p-1.5 hover:text-brand-500"
                          title="Retry"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">
            No items match your filters.
          </div>
        )}

        {/* Bottom Pagination */}
        {renderPagination('bottom')}
      </div>
    </div>
  );
}

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Users,
  UserCheck,
  UserX,
  Zap,
  Clock,
  Star,
  GitBranch,
  Search,
  Download,
  ExternalLink,
  Copy,
  RefreshCw,
  Sparkles,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Code2,
  GitPullRequest,
  Box,
  Moon,
  Database,
  Trash2,
} from 'lucide-react';
import { activityApi, type UserActivityReport, type RateLimitData, type ActivitySummary } from '../lib/api';
import { downloadBlob, copyToClipboard } from '../lib/utils';
import toast from 'react-hot-toast';

type FilterStatus = 'ALL' | 'SUPER_ACTIVE' | 'ACTIVE' | 'MUTUAL' | 'NOT_MUTUAL' | 'INACTIVE';
type SortField = 'score' | 'recent' | 'stars' | 'followers' | 'repos' | 'completeness';

export function ActiveUsersPage() {
  const [reports, setReports] = useState<UserActivityReport[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalFollowing, setTotalFollowing] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [personaFilter, setPersonaFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');

  // Custom List Mode
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customUsernamesText, setCustomUsernamesText] = useState('');
  const [analyzingCustom, setAnalyzingCustom] = useState(false);
  const [clearingDb, setClearingDb] = useState(false);

  useEffect(() => {
    loadRateLimit();
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Try loading from SQLite Database first
      const saved = await activityApi.getSaved();
      if (saved.reports && saved.reports.length > 0) {
        setReports(saved.reports);
        setSummary(saved.summary);
        setInitialLoaded(true);
        toast.success(`Loaded ${saved.total} saved accounts from Database`, { icon: '💾' });
        setLoading(false);
        return;
      }
    } catch {
      // Fallback to GitHub live fetch if DB fetch fails
    }

    // 2. If nothing saved in DB yet, fetch live page 1 from GitHub
    await loadFollowingActivity(1, false, pageSize);
  };

  const handleClearDb = async () => {
    if (!window.confirm('Are you sure you want to delete all saved active users from the database?')) {
      return;
    }
    setClearingDb(true);
    try {
      const res = await activityApi.clearSaved();
      setReports([]);
      setSummary(null);
      toast.success(res.message || 'Saved accounts cleared from database');
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear database');
    } finally {
      setClearingDb(false);
    }
  };

  const loadRateLimit = async () => {
    try {
      const data = await activityApi.getRateLimit();
      setRateLimit(data.rateLimit);
    } catch {
      // Ignore rate limit background fetch error
    }
  };

  const calculateCombinedSummary = (allReports: UserActivityReport[]): ActivitySummary => ({
    totalScanned: allReports.length,
    superActive: allReports.filter((r) => r.activityStatus === 'SUPER_ACTIVE').length,
    active: allReports.filter((r) => r.activityStatus === 'ACTIVE').length,
    occasional: allReports.filter((r) => r.activityStatus === 'OCCASIONAL').length,
    inactive: allReports.filter((r) => r.activityStatus === 'INACTIVE').length,
    mutualFollowing: allReports.filter((r) => r.isMutualFollowing).length,
  });

  const loadFollowingActivity = async (pageToLoad: number = 1, append: boolean = false, size: number = pageSize) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await activityApi.getFollowingActivity(pageToLoad, size);
      
      setReports((prev) => {
        let combined: UserActivityReport[];
        if (append) {
          const existingUsernames = new Set(prev.map((r) => r.username.toLowerCase()));
          const newItems = data.reports.filter((r) => !existingUsernames.has(r.username.toLowerCase()));
          combined = [...prev, ...newItems];
        } else {
          combined = data.reports;
        }
        setSummary(calculateCombinedSummary(combined));
        return combined;
      });

      setPage(pageToLoad);
      setTotalFollowing(data.totalFollowing || data.total);
      setHasMore(data.hasMore);
      setRateLimit(data.rateLimit);
      setInitialLoaded(true);

      if (!append) {
        toast.success(`Loaded ${data.reports.length} accounts & saved to database!`);
      } else {
        toast.success(`Loaded ${data.reports.length} more accounts & saved to database!`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to analyze following accounts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadNextPage = async () => {
    if (!hasMore || loadingMore) return;
    await loadFollowingActivity(page + 1, true, pageSize);
  };

  const handleScanAll = async () => {
    if (scanningAll) return;
    setScanningAll(true);
    let currentPage = page;
    let keepGoing = hasMore;

    toast('Scanning all remaining following accounts in batches...', { icon: '⚡' });

    try {
      while (keepGoing) {
        currentPage += 1;
        const data = await activityApi.getFollowingActivity(currentPage, pageSize);
        
        if (data.reports.length === 0) {
          keepGoing = false;
          break;
        }

        setReports((prev) => {
          const existing = new Set(prev.map((r) => r.username.toLowerCase()));
          const fresh = data.reports.filter((r) => !existing.has(r.username.toLowerCase()));
          const combined = [...prev, ...fresh];
          setSummary(calculateCombinedSummary(combined));
          return combined;
        });

        setPage(currentPage);
        setTotalFollowing(data.totalFollowing || data.total);
        setHasMore(data.hasMore);
        setRateLimit(data.rateLimit);
        keepGoing = data.hasMore;

        // Small pause between batches
        await new Promise((res) => setTimeout(res, 500));
      }
      toast.success('Successfully scanned all following accounts!');
    } catch (err: any) {
      toast.error(err.message || 'Scan paused due to network/rate limit');
    } finally {
      setScanningAll(false);
    }
  };

  const handleAnalyzeCustom = async () => {
    const rawList = customUsernamesText
      .split(/[\n, ]+/)
      .map((u) => u.trim().replace(/^@/, ''))
      .filter(Boolean);

    if (rawList.length === 0) {
      toast.error('Please enter at least one GitHub username');
      return;
    }

    setAnalyzingCustom(true);
    try {
      const data = await activityApi.analyzeCustomList(rawList);
      setReports(data.reports);
      setSummary(data.summary);
      setRateLimit(data.rateLimit);
      setIsCustomMode(false);
      toast.success(`Analyzed ${data.reports.length} custom accounts!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to analyze custom usernames');
    } finally {
      setAnalyzingCustom(false);
    }
  };

  // ── Filtered and Sorted Reports ──
  const filteredReports = useMemo(() => {
    let list = [...reports];

    // Status Filter
    if (filterStatus === 'SUPER_ACTIVE') {
      list = list.filter((r) => r.activityStatus === 'SUPER_ACTIVE');
    } else if (filterStatus === 'ACTIVE') {
      list = list.filter((r) => r.activityStatus === 'ACTIVE');
    } else if (filterStatus === 'MUTUAL') {
      list = list.filter((r) => r.isMutualFollowing);
    } else if (filterStatus === 'NOT_MUTUAL') {
      list = list.filter((r) => !r.isMutualFollowing);
    } else if (filterStatus === 'INACTIVE') {
      list = list.filter((r) => r.activityStatus === 'INACTIVE' || r.activityStatus === 'OCCASIONAL');
    }

    // Persona Filter
    if (personaFilter !== 'ALL') {
      list = list.filter((r) => r.developerTag === personaFilter);
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.username.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.bio && r.bio.toLowerCase().includes(q)) ||
          (r.company && r.company.toLowerCase().includes(q)) ||
          (r.location && r.location.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortField === 'score') return b.activityScore - a.activityScore;
      if (sortField === 'recent') {
        const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return timeB - timeA;
      }
      if (sortField === 'stars') return b.totalStarsCount - a.totalStarsCount;
      if (sortField === 'followers') return b.followersCount - a.followersCount;
      if (sortField === 'repos') return b.publicReposCount - a.publicReposCount;
      if (sortField === 'completeness') return b.profileCompleteness - a.profileCompleteness;
      return 0;
    });

    return list;
  }, [reports, filterStatus, personaFilter, searchQuery, sortField]);

  // ── CSV Export ──
  const handleExportCsv = () => {
    if (reports.length === 0) return;

    const headers = [
      'Username',
      'Name',
      'Activity Status',
      'Activity Score (0-100)',
      'Follows You Back',
      'Developer Persona',
      'Last Active Date',
      'Last Action',
      'Public Repos',
      'Original Repos',
      'Forked Repos',
      'Total Stars Earned',
      'Followers',
      'Following',
      'Followers/Following Ratio',
      'Account Age (Years)',
      'Profile Completeness (%)',
      'Location',
      'Company',
      'GitHub URL',
    ];

    const rows = reports.map((r) => [
      `"${r.username}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.activityStatus}"`,
      r.activityScore,
      r.isMutualFollowing ? 'Yes (Mutual)' : 'No',
      `"${r.developerTag}"`,
      `"${r.lastActiveAt || 'Never'}"`,
      `"${(r.lastActionSummary || '').replace(/"/g, '""')}"`,
      r.publicReposCount,
      r.originalReposCount,
      r.forkedReposCount,
      r.totalStarsCount,
      r.followersCount,
      r.followingCount,
      r.followersRatio,
      r.accountAgeYears,
      `${r.profileCompleteness}%`,
      `"${(r.location || '').replace(/"/g, '""')}"`,
      `"${(r.company || '').replace(/"/g, '""')}"`,
      `"${r.githubUrl}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `github-active-users-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Exported as CSV');
  };

  // ── JSON Export ──
  const handleExportJson = () => {
    if (reports.length === 0) return;
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `github-active-users-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success('Exported as JSON');
  };

  const getPersonaBadge = (tag: string) => {
    switch (tag) {
      case 'Active Coder':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Code2 className="w-3 h-3" /> Active Coder
          </span>
        );
      case 'OSS Contributor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <GitPullRequest className="w-3 h-3" /> OSS Contributor
          </span>
        );
      case 'Repo Builder':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <Box className="w-3 h-3" /> Repo Builder
          </span>
        );
      case 'Stargazer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Star className="w-3 h-3 fill-amber-400" /> Stargazer
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
            <Moon className="w-3 h-3" /> Dormant Account
          </span>
        );
    }
  };

  const getStatusPill = (status: string, score: number) => {
    switch (status) {
      case 'SUPER_ACTIVE':
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/40 shadow-sm shadow-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Super Active
            </span>
            <span className="text-[11px] font-mono text-green-400/90 font-medium">Score: {score}/100</span>
          </div>
        );
      case 'ACTIVE':
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
            </span>
            <span className="text-[11px] font-mono text-emerald-400/80">Score: {score}/100</span>
          </div>
        );
      case 'OCCASIONAL':
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Occasional
            </span>
            <span className="text-[11px] font-mono text-amber-400/80">Score: {score}/100</span>
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Inactive / Dead
            </span>
            <span className="text-[11px] font-mono text-red-400/70">Score: {score}/100</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                Active Users Intelligence
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                  Live GitHub Matching
                </span>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Saved in DB: {reports.length}
                </span>
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                  Accurate activity scoring, commit recency, mutual follow checks, developer personas, and rate limit tracker.
                </p>
                {totalFollowing > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    Showing {reports.length} of {totalFollowing} following
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rate Limit Card & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {rateLimit && (
            <div className="glass px-3.5 py-2 rounded-xl border border-[var(--border-color)] flex items-center gap-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>API Quota</span>
                </div>
                <div className="text-xs font-bold text-[var(--text-primary)] font-mono">
                  {rateLimit.remaining.toLocaleString()} / {rateLimit.limit.toLocaleString()}
                </div>
              </div>
              <div className="w-16 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (rateLimit.remaining / rateLimit.limit) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Batch Size Selector */}
          <select
            className="input text-xs py-1.5 px-2 font-medium w-auto cursor-pointer"
            value={pageSize}
            onChange={(e) => {
              const newSize = parseInt(e.target.value, 10);
              setPageSize(newSize);
              loadFollowingActivity(1, false, newSize);
            }}
            title="Batch size per request"
          >
            <option value={30}>Batch: 30</option>
            <option value={50}>Batch: 50</option>
            <option value={100}>Batch: 100</option>
          </select>

          <button
            onClick={() => loadFollowingActivity(1, false, pageSize)}
            disabled={loading || scanningAll}
            className="btn-primary text-xs sm:text-sm inline-flex items-center gap-2 shadow-md shadow-brand-500/20"
            title="Scan live from GitHub (and auto-update database)"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Scanning...' : 'Sync Live'}
          </button>

          <button
            onClick={() => setIsCustomMode(!isCustomMode)}
            className="btn-secondary text-xs sm:text-sm inline-flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Custom List
          </button>

          <button
            onClick={handleExportCsv}
            disabled={reports.length === 0}
            className="btn-secondary text-xs sm:text-sm inline-flex items-center gap-1.5"
            title="Download full CSV report"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={handleExportJson}
            disabled={reports.length === 0}
            className="btn-secondary text-xs sm:text-sm inline-flex items-center gap-1.5"
            title="Download full JSON report"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>

          {reports.length > 0 && (
            <button
              onClick={handleClearDb}
              disabled={clearingDb || loading}
              className="btn-secondary text-xs sm:text-sm inline-flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
              title="Clear all saved active users from database"
            >
              <Trash2 className="w-4 h-4" />
              {clearingDb ? 'Clearing...' : 'Clear DB'}
            </button>
          )}
        </div>
      </div>

      {/* ── Custom List Modal / Drawer ── */}
      <AnimatePresence>
        {isCustomMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card border-brand-500/30 bg-brand-500/5 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  Analyze Any Custom Usernames List
                </h3>
                <span className="text-xs text-[var(--text-muted)]">Max 50 per batch (preserves rate limit)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Paste GitHub usernames separated by comma, space, or new lines. We will fetch their real-time activity,
                stars, repos, mutual follow status, and classify them.
              </p>
              <textarea
                className="input min-h-[90px] font-mono text-xs"
                placeholder="torvalds, gaearon, sindresorhus, antfu, sanchit-rishi"
                value={customUsernamesText}
                onChange={(e) => setCustomUsernamesText(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setIsCustomMode(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button
                  onClick={handleAnalyzeCustom}
                  disabled={analyzingCustom || !customUsernamesText.trim()}
                  className="btn-primary text-xs inline-flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${analyzingCustom ? 'animate-spin' : ''}`} />
                  {analyzingCustom ? 'Analyzing Live Profiles...' : 'Run Deep Analysis'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Summary Stats Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="glass-card p-3 sm:p-4 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Total Scanned
            </span>
            <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] font-mono mt-1">
              {summary.totalScanned}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">Evaluated profiles</span>
          </div>

          <div className="glass-card p-3 sm:p-4 border-l-4 border-l-green-500 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
              Super Active
            </span>
            <div className="text-xl sm:text-2xl font-bold text-green-400 font-mono mt-1">
              {summary.superActive}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">Active in ≤ 7 days</span>
          </div>

          <div className="glass-card p-3 sm:p-4 border-l-4 border-l-emerald-500 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Active Users
            </span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1">
              {summary.active}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">Active in ≤ 30 days</span>
          </div>

          <div className="glass-card p-3 sm:p-4 border-l-4 border-l-purple-500 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              Follows Back
            </span>
            <div className="text-xl sm:text-2xl font-bold text-purple-400 font-mono mt-1">
              {summary.mutualFollowing}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">Mutual connections</span>
          </div>

          <div className="glass-card p-3 sm:p-4 border-l-4 border-l-amber-500 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Occasional
            </span>
            <div className="text-xl sm:text-2xl font-bold text-amber-400 font-mono mt-1">
              {summary.occasional}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">31 – 90 days ago</span>
          </div>

          <div className="glass-card p-3 sm:p-4 border-l-4 border-l-red-500 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1">
              <UserX className="w-3.5 h-3.5" />
              Inactive / Dead
            </span>
            <div className="text-xl sm:text-2xl font-bold text-red-400 font-mono mt-1">
              {summary.inactive}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-1">90+ days inactive</span>
          </div>
        </div>
      )}

      {/* ── Filters & Controls Bar ── */}
      <div className="glass-card p-3 sm:p-4 space-y-3">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {[
            { id: 'ALL', label: `All (${reports.length})` },
            { id: 'SUPER_ACTIVE', label: '🟢 Super Active', color: 'text-green-400' },
            { id: 'ACTIVE', label: '🟢 Active', color: 'text-emerald-400' },
            { id: 'MUTUAL', label: '🔄 Follows Back', color: 'text-purple-400' },
            { id: 'NOT_MUTUAL', label: '➡️ Not Following Back', color: 'text-zinc-400' },
            { id: 'INACTIVE', label: '🔴 Inactive / Dead', color: 'text-red-400' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id as FilterStatus)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === tab.id
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1 border-t border-[var(--border-color)]">
          {/* Search Bar */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="input pl-9 text-xs"
              placeholder="Search by username, name, bio, location, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Persona Filter */}
          <div className="sm:col-span-3">
            <select
              className="input text-xs"
              value={personaFilter}
              onChange={(e) => setPersonaFilter(e.target.value)}
            >
              <option value="ALL">🏷️ All Developer Personas</option>
              <option value="Active Coder">🛠️ Active Coder</option>
              <option value="OSS Contributor">🌟 OSS Contributor</option>
              <option value="Repo Builder">📦 Repo Builder</option>
              <option value="Stargazer">⭐ Stargazer</option>
              <option value="Dormant Account">💤 Dormant Account</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="sm:col-span-4">
            <select
              className="input text-xs font-medium"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
            >
              <option value="score">⚡ Sort: Most Active First (Highest Score)</option>
              <option value="recent">🕒 Sort: Most Recent Activity</option>
              <option value="stars">⭐ Sort: Most Stars Earned</option>
              <option value="followers">👥 Sort: Most Followers</option>
              <option value="repos">📦 Sort: Most Repositories</option>
              <option value="completeness">🛡️ Sort: Profile Completeness Score</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Table View ── */}
      <div className="glass-card overflow-hidden p-0 border border-[var(--border-color)] shadow-xl">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px] text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-secondary)]/70 border-b border-[var(--border-color)]">
                <th className="py-3 px-3.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider w-10">
                  #
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[220px]">
                  User Profile
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[140px]">
                  Activity &amp; Score
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[130px]">
                  Mutual Follow
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[150px]">
                  Developer Tag
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[200px]">
                  Latest Activity
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[130px]">
                  Repos &amp; Stars
                </th>
                <th className="py-3 px-4 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[110px]">
                  Network
                </th>
                <th className="py-3 px-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider w-16 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]/60">
              {loading && !initialLoaded ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-full border-4 border-brand-500/30 border-t-brand-500 animate-spin" />
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Deeply analyzing GitHub profiles against all criteria...
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Querying public events, repo commits, PR activity, and mutual follow status.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="w-8 h-8 text-[var(--text-muted)]" />
                      <p className="text-sm font-medium text-[var(--text-primary)]">No matching users found</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Try changing the search keywords or filter tab, or click "Scan Following".
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((user, idx) => (
                  <motion.tr
                    key={user.username}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(0.2, idx * 0.01) }}
                    className="hover:bg-[var(--bg-secondary)]/50 transition-colors group"
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-3.5 text-xs font-mono text-[var(--text-muted)] font-medium">
                      {idx + 1}
                    </td>

                    {/* User Profile */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-start gap-3">
                        <img
                          src={user.avatarUrl}
                          alt={user.username}
                          className="w-10 h-10 rounded-xl object-cover bg-zinc-800 border border-[var(--border-color)] flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                              {user.name || user.username}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-brand-400 font-mono">
                            <span>@{user.username}</span>
                            <button
                              onClick={() => {
                                copyToClipboard(user.username);
                                toast.success(`@${user.username} copied!`);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-white"
                              title="Copy username"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          {user.bio && (
                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                              {user.bio}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-1">
                            <span>🎂 {user.accountAgeYears}y old</span>
                            <span>•</span>
                            <span title="Profile completeness based on avatar, bio, location, website">
                              🛡️ {user.profileCompleteness}% complete
                            </span>
                            {user.location && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[100px]">{user.location}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Activity Status & Score */}
                    <td className="py-3.5 px-4">{getStatusPill(user.activityStatus, user.activityScore)}</td>

                    {/* Follows Back */}
                    <td className="py-3.5 px-4">
                      {user.isMutualFollowing ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/40">
                          <UserCheck className="w-3.5 h-3.5" /> Follows You
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                          <UserX className="w-3.5 h-3.5" /> Not Following
                        </span>
                      )}
                    </td>

                    {/* Persona Tag */}
                    <td className="py-3.5 px-4">{getPersonaBadge(user.developerTag)}</td>

                    {/* Latest Activity */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]">
                          <Clock className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                          <span>{user.lastActiveFormatted}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 max-w-[240px]">
                          {user.lastActionSummary}
                        </p>
                        {user.recentEventsCount > 0 && (
                          <span className="text-[10px] text-brand-400 font-mono">
                            {user.recentEventsCount} recent public events
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Repos & Stars */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <div className="flex items-center gap-1 text-amber-400 font-semibold font-mono">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{user.totalStarsCount.toLocaleString()} stars</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {user.publicReposCount} repos
                          <span className="text-[10px] text-[var(--text-muted)] ml-1">
                            ({user.originalReposCount} orig / {user.forkedReposCount} fork)
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Network (Followers) */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col text-xs font-mono">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {user.followersCount.toLocaleString()} followers
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Ratio: {user.followersRatio}x
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-3 text-center">
                      <a
                        href={user.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-icon p-2 inline-flex items-center justify-center hover:text-brand-400 hover:bg-brand-500/10"
                        title="Open GitHub Profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination / Load More Footer ── */}
        {reports.length > 0 && (
          <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)] font-mono">
              Showing <span className="text-[var(--text-primary)] font-bold">{reports.length}</span> of{' '}
              <span className="text-[var(--text-primary)] font-bold">{totalFollowing || reports.length}</span> following accounts
            </div>

            <div className="flex items-center gap-2">
              {hasMore ? (
                <>
                  <button
                    onClick={handleLoadNextPage}
                    disabled={loadingMore || scanningAll}
                    className="btn-secondary text-xs inline-flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingMore ? 'animate-spin' : ''}`} />
                    {loadingMore ? 'Loading Next Batch...' : `Load Next ${pageSize} Users`}
                  </button>
                  <button
                    onClick={handleScanAll}
                    disabled={loadingMore || scanningAll}
                    className="btn-primary text-xs inline-flex items-center gap-2 shadow-sm"
                  >
                    <Zap className={`w-3.5 h-3.5 text-amber-300 ${scanningAll ? 'animate-spin' : ''}`} />
                    {scanningAll ? 'Scanning All Remaining...' : `Scan All Remaining (${Math.max(0, totalFollowing - reports.length)})`}
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All {reports.length} Following Accounts Analyzed!
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const API_BASE = '/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...headers,
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
  };

  if (body) {
    config.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (response.status === 401) {
    throw new ApiError(401, 'Authentication required');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, data.error || 'Request failed');
  }

  // Handle blob responses for file downloads
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('text/csv') || contentType.includes('spreadsheetml'))) {
    return response.blob() as unknown as T;
  }

  return response.json();
}

// ── Auth ──────────────────────────────────────
export const authApi = {
  getMe: () => apiFetch<{ id: string; githubUsername: string; avatarUrl: string | null }>('/auth/me'),
  logout: () => apiFetch<{ message: string }>('/auth/logout', { method: 'POST' }),
  loginUrl: `${API_BASE}/auth/github`,
};

// ── Jobs ──────────────────────────────────────
export interface Job {
  id: string;
  userId: string;
  status: string;
  fileName: string | null;
  totalCount: number;
  pendingCount: number;
  processingCount: number;
  followedCount: number;
  alreadyFollowingCount: number;
  failedCount: number;
  notFoundCount: number;
  rateLimitedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface JobItem {
  id: string;
  jobId: string;
  username: string;
  status: string;
  attempts: number;
  message: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationReport {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  invalidDetails: Array<{ raw: string; reason: string }>;
  duplicateValues: string[];
}

export interface CreateJobResponse {
  job: Job;
  validation: ValidationReport;
  columns: string[];
  selectedColumn: number;
}

export interface PaginatedItems {
  items: JobItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const jobsApi = {
  create: (file: File, columnIndex?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    if (columnIndex !== undefined) {
      formData.append('columnIndex', String(columnIndex));
    }
    return apiFetch<CreateJobResponse>('/jobs', { method: 'POST', body: formData });
  },

  createFromText: (text: string, jobName?: string) => {
    return apiFetch<CreateJobResponse>('/jobs/text', {
      method: 'POST',
      body: { text, jobName },
    });
  },

  list: () => apiFetch<{ jobs: Job[] }>('/jobs'),

  get: (id: string) => apiFetch<{ job: Job }>(`/jobs/${id}`),

  start: (id: string) => apiFetch<{ message: string; itemsQueued: number }>(`/jobs/${id}/start`, { method: 'POST' }),

  pause: (id: string) => apiFetch<{ message: string }>(`/jobs/${id}/pause`, { method: 'POST' }),

  resume: (id: string) => apiFetch<{ message: string }>(`/jobs/${id}/resume`, { method: 'POST' }),

  stop: (id: string) => apiFetch<{ message: string }>(`/jobs/${id}/stop`, { method: 'POST' }),

  delete: (id: string) => apiFetch<{ message: string }>(`/jobs/${id}`, { method: 'DELETE' }),

  getItems: (id: string, params: { page?: number; limit?: number; status?: string; search?: string } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.status) searchParams.set('status', params.status);
    if (params.search) searchParams.set('search', params.search);
    return apiFetch<PaginatedItems>(`/jobs/${id}/items?${searchParams.toString()}`);
  },

  retryItem: (jobId: string, itemId: string) =>
    apiFetch<{ message: string }>(`/jobs/${jobId}/items/${itemId}/retry`, { method: 'POST' }),

  exportCsv: (id: string) => apiFetch<Blob>(`/jobs/${id}/export/csv`),

  exportXlsx: (id: string) => apiFetch<Blob>(`/jobs/${id}/export/xlsx`),
};

// ── Activity Intelligence ──────────────────────
export interface UserActivityReport {
  username: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  githubUrl: string;
  createdAt: string;
  accountAgeYears: number;
  profileCompleteness: number; // 0 - 100%
  followersCount: number;
  followingCount: number;
  followersRatio: number;
  isMutualFollowing: boolean;
  publicReposCount: number;
  originalReposCount: number;
  forkedReposCount: number;
  totalStarsCount: number;
  lastActiveAt: string | null;
  lastActiveFormatted: string;
  lastActionSummary: string;
  daysSinceActive: number | null;
  activityStatus: 'SUPER_ACTIVE' | 'ACTIVE' | 'OCCASIONAL' | 'INACTIVE';
  activityScore: number;
  developerTag: 'Active Coder' | 'OSS Contributor' | 'Repo Builder' | 'Stargazer' | 'Dormant Account';
  recentEventsCount: number;
  scannedAt?: string;
}

export interface ActivitySummary {
  totalScanned: number;
  superActive: number;
  active: number;
  occasional: number;
  inactive: number;
  mutualFollowing: number;
}

export interface RateLimitData {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface FollowingActivityResponse {
  reports: UserActivityReport[];
  total: number;
  page: number;
  limit: number;
  totalFollowing: number;
  hasMore: boolean;
  rateLimit: RateLimitData;
  summary: ActivitySummary;
}

export interface SavedActivityResponse {
  reports: UserActivityReport[];
  total: number;
  summary: ActivitySummary;
}

export const activityApi = {
  getRateLimit: () => apiFetch<{ rateLimit: RateLimitData }>('/activity/rate-limit'),
  
  getFollowingActivity: (page: number = 1, limit: number = 30) =>
    apiFetch<FollowingActivityResponse>(`/activity/following?page=${page}&limit=${limit}`),
    
  analyzeCustomList: (usernames: string[]) =>
    apiFetch<{ reports: UserActivityReport[]; total: number; rateLimit: RateLimitData; summary: ActivitySummary }>(
      '/activity/analyze',
      { method: 'POST', body: { usernames } }
    ),

  getSaved: () =>
    apiFetch<SavedActivityResponse>('/activity/saved'),

  clearSaved: () =>
    apiFetch<{ message: string; deletedCount: number }>('/activity/saved', { method: 'DELETE' }),
};

export { ApiError };


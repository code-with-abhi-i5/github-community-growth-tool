// Types shared across the backend

declare global {
  namespace Express {
    interface User {
      id: string;
      githubId: string;
      githubUsername: string;
      avatarUrl: string | null;
      accessToken: string;
    }
  }
}

export interface GitHubProfile {
  id: string;
  username: string;
  displayName: string;
  photos: Array<{ value: string }>;
  _json: {
    login: string;
    avatar_url: string;
  };
}

export interface JobProgress {
  jobId: string;
  total: number;
  pending: number;
  processing: number;
  followed: number;
  alreadyFollowing: number;
  failed: number;
  notFound: number;
  rateLimited: number;
}

export interface ItemStatusUpdate {
  jobId: string;
  itemId: string;
  username: string;
  status: string;
  message: string | null;
  attempts: number;
  processedAt: string | null;
}

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ValidationResult {
  valid: string[];
  invalid: Array<{ raw: string; reason: string }>;
  duplicates: string[];
  total: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

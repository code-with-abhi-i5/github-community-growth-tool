import logger from '../config/logger';
import type { RateLimitInfo } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubApiResponse {
  status: number;
  ok: boolean;
  data?: unknown;
  rateLimitInfo: RateLimitInfo;
  error?: string;
}

async function githubFetch(
  endpoint: string,
  accessToken: string,
  method: string = 'GET'
): Promise<GitHubApiResponse> {
  const url = `${GITHUB_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GitFlow-Manager/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const rateLimitInfo: RateLimitInfo = {
    limit: parseInt(response.headers.get('x-ratelimit-limit') || '0', 10),
    remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '0', 10),
    reset: parseInt(response.headers.get('x-ratelimit-reset') || '0', 10),
    retryAfter: response.headers.get('retry-after')
      ? parseInt(response.headers.get('retry-after')!, 10)
      : undefined,
  };

  let data: unknown = undefined;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      // Some responses like 204 have no body
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
    rateLimitInfo,
    error: !response.ok ? (data as { message?: string })?.message || response.statusText : undefined,
  };
}

/**
 * Check if the authenticated user is following a given username.
 * GET /user/following/{username}
 * Returns 204 if following, 404 if not following.
 */
export async function checkFollowing(
  accessToken: string,
  username: string
): Promise<GitHubApiResponse> {
  return githubFetch(`/user/following/${encodeURIComponent(username)}`, accessToken, 'GET');
}

/**
 * Follow a user.
 * PUT /user/following/{username}
 * Returns 204 on success.
 */
export async function followUser(
  accessToken: string,
  username: string
): Promise<GitHubApiResponse> {
  return githubFetch(`/user/following/${encodeURIComponent(username)}`, accessToken, 'PUT');
}

/**
 * Check if a GitHub user exists.
 * GET /users/{username}
 */
export async function checkUserExists(
  accessToken: string,
  username: string
): Promise<GitHubApiResponse> {
  return githubFetch(`/users/${encodeURIComponent(username)}`, accessToken, 'GET');
}

/**
 * Determine if we should pause for rate limiting.
 */
export function shouldPauseForRateLimit(rateLimitInfo: RateLimitInfo): boolean {
  return rateLimitInfo.remaining <= 5;
}

/**
 * Calculate how long to wait until rate limit resets.
 */
export function getRateLimitWaitMs(rateLimitInfo: RateLimitInfo): number {
  if (rateLimitInfo.retryAfter) {
    return rateLimitInfo.retryAfter * 1000;
  }

  const now = Math.floor(Date.now() / 1000);
  const waitSeconds = Math.max(rateLimitInfo.reset - now, 0) + 5; // Add 5s buffer
  return waitSeconds * 1000;
}

import logger from '../config/logger';
import type { RateLimitInfo } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

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
  
  // Network
  followersCount: number;
  followingCount: number;
  followersRatio: number;
  isMutualFollowing: boolean; // Does this user follow the authenticated user back?
  
  // Repositories & Quality
  publicReposCount: number;
  originalReposCount: number;
  forkedReposCount: number;
  totalStarsCount: number;
  
  // Activity
  lastActiveAt: string | null;
  lastActiveFormatted: string;
  lastActionSummary: string;
  daysSinceActive: number | null;
  activityStatus: 'SUPER_ACTIVE' | 'ACTIVE' | 'OCCASIONAL' | 'INACTIVE';
  activityScore: number; // 0 - 100
  developerTag: 'Active Coder' | 'OSS Contributor' | 'Repo Builder' | 'Stargazer' | 'Dormant Account';
  recentEventsCount: number;
}

// In-memory cache for analyzed users (expires after 10 minutes)
const activityCache = new Map<string, { data: UserActivityReport; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Fetch GitHub API helper with rate limit extraction
 */
async function githubFetch(
  endpoint: string,
  accessToken: string
): Promise<{ status: number; ok: boolean; data: any; rateLimit: RateLimitInfo }> {
  const url = `${GITHUB_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'GitFlow-Manager/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const rateLimit: RateLimitInfo = {
    limit: parseInt(response.headers.get('x-ratelimit-limit') || '5000', 10),
    remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '5000', 10),
    reset: parseInt(response.headers.get('x-ratelimit-reset') || '0', 10),
    retryAfter: response.headers.get('retry-after')
      ? parseInt(response.headers.get('retry-after')!, 10)
      : undefined,
  };

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  return { status: response.status, ok: response.ok, data, rateLimit };
}

/**
 * Fetch current rate limit status
 */
export async function getRateLimitStatus(accessToken: string): Promise<RateLimitInfo> {
  const res = await githubFetch('/rate_limit', accessToken);
  if (res.data && res.data.rate) {
    return {
      limit: res.data.rate.limit,
      remaining: res.data.rate.remaining,
      reset: res.data.rate.reset,
    };
  }
  return res.rateLimit;
}

/**
 * Fetch authenticated user profile to get total following count
 */
export async function getAuthUserProfile(
  accessToken: string
): Promise<{ following: number; followers: number; public_repos: number }> {
  const res = await githubFetch('/user', accessToken);
  return {
    following: res.data?.following || 0,
    followers: res.data?.followers || 0,
    public_repos: res.data?.public_repos || 0,
  };
}

/**
 * Fetch list of users the authenticated user is following
 */
export async function getFollowingUsers(
  accessToken: string,
  page: number = 1,
  perPage: number = 50
): Promise<{ users: Array<{ login: string; avatar_url: string; html_url: string }>; rateLimit: RateLimitInfo }> {
  const safePerPage = Math.min(100, Math.max(5, perPage));
  const res = await githubFetch(`/user/following?page=${page}&per_page=${safePerPage}`, accessToken);
  return {
    users: Array.isArray(res.data) ? res.data : [],
    rateLimit: res.rateLimit,
  };
}

/**
 * Check if target user follows authenticated user back (Mutual Follow)
 * GET /users/{username}/following/{targetUser} -> 204 if true, 404 if false
 */
export async function checkFollowsBack(
  accessToken: string,
  targetUsername: string,
  authUsername: string
): Promise<boolean> {
  try {
    const res = await githubFetch(
      `/users/${encodeURIComponent(targetUsername)}/following/${encodeURIComponent(authUsername)}`,
      accessToken
    );
    return res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Deeply analyze a single GitHub user against all criteria
 */
export async function analyzeUser(
  accessToken: string,
  username: string,
  authUsername: string
): Promise<{ report: UserActivityReport; rateLimit: RateLimitInfo }> {
  const cacheKey = `${username}:${authUsername}`;
  const cached = activityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      report: cached.data,
      rateLimit: { limit: 5000, remaining: 4900, reset: 0 },
    };
  }

  // 1. Fetch user profile
  const userRes = await githubFetch(`/users/${encodeURIComponent(username)}`, accessToken);
  const profile = userRes.data || {};
  let latestRateLimit = userRes.rateLimit;

  // 2. Fetch public events (up to 30 recent events)
  const eventsRes = await githubFetch(`/users/${encodeURIComponent(username)}/events/public?per_page=30`, accessToken);
  const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];
  latestRateLimit = eventsRes.rateLimit;

  // 3. Fetch top repos (for stars and original vs forked count)
  const reposRes = await githubFetch(`/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=30`, accessToken);
  const repos = Array.isArray(reposRes.data) ? reposRes.data : [];
  latestRateLimit = reposRes.rateLimit;

  // 4. Check mutual follow back
  let isMutual = false;
  if (authUsername && authUsername.toLowerCase() !== username.toLowerCase()) {
    isMutual = await checkFollowsBack(accessToken, username, authUsername);
  }

  // ── Calculate Repos & Stars ──
  let originalReposCount = 0;
  let forkedReposCount = 0;
  let totalStarsCount = 0;

  for (const repo of repos) {
    if (repo.fork) {
      forkedReposCount++;
    } else {
      originalReposCount++;
    }
    totalStarsCount += repo.stargazers_count || 0;
  }

  // Account creation & age
  const createdAt = profile.created_at || new Date().toISOString();
  const createdDate = new Date(createdAt);
  const now = new Date();
  const accountAgeYears = Math.max(
    0.1,
    Math.round(((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10
  );

  // Profile Completeness Score
  let profileCompleteness = 30; // base for existing username
  const isDefaultAvatar = (profile.avatar_url || '').includes('identicon') || (profile.avatar_url || '').includes('gravatar.com/avatar/');
  if (!isDefaultAvatar && profile.avatar_url) profileCompleteness += 20;
  if (profile.name) profileCompleteness += 15;
  if (profile.bio) profileCompleteness += 15;
  if (profile.location) profileCompleteness += 10;
  if (profile.blog || profile.twitter_username) profileCompleteness += 10;
  profileCompleteness = Math.min(100, profileCompleteness);

  // ── Analyze Events & Activity ──
  let lastActiveAt: string | null = null;
  let lastActionSummary = 'No recent public activity';
  let daysSinceActive: number | null = null;
  let pushEventsCount = 0;
  let prEventsCount = 0;
  let issueEventsCount = 0;
  let watchEventsCount = 0;

  if (events.length > 0) {
    const firstEvent = events[0];
    lastActiveAt = firstEvent.created_at;
    const lastActiveDate = new Date(firstEvent.created_at);
    daysSinceActive = Math.max(0, Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Summarize latest action
    const repoName = firstEvent.repo?.name || 'a repository';
    switch (firstEvent.type) {
      case 'PushEvent': {
        const commitCount = firstEvent.payload?.commits?.length || 1;
        lastActionSummary = `Pushed ${commitCount} commit${commitCount > 1 ? 's' : ''} to ${repoName}`;
        break;
      }
      case 'PullRequestEvent': {
        const action = firstEvent.payload?.action || 'opened';
        lastActionSummary = `${action.charAt(0).toUpperCase() + action.slice(1)} PR #${firstEvent.payload?.pull_request?.number || ''} in ${repoName}`;
        break;
      }
      case 'IssuesEvent': {
        const action = firstEvent.payload?.action || 'opened';
        lastActionSummary = `${action.charAt(0).toUpperCase() + action.slice(1)} issue in ${repoName}`;
        break;
      }
      case 'CreateEvent': {
        const refType = firstEvent.payload?.ref_type || 'branch/repo';
        lastActionSummary = `Created ${refType} in ${repoName}`;
        break;
      }
      case 'WatchEvent':
        lastActionSummary = `Starred ${repoName}`;
        break;
      case 'ForkEvent':
        lastActionSummary = `Forked ${repoName}`;
        break;
      case 'IssueCommentEvent':
        lastActionSummary = `Commented on issue in ${repoName}`;
        break;
      default:
        lastActionSummary = `Activity in ${repoName}`;
        break;
    }

    // Count event types for Persona detection
    for (const ev of events) {
      if (ev.type === 'PushEvent') pushEventsCount++;
      else if (ev.type === 'PullRequestEvent') prEventsCount++;
      else if (ev.type === 'IssuesEvent' || ev.type === 'IssueCommentEvent') issueEventsCount++;
      else if (ev.type === 'WatchEvent') watchEventsCount++;
    }
  } else if (repos.length > 0 && repos[0].pushed_at) {
    // Fallback to repo pushed_at
    lastActiveAt = repos[0].pushed_at;
    const lastActiveDate = new Date(repos[0].pushed_at);
    daysSinceActive = Math.max(0, Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)));
    lastActionSummary = `Pushed code to ${repos[0].name}`;
  }

  // ── Determine Activity Status & Score ──
  let activityStatus: 'SUPER_ACTIVE' | 'ACTIVE' | 'OCCASIONAL' | 'INACTIVE' = 'INACTIVE';
  let activityScore = 15;

  if (daysSinceActive !== null) {
    if (daysSinceActive <= 7) {
      activityStatus = 'SUPER_ACTIVE';
      activityScore = Math.min(100, 90 + Math.min(10, events.length));
    } else if (daysSinceActive <= 30) {
      activityStatus = 'ACTIVE';
      activityScore = Math.min(89, 70 + Math.min(15, events.length));
    } else if (daysSinceActive <= 90) {
      activityStatus = 'OCCASIONAL';
      activityScore = Math.min(69, 40 + Math.min(20, events.length));
    } else {
      activityStatus = 'INACTIVE';
      activityScore = Math.max(5, 30 - Math.min(25, Math.floor(daysSinceActive / 30)));
    }
  }

  // ── Determine Developer Persona Tag ──
  let developerTag: 'Active Coder' | 'OSS Contributor' | 'Repo Builder' | 'Stargazer' | 'Dormant Account' = 'Dormant Account';
  if (activityStatus === 'INACTIVE' && events.length === 0) {
    developerTag = 'Dormant Account';
  } else if (prEventsCount >= 2 || issueEventsCount >= 3) {
    developerTag = 'OSS Contributor';
  } else if (pushEventsCount >= 3) {
    developerTag = 'Active Coder';
  } else if (originalReposCount >= 5) {
    developerTag = 'Repo Builder';
  } else if (watchEventsCount >= 3) {
    developerTag = 'Stargazer';
  } else if (events.length > 0) {
    developerTag = 'Active Coder';
  }

  // Format relative time
  let lastActiveFormatted = 'Never / No public activity';
  if (daysSinceActive !== null) {
    if (daysSinceActive === 0) lastActiveFormatted = 'Today';
    else if (daysSinceActive === 1) lastActiveFormatted = 'Yesterday';
    else if (daysSinceActive < 30) lastActiveFormatted = `${daysSinceActive} days ago`;
    else if (daysSinceActive < 365) lastActiveFormatted = `${Math.floor(daysSinceActive / 30)} months ago`;
    else lastActiveFormatted = `${Math.floor(daysSinceActive / 365)} years ago`;
  }

  const followersCount = profile.followers || 0;
  const followingCount = profile.following || 0;
  const followersRatio = followingCount > 0 ? Math.round((followersCount / followingCount) * 10) / 10 : followersCount;

  const report: UserActivityReport = {
    username: profile.login || username,
    name: profile.name || null,
    avatarUrl: profile.avatar_url || '',
    bio: profile.bio || null,
    location: profile.location || null,
    company: profile.company || null,
    blog: profile.blog || null,
    githubUrl: profile.html_url || `https://github.com/${username}`,
    createdAt,
    accountAgeYears,
    profileCompleteness,
    followersCount,
    followingCount,
    followersRatio,
    isMutualFollowing: isMutual,
    publicReposCount: profile.public_repos || repos.length,
    originalReposCount,
    forkedReposCount,
    totalStarsCount,
    lastActiveAt,
    lastActiveFormatted,
    lastActionSummary,
    daysSinceActive,
    activityStatus,
    activityScore,
    developerTag,
    recentEventsCount: events.length,
  };

  // Cache result
  activityCache.set(cacheKey, { data: report, timestamp: Date.now() });

  return { report, rateLimit: latestRateLimit };
}

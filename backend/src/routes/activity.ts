import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getRateLimitStatus,
  getFollowingUsers,
  getAuthUserProfile,
  analyzeUser,
  UserActivityReport,
} from '../services/activityService';
import prisma from '../services/database';
import logger from '../config/logger';

const router = Router();

// Helper: Run async tasks with concurrency limit
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        const res = await fn(items[i]);
        results[i] = res;
      } catch (err) {
        logger.error(`Error processing item index ${i}:`, err);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

// Helper: Save/upsert scanned reports into database
async function saveScannedReportsToDb(userId: string, reports: UserActivityReport[]) {
  if (!reports || reports.length === 0) return;
  try {
    await Promise.all(
      reports.map((r) =>
        prisma.scannedUser.upsert({
          where: {
            userId_username: {
              userId,
              username: r.username,
            },
          },
          create: {
            userId,
            username: r.username,
            name: r.name,
            avatarUrl: r.avatarUrl,
            bio: r.bio,
            location: r.location,
            company: r.company,
            blog: r.blog,
            githubUrl: r.githubUrl,
            createdAt: r.createdAt,
            accountAgeYears: r.accountAgeYears,
            profileCompleteness: r.profileCompleteness,
            followersCount: r.followersCount,
            followingCount: r.followingCount,
            followersRatio: r.followersRatio,
            isMutualFollowing: r.isMutualFollowing,
            publicReposCount: r.publicReposCount,
            originalReposCount: r.originalReposCount,
            forkedReposCount: r.forkedReposCount,
            totalStarsCount: r.totalStarsCount,
            lastActiveAt: r.lastActiveAt,
            lastActiveFormatted: r.lastActiveFormatted,
            lastActionSummary: r.lastActionSummary,
            daysSinceActive: r.daysSinceActive,
            activityStatus: r.activityStatus,
            activityScore: r.activityScore,
            developerTag: r.developerTag,
            recentEventsCount: r.recentEventsCount,
          },
          update: {
            name: r.name,
            avatarUrl: r.avatarUrl,
            bio: r.bio,
            location: r.location,
            company: r.company,
            blog: r.blog,
            githubUrl: r.githubUrl,
            createdAt: r.createdAt,
            accountAgeYears: r.accountAgeYears,
            profileCompleteness: r.profileCompleteness,
            followersCount: r.followersCount,
            followingCount: r.followingCount,
            followersRatio: r.followersRatio,
            isMutualFollowing: r.isMutualFollowing,
            publicReposCount: r.publicReposCount,
            originalReposCount: r.originalReposCount,
            forkedReposCount: r.forkedReposCount,
            totalStarsCount: r.totalStarsCount,
            lastActiveAt: r.lastActiveAt,
            lastActiveFormatted: r.lastActiveFormatted,
            lastActionSummary: r.lastActionSummary,
            daysSinceActive: r.daysSinceActive,
            activityStatus: r.activityStatus,
            activityScore: r.activityScore,
            developerTag: r.developerTag,
            recentEventsCount: r.recentEventsCount,
            scannedAt: new Date(),
          },
        })
      )
    );
    logger.info(`Persisted ${reports.length} user activity reports to database for user ${userId}`);
  } catch (err: any) {
    logger.error('Failed to save scanned reports to database', { error: err.message });
  }
}

/**
 * GET /api/activity/rate-limit
 * Fetch live GitHub rate limit status for current user token
 */
router.get('/rate-limit', requireAuth, async (req: Request, res: Response) => {
  try {
    const accessToken = req.user!.accessToken;
    const rateLimit = await getRateLimitStatus(accessToken);
    res.json({ rateLimit });
  } catch (err: any) {
    logger.error('Failed to get rate limit status', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch rate limit info' });
  }
});

/**
 * GET /api/activity/saved
 * Fetch all previously scanned users stored in database for the authenticated user
 */
router.get('/saved', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const dbReports = await prisma.scannedUser.findMany({
      where: { userId },
      orderBy: { activityScore: 'desc' },
    });

    const reports: (UserActivityReport & { scannedAt?: string })[] = dbReports.map((db) => ({
      username: db.username,
      name: db.name,
      avatarUrl: db.avatarUrl || '',
      bio: db.bio,
      location: db.location,
      company: db.company,
      blog: db.blog,
      githubUrl: db.githubUrl,
      createdAt: db.createdAt || new Date().toISOString(),
      accountAgeYears: db.accountAgeYears,
      profileCompleteness: db.profileCompleteness,
      followersCount: db.followersCount,
      followingCount: db.followingCount,
      followersRatio: db.followersRatio,
      isMutualFollowing: db.isMutualFollowing,
      publicReposCount: db.publicReposCount,
      originalReposCount: db.originalReposCount,
      forkedReposCount: db.forkedReposCount,
      totalStarsCount: db.totalStarsCount,
      lastActiveAt: db.lastActiveAt,
      lastActiveFormatted: db.lastActiveFormatted,
      lastActionSummary: db.lastActionSummary,
      daysSinceActive: db.daysSinceActive,
      activityStatus: db.activityStatus as any,
      activityScore: db.activityScore,
      developerTag: db.developerTag as any,
      recentEventsCount: db.recentEventsCount,
      scannedAt: db.scannedAt.toISOString(),
    }));

    const summary = {
      totalScanned: reports.length,
      superActive: reports.filter((r) => r.activityStatus === 'SUPER_ACTIVE').length,
      active: reports.filter((r) => r.activityStatus === 'ACTIVE').length,
      occasional: reports.filter((r) => r.activityStatus === 'OCCASIONAL').length,
      inactive: reports.filter((r) => r.activityStatus === 'INACTIVE').length,
      mutualFollowing: reports.filter((r) => r.isMutualFollowing).length,
    };

    res.json({
      reports,
      total: reports.length,
      summary,
    });
  } catch (err: any) {
    logger.error('Failed to get saved active users', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch saved active users' });
  }
});

/**
 * DELETE /api/activity/saved
 * Clear all saved scanned users for the authenticated user
 */
router.delete('/saved', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { count } = await prisma.scannedUser.deleteMany({
      where: { userId },
    });
    res.json({ message: 'Saved intelligence data cleared', deletedCount: count });
  } catch (err: any) {
    logger.error('Failed to clear saved active users', { error: err.message });
    res.status(500).json({ error: 'Failed to clear saved active users' });
  }
});

/**
 * GET /api/activity/following
 * Fetch and analyze following users for the authenticated GitHub user
 */
router.get('/following', requireAuth, async (req: Request, res: Response) => {
  try {
    const accessToken = req.user!.accessToken;
    const authUsername = req.user!.githubUsername;
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit as string, 10) || 50));

    logger.info(`Analyzing following users for @${authUsername} (page ${page}, limit ${limit})`);

    // Fetch user profile to know total following count
    const authProfile = await getAuthUserProfile(accessToken);
    const totalFollowing = authProfile.following;

    // 1. Get following list for this page
    const followingResult = await getFollowingUsers(accessToken, page, limit);
    const usersToAnalyze = followingResult.users;

    if (usersToAnalyze.length === 0) {
      res.json({
        reports: [],
        total: 0,
        page,
        limit,
        totalFollowing,
        hasMore: false,
        rateLimit: followingResult.rateLimit,
        summary: {
          totalScanned: 0,
          superActive: 0,
          active: 0,
          occasional: 0,
          inactive: 0,
          mutualFollowing: 0,
        },
      });
      return;
    }

    // 2. Concurrently analyze users (concurrency: 5)
    let latestRateLimit = followingResult.rateLimit;
    const reports = await mapConcurrent(usersToAnalyze, 5, async (u) => {
      const { report, rateLimit } = await analyzeUser(accessToken, u.login, authUsername);
      latestRateLimit = rateLimit;
      return report;
    });

    // 3. Sort by activityScore descending (Most active on top)
    reports.sort((a, b) => b.activityScore - a.activityScore);

    // 4. Save to database automatically
    await saveScannedReportsToDb(userId, reports);

    // 5. Calculate stats summary
    const summary = {
      totalScanned: reports.length,
      superActive: reports.filter((r) => r.activityStatus === 'SUPER_ACTIVE').length,
      active: reports.filter((r) => r.activityStatus === 'ACTIVE').length,
      occasional: reports.filter((r) => r.activityStatus === 'OCCASIONAL').length,
      inactive: reports.filter((r) => r.activityStatus === 'INACTIVE').length,
      mutualFollowing: reports.filter((r) => r.isMutualFollowing).length,
    };

    const hasMore = page * limit < totalFollowing;

    res.json({
      reports,
      total: reports.length,
      page,
      limit,
      totalFollowing,
      hasMore,
      rateLimit: latestRateLimit,
      summary,
    });
  } catch (err: any) {
    logger.error('Error fetching following activity', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to analyze following activity' });
  }
});

/**
 * POST /api/activity/analyze
 * Analyze a custom list of usernames
 */
router.post('/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const accessToken = req.user!.accessToken;
    const authUsername = req.user!.githubUsername;
    const userId = req.user!.id;
    const { usernames } = req.body;

    if (!Array.isArray(usernames) || usernames.length === 0) {
      res.status(400).json({ error: 'Please provide an array of usernames' });
      return;
    }

    const uniqueUsernames = Array.from(
      new Set(usernames.map((u) => String(u).trim().replace(/^@/, '')).filter(Boolean))
    ).slice(0, 50); // Cap at 50 to preserve rate limits

    logger.info(`Analyzing custom list of ${uniqueUsernames.length} usernames`);

    let latestRateLimit = await getRateLimitStatus(accessToken);
    const reports = await mapConcurrent(uniqueUsernames, 4, async (username) => {
      const { report, rateLimit } = await analyzeUser(accessToken, username, authUsername);
      latestRateLimit = rateLimit;
      return report;
    });

    reports.sort((a, b) => b.activityScore - a.activityScore);

    // Save to database automatically
    await saveScannedReportsToDb(userId, reports);

    const summary = {
      totalScanned: reports.length,
      superActive: reports.filter((r) => r.activityStatus === 'SUPER_ACTIVE').length,
      active: reports.filter((r) => r.activityStatus === 'ACTIVE').length,
      occasional: reports.filter((r) => r.activityStatus === 'OCCASIONAL').length,
      inactive: reports.filter((r) => r.activityStatus === 'INACTIVE').length,
      mutualFollowing: reports.filter((r) => r.isMutualFollowing).length,
    };

    res.json({
      reports,
      total: reports.length,
      rateLimit: latestRateLimit,
      summary,
    });
  } catch (err: any) {
    logger.error('Error in custom analyze', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to analyze custom users' });
  }
});

export default router;

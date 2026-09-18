import { Worker, Job as BullJob } from 'bullmq';
import { getRedisConnection, setFollowWorker, registerProcessor, checkRedisAvailable, type FollowJobData } from '../services/queue';
import { checkFollowing, followUser, shouldPauseForRateLimit, getRateLimitWaitMs } from '../services/githubApi';
import { wsService } from '../services/websocket';
import prisma from '../services/database';
import logger from '../config/logger';
import { config } from '../config';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateJobCounts(jobId: string): Promise<void> {
  const counts = await prisma.jobItem.groupBy({
    by: ['status'],
    where: { jobId },
    _count: { status: true },
  });

  const statusMap: Record<string, number> = {};
  for (const c of counts) {
    statusMap[c.status] = c._count.status;
  }

  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      pendingCount: statusMap['PENDING'] || 0,
      processingCount: statusMap['PROCESSING'] || 0,
      followedCount: statusMap['FOLLOWED'] || 0,
      alreadyFollowingCount: statusMap['ALREADY_FOLLOWING'] || 0,
      failedCount: statusMap['FAILED'] || 0,
      notFoundCount: statusMap['NOT_FOUND'] || 0,
      rateLimitedCount: statusMap['RATE_LIMITED'] || 0,
    },
    include: { user: true },
  });

  // Check if job is complete
  const pendingOrProcessing = (statusMap['PENDING'] || 0) + (statusMap['PROCESSING'] || 0);
  if (pendingOrProcessing === 0 && job.status === 'PROCESSING') {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    wsService.broadcastJobStatus(jobId, job.userId, 'COMPLETED');
  }

  // Broadcast progress
  wsService.broadcastJobProgress(jobId, job.userId, {
    jobId,
    total: job.totalCount,
    pending: statusMap['PENDING'] || 0,
    processing: statusMap['PROCESSING'] || 0,
    followed: statusMap['FOLLOWED'] || 0,
    alreadyFollowing: statusMap['ALREADY_FOLLOWING'] || 0,
    failed: statusMap['FAILED'] || 0,
    notFound: statusMap['NOT_FOUND'] || 0,
    rateLimited: statusMap['RATE_LIMITED'] || 0,
  });
}

export async function processFollowItem(bullJob: { data: FollowJobData; attemptsMade: number }): Promise<void> {
  const { jobId, itemId, username, userId, accessToken } = bullJob.data;

  // Check if job is still active
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'STOPPED' || job.status === 'COMPLETED') {
    logger.debug(`Skipping item ${itemId} — job ${jobId} is ${job?.status || 'not found'}`);
    return;
  }

  // Update item to processing
  await prisma.jobItem.update({
    where: { id: itemId },
    data: { status: 'PROCESSING' },
  });

  wsService.broadcastItemUpdate(jobId, userId, {
    jobId,
    itemId,
    username,
    status: 'PROCESSING',
    message: `Processing ${username}...`,
    attempts: bullJob.attemptsMade + 1,
    processedAt: null,
  });

  try {
    // Add delay between requests to be respectful
    await sleep(config.rateLimits.processingDelayMs);

    // Step 1: Check if already following
    const checkResult = await checkFollowing(accessToken, username);

    // Handle rate limiting
    if (checkResult.status === 403 || checkResult.status === 429) {
      if (shouldPauseForRateLimit(checkResult.rateLimitInfo)) {
        const waitMs = getRateLimitWaitMs(checkResult.rateLimitInfo);
        logger.warn(`Rate limited. Waiting ${waitMs}ms`, { username, jobId });

        await prisma.jobItem.update({
          where: { id: itemId },
          data: { status: 'RATE_LIMITED', message: 'Rate limited — will retry', attempts: { increment: 1 } },
        });

        wsService.broadcastRateLimitWarning(jobId, userId, waitMs);
        await updateJobCounts(jobId);

        // Re-add with delay
        throw new Error(`RATE_LIMITED:${waitMs}`);
      }
    }

    if (checkResult.status === 204) {
      // Already following
      const now = new Date();
      await prisma.jobItem.update({
        where: { id: itemId },
        data: {
          status: 'ALREADY_FOLLOWING',
          message: 'Already following this user',
          processedAt: now,
          attempts: { increment: 1 },
        },
      });

      wsService.broadcastItemUpdate(jobId, userId, {
        jobId,
        itemId,
        username,
        status: 'ALREADY_FOLLOWING',
        message: 'Already following this user',
        attempts: bullJob.attemptsMade + 1,
        processedAt: now.toISOString(),
      });

      await updateJobCounts(jobId);
      return;
    }

    if (checkResult.status === 404) {
      // Not following — proceed to follow
      const followResult = await followUser(accessToken, username);

      // Handle rate limiting on follow
      if (followResult.status === 403 || followResult.status === 429) {
        if (shouldPauseForRateLimit(followResult.rateLimitInfo)) {
          const waitMs = getRateLimitWaitMs(followResult.rateLimitInfo);
          await prisma.jobItem.update({
            where: { id: itemId },
            data: { status: 'RATE_LIMITED', message: 'Rate limited — will retry', attempts: { increment: 1 } },
          });
          wsService.broadcastRateLimitWarning(jobId, userId, waitMs);
          await updateJobCounts(jobId);
          throw new Error(`RATE_LIMITED:${waitMs}`);
        }
      }

      if (followResult.status === 204 || followResult.status === 200) {
        // Successfully followed
        const now = new Date();
        await prisma.jobItem.update({
          where: { id: itemId },
          data: {
            status: 'FOLLOWED',
            message: 'Follow successful',
            processedAt: now,
            attempts: { increment: 1 },
          },
        });

        wsService.broadcastItemUpdate(jobId, userId, {
          jobId,
          itemId,
          username,
          status: 'FOLLOWED',
          message: 'Follow successful',
          attempts: bullJob.attemptsMade + 1,
          processedAt: now.toISOString(),
        });

        await updateJobCounts(jobId);
        return;
      }

      if (followResult.status === 404) {
        // User does not exist
        const now = new Date();
        await prisma.jobItem.update({
          where: { id: itemId },
          data: {
            status: 'NOT_FOUND',
            message: 'GitHub user does not exist',
            processedAt: now,
            attempts: { increment: 1 },
          },
        });

        wsService.broadcastItemUpdate(jobId, userId, {
          jobId,
          itemId,
          username,
          status: 'NOT_FOUND',
          message: 'GitHub user does not exist',
          attempts: bullJob.attemptsMade + 1,
          processedAt: now.toISOString(),
        });

        await updateJobCounts(jobId);
        return;
      }

      // Other error
      throw new Error(followResult.error || `GitHub API returned ${followResult.status}`);
    }

    // Unexpected status from check
    throw new Error(checkResult.error || `Unexpected status ${checkResult.status} from check`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // If it's a rate limit error, rethrow so BullMQ retries with backoff
    if (errorMessage.startsWith('RATE_LIMITED:')) {
      throw error;
    }

    // Final attempt?
    if (bullJob.attemptsMade + 1 >= config.rateLimits.maxRetriesPerItem) {
      const now = new Date();
      await prisma.jobItem.update({
        where: { id: itemId },
        data: {
          status: 'FAILED',
          message: errorMessage,
          processedAt: now,
          attempts: { increment: 1 },
        },
      });

      wsService.broadcastItemUpdate(jobId, userId, {
        jobId,
        itemId,
        username,
        status: 'FAILED',
        message: errorMessage,
        attempts: bullJob.attemptsMade + 1,
        processedAt: now.toISOString(),
      });

      await updateJobCounts(jobId);
      return;
    }

    // Will be retried by BullMQ
    await prisma.jobItem.update({
      where: { id: itemId },
      data: {
        status: 'PENDING',
        message: `Retrying: ${errorMessage}`,
        attempts: { increment: 1 },
      },
    });

    await updateJobCounts(jobId);
    throw error;
  }
}

export async function startFollowWorker(): Promise<Worker | null> {
  registerProcessor(processFollowItem);
  const hasRedis = await checkRedisAvailable();
  if (!hasRedis) {
    logger.info('In-memory queue processor registered (standalone mode)');
    return null;
  }

  const worker = new Worker('github-follow', processFollowItem, {
    connection: getRedisConnection(),
    concurrency: 1, // Process one at a time to respect rate limits
    limiter: {
      max: 1,
      duration: config.rateLimits.processingDelayMs,
    },
  });

  worker.on('completed', (job) => {
    logger.debug(`Follow job completed: ${job.data.username}`);
  });

  worker.on('failed', (job, error) => {
    if (job) {
      logger.warn(`Follow job failed: ${job.data.username}`, {
        error: error.message,
        attempts: job.attemptsMade,
      });
    }
  });

  worker.on('error', (error) => {
    logger.error('Worker error', { error: error.message });
  });

  setFollowWorker(worker);
  logger.info('Follow worker started (BullMQ)');
  return worker;
}

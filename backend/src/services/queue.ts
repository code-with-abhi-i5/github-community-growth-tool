import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import logger from '../config/logger';

export interface FollowJobData {
  jobId: string;
  itemId: string;
  username: string;
  userId: string;
  accessToken: string;
}

type ProcessHandler = (item: { data: FollowJobData; attemptsMade: number }) => Promise<void>;

let processor: ProcessHandler | null = null;

export function registerProcessor(fn: ProcessHandler): void {
  processor = fn;
}

// ── In-Memory Queue Fallback ──────────────────────────────────
interface QueuedItem {
  data: FollowJobData;
  attempts: number;
}

class MemoryQueueRunner {
  private queue: QueuedItem[] = [];
  private isProcessing = false;
  private isPaused = false;

  enqueue(items: FollowJobData[]): void {
    for (const item of items) {
      this.queue.push({ data: item, attempts: 0 });
    }
    logger.info(`[Queue] Enqueued ${items.length} follow items. In-queue total: ${this.queue.length}`);
    this.processNext();
  }

  pause(): void {
    this.isPaused = true;
    logger.info('[Queue] In-memory queue paused');
  }

  resume(): void {
    this.isPaused = false;
    logger.info('[Queue] In-memory queue resumed');
    this.processNext();
  }

  removeByJobId(jobId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((item) => item.data.jobId !== jobId);
    logger.info(`[Queue] Removed ${before - this.queue.length} queue items for job ${jobId}`);
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.isPaused || this.queue.length === 0) {
      return;
    }

    if (!processor) {
      logger.warn('[Queue] No item processor registered yet');
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      await processor({ data: item.data, attemptsMade: item.attempts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Queue] Item processing notice: ${msg}`);

      if (msg.startsWith('RATE_LIMITED:')) {
        const parts = msg.split(':');
        const waitMs = parseInt(parts[1] || '5000', 10);
        logger.info(`[Queue] Rate limit triggered. Pausing queue for ${waitMs}ms`);
        this.queue.unshift(item); // Re-insert at head
        setTimeout(() => {
          this.processNext();
        }, waitMs);
        this.isProcessing = false;
        return;
      }

      if (item.attempts + 1 < config.rateLimits.maxRetriesPerItem) {
        item.attempts++;
        this.queue.push(item);
      }
    } finally {
      this.isProcessing = false;
      setTimeout(() => {
        this.processNext();
      }, 50);
    }
  }
}

const memoryQueue = new MemoryQueueRunner();

// ── Redis Connection & BullMQ ─────────────────────────────────
let connection: IORedis | null = null;
let followQueue: Queue | null = null;
let followWorker: Worker | null = null;
let queueEvents: QueueEvents | null = null;
let redisAvailable: boolean | null = null;

export async function checkRedisAvailable(): Promise<boolean> {
  if (redisAvailable !== null) return redisAvailable;
  try {
    const testRedis = new IORedis(config.redis.url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 800,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    testRedis.on('error', () => {});
    await testRedis.connect();
    await testRedis.ping();
    await testRedis.quit();
    redisAvailable = true;
    logger.info('Redis detected — utilizing BullMQ distributed queue');
    return true;
  } catch {
    redisAvailable = false;
    logger.info('Redis not detected — utilizing high-performance in-memory queue fallback');
    return false;
  }
}

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    connection.on('error', (err) => {
      logger.debug('Redis connection error (fallback in effect)', { error: err.message });
    });
  }
  return connection;
}

export function getFollowQueue(): Queue {
  if (!followQueue) {
    followQueue = new Queue('github-follow', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: config.rateLimits.maxRetriesPerItem,
        backoff: {
          type: 'exponential',
          delay: config.rateLimits.processingDelayMs,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });
  }
  return followQueue;
}

export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    queueEvents = new QueueEvents('github-follow', {
      connection: getRedisConnection(),
    });
  }
  return queueEvents;
}

export async function enqueueFollowItems(items: FollowJobData[]): Promise<void> {
  const hasRedis = await checkRedisAvailable();
  if (hasRedis) {
    const queue = getFollowQueue();
    const jobs = items.map((item) => ({
      name: 'follow',
      data: item,
      opts: {
        jobId: item.itemId,
        delay: 0,
      },
    }));
    await queue.addBulk(jobs);
    logger.info(`Enqueued ${items.length} follow items via BullMQ`);
  } else {
    memoryQueue.enqueue(items);
  }
}

export async function pauseQueue(): Promise<void> {
  const hasRedis = await checkRedisAvailable();
  if (hasRedis) {
    const queue = getFollowQueue();
    await queue.pause();
  }
  memoryQueue.pause();
  logger.info('Follow queue paused');
}

export async function resumeQueue(): Promise<void> {
  const hasRedis = await checkRedisAvailable();
  if (hasRedis) {
    const queue = getFollowQueue();
    await queue.resume();
  }
  memoryQueue.resume();
  logger.info('Follow queue resumed');
}

export async function removeJobItems(jobId: string): Promise<void> {
  const hasRedis = await checkRedisAvailable();
  if (hasRedis) {
    try {
      const queue = getFollowQueue();
      const waiting = await queue.getWaiting();
      const delayed = await queue.getDelayed();
      const toRemove = [...waiting, ...delayed].filter((j) => j.data.jobId === jobId);
      for (const job of toRemove) {
        await job.remove();
      }
    } catch (e) {
      logger.debug('Error removing from BullMQ', { error: e });
    }
  }
  memoryQueue.removeByJobId(jobId);
}

export async function shutdownQueue(): Promise<void> {
  if (followWorker) await followWorker.close();
  if (queueEvents) await queueEvents.close();
  if (followQueue) await followQueue.close();
  if (connection) {
    try {
      await connection.quit();
    } catch {}
  }
  logger.info('Queue connections closed');
}

export function setFollowWorker(worker: Worker): void {
  followWorker = worker;
}

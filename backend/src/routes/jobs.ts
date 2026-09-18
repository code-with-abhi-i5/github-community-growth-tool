import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { parseFile, detectUsernameColumn } from '../services/fileParser';
import { validateUsernames } from '../services/usernameValidator';
import { enqueueFollowItems, pauseQueue, resumeQueue, removeJobItems } from '../services/queue';
import { exportJobAsCsv, exportJobAsXlsx } from '../services/export';
import prisma from '../services/database';
import logger from '../config/logger';
import { config } from '../config';
import { wsService } from '../services/websocket';
import type { FollowJobData } from '../services/queue';

const router = Router();

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = config.upload.dir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, XLSX, and XLS files are supported'));
    }
  },
});

// Apply auth to all job routes
router.use(requireAuth);

/**
 * POST /api/jobs — Upload file and create a new job
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const columnIndex = req.body.columnIndex !== undefined
      ? parseInt(req.body.columnIndex, 10)
      : undefined;

    // Parse file
    const parsed = parseFile(req.file.path, req.file.mimetype);

    // Detect or use provided column index
    const usernameColIdx = columnIndex ?? detectUsernameColumn(parsed.headers, parsed.rows);

    // Extract usernames from the selected column
    const rawUsernames = parsed.rows.map((row) => row[usernameColIdx] || '');

    // Validate and normalize
    const validation = validateUsernames(rawUsernames);

    // Create job and items in a transaction
    const job = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newJob = await tx.job.create({
        data: {
          userId: req.user!.id,
          fileName: req.file!.originalname,
          totalCount: validation.valid.length,
          pendingCount: validation.valid.length,
        },
      });

      if (validation.valid.length > 0) {
        await tx.jobItem.createMany({
          data: validation.valid.map((username) => ({
            jobId: newJob.id,
            username,
          })),
        });
      }

      return newJob;
    });

    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) logger.warn('Failed to delete uploaded file', { path: req.file!.path });
    });

    res.status(201).json({
      job: {
        id: job.id,
        status: job.status,
        totalCount: job.totalCount,
        createdAt: job.createdAt,
      },
      validation: {
        total: validation.total,
        valid: validation.valid.length,
        invalid: validation.invalid.length,
        duplicates: validation.duplicates.length,
        invalidDetails: validation.invalid,
        duplicateValues: validation.duplicates,
      },
      columns: parsed.headers,
      selectedColumn: usernameColIdx,
    });
  } catch (error) {
    logger.error('Job creation error', { error });
    const message = error instanceof Error ? error.message : 'Failed to create job';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/jobs/text — Create job directly from pasted usernames or URLs
 */
router.post('/text', async (req: Request, res: Response) => {
  try {
    const { text, jobName } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Please enter at least one GitHub username or link.' });
      return;
    }

    // Split by newlines, commas, semicolons, tabs, spaces
    const rawTokens = text
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Normalize: strip GitHub URL prefix or @ symbol if present
    const rawUsernames = rawTokens.map((token) => {
      let cleaned = token;
      // Extract from URL (e.g. https://github.com/username or github.com/username)
      const urlMatch = cleaned.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
      if (urlMatch && urlMatch[1]) {
        cleaned = urlMatch[1];
      }
      // Strip leading @
      if (cleaned.startsWith('@')) {
        cleaned = cleaned.substring(1);
      }
      return cleaned.trim();
    }).filter((u) => u.length > 0);

    if (rawUsernames.length === 0) {
      res.status(400).json({ error: 'No valid usernames found in the pasted text.' });
      return;
    }

    // Validate and normalize
    const validation = validateUsernames(rawUsernames);

    // Create job and items in a transaction
    const job = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newJob = await tx.job.create({
        data: {
          userId: req.user!.id,
          fileName: (jobName && typeof jobName === 'string' && jobName.trim()) ? jobName.trim() : `Pasted List (${validation.valid.length} users)`,
          totalCount: validation.valid.length,
          pendingCount: validation.valid.length,
        },
      });

      if (validation.valid.length > 0) {
        await tx.jobItem.createMany({
          data: validation.valid.map((username) => ({
            jobId: newJob.id,
            username,
          })),
        });
      }

      return newJob;
    });

    res.status(201).json({
      job: {
        id: job.id,
        status: job.status,
        totalCount: job.totalCount,
        createdAt: job.createdAt,
      },
      validation: {
        total: validation.total,
        valid: validation.valid.length,
        invalid: validation.invalid.length,
        duplicates: validation.duplicates.length,
        invalidDetails: validation.invalid,
        duplicateValues: validation.duplicates,
      },
      columns: ['Username'],
      selectedColumn: 0,
    });
  } catch (error) {
    logger.error('Pasted job creation error', { error });
    const message = error instanceof Error ? error.message : 'Failed to process pasted usernames';
    res.status(400).json({ error: message });
  }
});

/**
 * GET /api/jobs — List user's jobs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ jobs });
  } catch (error) {
    logger.error('List jobs error', { error });
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/jobs/:id — Get a single job
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job });
  } catch (error) {
    logger.error('Get job error', { error });
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * POST /api/jobs/:id/start — Start processing a job
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'PENDING' && job.status !== 'STOPPED') {
      res.status(400).json({ error: `Cannot start job in ${job.status} status` });
      return;
    }

    // Get pending items
    const pendingItems = await prisma.jobItem.findMany({
      where: { jobId: job.id, status: 'PENDING' },
    });

    if (pendingItems.length === 0) {
      res.status(400).json({ error: 'No pending items to process' });
      return;
    }

    // Update job status
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    // Enqueue items
    const queueItems: FollowJobData[] = pendingItems.map((item: { id: string; username: string }) => ({
      jobId: job.id,
      itemId: item.id,
      username: item.username,
      userId: req.user!.id,
      accessToken: req.user!.accessToken,
    }));

    await enqueueFollowItems(queueItems);

    wsService.broadcastJobStatus(job.id, req.user!.id, 'PROCESSING');

    res.json({ message: 'Job started', itemsQueued: queueItems.length });
  } catch (error) {
    logger.error('Start job error', { error });
    res.status(500).json({ error: 'Failed to start job' });
  }
});

/**
 * POST /api/jobs/:id/pause — Pause a running job
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job || job.status !== 'PROCESSING') {
      res.status(400).json({ error: 'Job is not currently processing' });
      return;
    }

    await pauseQueue();
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'PAUSED' },
    });

    wsService.broadcastJobStatus(job.id, req.user!.id, 'PAUSED');
    res.json({ message: 'Job paused' });
  } catch (error) {
    logger.error('Pause job error', { error });
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

/**
 * POST /api/jobs/:id/resume — Resume a paused job
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job || job.status !== 'PAUSED') {
      res.status(400).json({ error: 'Job is not paused' });
      return;
    }

    await resumeQueue();
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'PROCESSING' },
    });

    wsService.broadcastJobStatus(job.id, req.user!.id, 'PROCESSING');
    res.json({ message: 'Job resumed' });
  } catch (error) {
    logger.error('Resume job error', { error });
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

/**
 * POST /api/jobs/:id/stop — Stop a job
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job || (job.status !== 'PROCESSING' && job.status !== 'PAUSED')) {
      res.status(400).json({ error: 'Job cannot be stopped' });
      return;
    }

    await removeJobItems(job.id);

    // Mark processing items back to pending
    await prisma.jobItem.updateMany({
      where: { jobId: job.id, status: 'PROCESSING' },
      data: { status: 'PENDING' },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'STOPPED', completedAt: new Date() },
    });

    wsService.broadcastJobStatus(job.id, req.user!.id, 'STOPPED');
    res.json({ message: 'Job stopped' });
  } catch (error) {
    logger.error('Stop job error', { error });
    res.status(500).json({ error: 'Failed to stop job' });
  }
});

/**
 * GET /api/jobs/:id/items — Get job items with pagination and filters
 */
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '50', 10)));
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = { jobId: job.id };
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.username = { contains: search };
    }

    const [items, total] = await Promise.all([
      prisma.jobItem.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobItem.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Get items error', { error });
    res.status(500).json({ error: 'Failed to get items' });
  }
});

/**
 * POST /api/jobs/:id/items/:itemId/retry — Retry a failed item
 */
router.post('/:id/items/:itemId/retry', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const item = await prisma.jobItem.findFirst({
      where: { id: req.params.itemId, jobId: job.id },
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (item.status !== 'FAILED' && item.status !== 'NOT_FOUND' && item.status !== 'RATE_LIMITED') {
      res.status(400).json({ error: 'Item cannot be retried' });
      return;
    }

    // Reset item status
    await prisma.jobItem.update({
      where: { id: item.id },
      data: { status: 'PENDING', message: null },
    });

    // Ensure job is processing
    if (job.status !== 'PROCESSING') {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' },
      });
    }

    // Enqueue
    await enqueueFollowItems([{
      jobId: job.id,
      itemId: item.id,
      username: item.username,
      userId: req.user!.id,
      accessToken: req.user!.accessToken,
    }]);

    res.json({ message: 'Item queued for retry' });
  } catch (error) {
    logger.error('Retry item error', { error });
    res.status(500).json({ error: 'Failed to retry item' });
  }
});

/**
 * GET /api/jobs/:id/export/csv — Export job results as CSV
 */
router.get('/:id/export/csv', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const csv = await exportJobAsCsv(job.id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gitflow-results-${job.id}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export CSV error', { error });
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

/**
 * GET /api/jobs/:id/export/xlsx — Export job results as XLSX
 */
router.get('/:id/export/xlsx', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const buffer = await exportJobAsXlsx(job.id);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="gitflow-results-${job.id}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    logger.error('Export XLSX error', { error });
    res.status(500).json({ error: 'Failed to export XLSX' });
  }
});

/**
 * DELETE /api/jobs/:id — Delete a job and all its items
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status === 'PROCESSING') {
      res.status(400).json({ error: 'Cannot delete a job that is processing. Stop it first.' });
      return;
    }

    // Remove from queue if any
    await removeJobItems(job.id);

    // Cascade delete via Prisma schema
    await prisma.job.delete({ where: { id: job.id } });

    res.json({ message: 'Job deleted' });
  } catch (error) {
    logger.error('Delete job error', { error });
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

export default router;

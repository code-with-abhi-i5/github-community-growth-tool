import * as XLSX from 'xlsx';
import prisma from './database';
import logger from '../config/logger';

/**
 * Sanitize a cell value to prevent CSV/Excel formula injection.
 * Prefixes dangerous characters with a single quote.
 */
function sanitizeCell(value: string): string {
  if (typeof value !== 'string') return String(value);
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r', '\n'];
  if (dangerousChars.some((ch) => value.startsWith(ch))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Export job items as CSV string.
 */
export async function exportJobAsCsv(jobId: string): Promise<string> {
  const items = await prisma.jobItem.findMany({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
  });

  const headers = ['username', 'status', 'message', 'attempts', 'processedAt', 'createdAt'];
  const csvRows = [headers.join(',')];

  for (const item of items) {
    const row = [
      sanitizeCell(item.username),
      sanitizeCell(item.status),
      sanitizeCell(item.message || ''),
      String(item.attempts),
      item.processedAt ? item.processedAt.toISOString() : '',
      item.createdAt.toISOString(),
    ];
    csvRows.push(row.map((v) => `"${v.replace(/"/g, '""')}"`).join(','));
  }

  return csvRows.join('\n');
}

/**
 * Export job items as XLSX buffer with a summary sheet.
 */
export async function exportJobAsXlsx(jobId: string): Promise<Buffer> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  const items = await prisma.jobItem.findMany({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
  });

  const workbook = XLSX.utils.book_new();

  // Data sheet
  const data = items.map((item) => ({
    Username: sanitizeCell(item.username),
    Status: sanitizeCell(item.status),
    Message: sanitizeCell(item.message || ''),
    Attempts: item.attempts,
    'Processed At': item.processedAt ? item.processedAt.toISOString() : '',
    'Created At': item.createdAt.toISOString(),
  }));

  const dataSheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Results');

  // Summary sheet
  const summary = [
    { Metric: 'Total', Count: job.totalCount },
    { Metric: 'Followed', Count: job.followedCount },
    { Metric: 'Already Following', Count: job.alreadyFollowingCount },
    { Metric: 'Failed', Count: job.failedCount },
    { Metric: 'Not Found', Count: job.notFoundCount },
    { Metric: 'Rate Limited', Count: job.rateLimitedCount },
    { Metric: 'Pending', Count: job.pendingCount },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

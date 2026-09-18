import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger';
import type { ParsedFile } from '../types';

const MAX_ROWS = 10000;

export function parseFile(filePath: string, mimeType: string): ParsedFile {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv' || mimeType === 'text/csv') {
    return parseCsv(filePath);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function parseCsv(filePath: string): ParsedFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records: string[][] = csvParse(content, {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error('CSV file is empty');
  }

  if (records.length > MAX_ROWS + 1) {
    throw new Error(`File contains too many rows (max ${MAX_ROWS})`);
  }

  const headers = records[0];
  const rows = records.slice(1);

  return { headers, rows, totalRows: rows.length };
}

function parseExcel(filePath: string): ParsedFile {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no sheets');
  }

  const worksheet = workbook.Sheets[sheetName];
  const data: string[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (data.length === 0) {
    throw new Error('Excel file is empty');
  }

  if (data.length > MAX_ROWS + 1) {
    throw new Error(`File contains too many rows (max ${MAX_ROWS})`);
  }

  const headers = data[0].map(String);
  const rows = data.slice(1).map((row) => row.map(String));

  return { headers, rows, totalRows: rows.length };
}

/**
 * Auto-detect which column contains GitHub usernames.
 * Heuristics:
 * 1. Column header matches common username patterns
 * 2. Column content matches GitHub username format
 */
export function detectUsernameColumn(headers: string[], rows: string[][]): number {
  const usernamePatterns = [
    /^username$/i,
    /^github.?username$/i,
    /^github$/i,
    /^user$/i,
    /^login$/i,
    /^handle$/i,
    /^account$/i,
    /^gh.?user$/i,
    /^github.?id$/i,
    /^name$/i,
  ];

  // Check header names first
  for (const pattern of usernamePatterns) {
    const idx = headers.findIndex((h) => pattern.test(h.trim()));
    if (idx !== -1) {
      logger.debug(`Username column detected by header: "${headers[idx]}" at index ${idx}`);
      return idx;
    }
  }

  // Fallback: check content — look for column with most GitHub-username-like values
  const githubUsernameRegex = /^@?[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  const githubUrlRegex = /^https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/?$/;

  let bestCol = 0;
  let bestScore = 0;

  for (let col = 0; col < headers.length; col++) {
    const sampleRows = rows.slice(0, Math.min(20, rows.length));
    const matches = sampleRows.filter((row) => {
      const val = (row[col] || '').trim();
      return githubUsernameRegex.test(val) || githubUrlRegex.test(val);
    });
    const score = matches.length / sampleRows.length;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  logger.debug(`Username column detected by content analysis: index ${bestCol} (score: ${bestScore})`);
  return bestCol;
}

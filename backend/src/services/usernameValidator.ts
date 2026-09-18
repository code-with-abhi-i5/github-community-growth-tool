import type { ValidationResult } from '../types';

// GitHub username rules: alphanumeric or hyphens, 1-39 chars,
// cannot start or end with hyphen, no consecutive hyphens
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_URL_REGEX = /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$/;

/**
 * Normalize a raw input string to a GitHub username.
 * Handles:
 * - Trimming whitespace
 * - Removing @ prefix
 * - Extracting username from GitHub profile URLs
 */
export function normalizeUsername(raw: string): string {
  let value = raw.trim();

  // Remove @ prefix
  if (value.startsWith('@')) {
    value = value.slice(1);
  }

  // Try to extract from GitHub URL
  const urlMatch = value.match(GITHUB_URL_REGEX);
  if (urlMatch) {
    value = urlMatch[1];
  }

  return value.trim();
}

/**
 * Validate if a string is a valid GitHub username format.
 */
export function isValidUsername(username: string): boolean {
  return GITHUB_USERNAME_REGEX.test(username);
}

/**
 * Process an array of raw username inputs.
 * Returns validated, deduplicated results with a full report.
 */
export function validateUsernames(rawUsernames: string[]): ValidationResult {
  const valid: string[] = [];
  const invalid: Array<{ raw: string; reason: string }> = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawUsernames) {
    if (!raw || !raw.trim()) continue;

    const normalized = normalizeUsername(raw);

    if (!normalized) {
      invalid.push({ raw, reason: 'Empty after normalization' });
      continue;
    }

    if (!isValidUsername(normalized)) {
      invalid.push({
        raw,
        reason: `Invalid GitHub username format: "${normalized}"`,
      });
      continue;
    }

    const lower = normalized.toLowerCase();
    if (seen.has(lower)) {
      duplicates.push(raw);
      continue;
    }

    seen.add(lower);
    valid.push(normalized);
  }

  return {
    valid,
    invalid,
    duplicates,
    total: rawUsernames.filter((r) => r && r.trim()).length,
  };
}

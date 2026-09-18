import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'badge-pending',
    PROCESSING: 'badge-processing',
    FOLLOWED: 'badge-followed',
    ALREADY_FOLLOWING: 'badge-already',
    FAILED: 'badge-failed',
    NOT_FOUND: 'badge-notfound',
    RATE_LIMITED: 'badge-ratelimited',
  };
  return colors[status] || 'badge-pending';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    FOLLOWED: 'Followed',
    ALREADY_FOLLOWING: 'Already Following',
    FAILED: 'Failed',
    NOT_FOUND: 'Not Found',
    RATE_LIMITED: 'Rate Limited',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
    STOPPED: 'Stopped',
  };
  return labels[status] || status;
}

export function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    PENDING: '🟡',
    PROCESSING: '🔵',
    FOLLOWED: '🟢',
    ALREADY_FOLLOWING: '⚪',
    FAILED: '🔴',
    NOT_FOUND: '⚫',
    RATE_LIMITED: '🟠',
  };
  return emojis[status] || '⚪';
}

import * as m from '$lib/paraglide/messages';

export function resolveHistoryLabel(key: string): string {
  try {
    const fn = (m as Record<string, unknown>)[key];
    if (typeof fn === 'function') return fn() as string;
  } catch { /* fallback to raw key */ }
  return key;
}

/**
 * Format a timestamp as a relative time string.
 * - 'coarse': < 1m → Nm → Nh → Nd (HistoryPanel style)
 * - 'fine': now → Ns → Nm → Nh → Nd (CanvasHistory style)
 */
export function relativeTime(ts: number, granularity: 'coarse' | 'fine' = 'fine'): string {
  const diff = Date.now() - ts;

  if (granularity === 'coarse') {
    if (diff < 60000) return '< 1m';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  }

  // fine
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'now';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

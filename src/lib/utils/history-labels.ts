import * as m from '$lib/paraglide/messages';

export function resolveHistoryLabel(key: string): string {
  try {
    const fn = (m as Record<string, unknown>)[key];
    if (typeof fn === 'function') return fn() as string;
  } catch { /* fallback to raw key */ }
  return key;
}

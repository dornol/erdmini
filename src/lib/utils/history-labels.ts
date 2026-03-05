import * as m from '$lib/paraglide/messages';
import type { ERDSchema } from '$lib/types/erd';

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

/**
 * Compare two schema snapshots and derive a human-readable label + detail for the history entry.
 */
export function deriveLabel(prev: ERDSchema, cur: ERDSchema): { label: string; detail: string } {
  const pt = prev.tables;
  const ct = cur.tables;
  const prevIds = new Set(pt.map((t) => t.id));
  const curIds = new Set(ct.map((t) => t.id));

  // Table added
  if (ct.length > pt.length) {
    const added = ct.find((t) => !prevIds.has(t.id));
    return { label: 'history_add_table', detail: added?.name ?? '' };
  }
  // Table deleted
  if (ct.length < pt.length) {
    const removed = pt.find((t) => !curIds.has(t.id));
    return { label: 'history_delete_table', detail: removed?.name ?? '' };
  }

  // Column added/deleted
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    if (ct2.columns.length > pt2.columns.length) {
      const prevColIds = new Set(pt2.columns.map((c) => c.id));
      const added = ct2.columns.find((c) => !prevColIds.has(c.id));
      return { label: 'history_add_column', detail: `${ct2.name}.${added?.name ?? ''}` };
    }
    if (ct2.columns.length < pt2.columns.length) {
      const curColIds = new Set(ct2.columns.map((c) => c.id));
      const removed = pt2.columns.find((c) => !curColIds.has(c.id));
      return { label: 'history_delete_column', detail: `${ct2.name}.${removed?.name ?? ''}` };
    }
  }

  // FK added/deleted
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    if (ct2.foreignKeys.length > pt2.foreignKeys.length) {
      const prevFkIds = new Set(pt2.foreignKeys.map((f) => f.id));
      const added = ct2.foreignKeys.find((f) => !prevFkIds.has(f.id));
      const refTable = added ? ct.find((t) => t.id === added.referencedTableId) : null;
      return { label: 'history_add_fk', detail: `${ct2.name} → ${refTable?.name ?? ''}` };
    }
    if (ct2.foreignKeys.length < pt2.foreignKeys.length) {
      const curFkIds = new Set(ct2.foreignKeys.map((f) => f.id));
      const removed = pt2.foreignKeys.find((f) => !curFkIds.has(f.id));
      const refTable = removed ? pt.find((t) => t.id === removed.referencedTableId) : null;
      return { label: 'history_delete_fk', detail: `${ct2.name} → ${refTable?.name ?? ''}` };
    }
  }

  // Unique key added/deleted
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    if ((ct2.uniqueKeys?.length ?? 0) > (pt2.uniqueKeys?.length ?? 0)) {
      return { label: 'history_add_uq', detail: ct2.name };
    }
    if ((ct2.uniqueKeys?.length ?? 0) < (pt2.uniqueKeys?.length ?? 0)) {
      return { label: 'history_delete_uq', detail: ct2.name };
    }
  }

  // Index added/deleted
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    if ((ct2.indexes?.length ?? 0) > (pt2.indexes?.length ?? 0)) {
      return { label: 'history_add_idx', detail: ct2.name };
    }
    if ((ct2.indexes?.length ?? 0) < (pt2.indexes?.length ?? 0)) {
      return { label: 'history_delete_idx', detail: ct2.name };
    }
  }

  // Domain changes
  const prevDomains = prev.domains ?? [];
  const curDomains = cur.domains ?? [];
  if (curDomains.length !== prevDomains.length) {
    if (curDomains.length > prevDomains.length) {
      const prevDomIds = new Set(prevDomains.map((d) => d.id));
      const added = curDomains.find((d) => !prevDomIds.has(d.id));
      return { label: 'history_edit_domain', detail: added?.name ?? '' };
    }
    const curDomIds = new Set(curDomains.map((d) => d.id));
    const removed = prevDomains.find((d) => !curDomIds.has(d.id));
    return { label: 'history_edit_domain', detail: removed?.name ?? '' };
  }

  // Memo added/deleted/edited
  const pm = prev.memos ?? [];
  const cm = cur.memos ?? [];
  if (cm.length > pm.length) {
    return { label: 'history_add_memo', detail: '' };
  }
  if (cm.length < pm.length) {
    return { label: 'history_delete_memo', detail: '' };
  }
  for (const curMemo of cm) {
    const prevMemo = pm.find((mm) => mm.id === curMemo.id);
    if (prevMemo && prevMemo.content !== curMemo.content) {
      return { label: 'history_edit_memo', detail: '' };
    }
    if (prevMemo && (prevMemo.color !== curMemo.color || prevMemo.width !== curMemo.width || prevMemo.height !== curMemo.height || prevMemo.locked !== curMemo.locked)) {
      return { label: 'history_edit_memo', detail: '' };
    }
  }

  // Table name change
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (pt2 && pt2.name !== ct2.name) {
      return { label: 'history_edit_table', detail: `${pt2.name} → ${ct2.name}` };
    }
  }

  // Column property edit (same count but different content)
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    for (const cc of ct2.columns) {
      const pc = pt2.columns.find((c) => c.id === cc.id);
      if (pc && JSON.stringify(pc) !== JSON.stringify(cc)) {
        return { label: 'history_edit_column', detail: `${ct2.name}.${cc.name}` };
      }
    }
  }

  // FK property edit (same count but different content)
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    for (const cfk of ct2.foreignKeys) {
      const pfk = pt2.foreignKeys.find((f) => f.id === cfk.id);
      if (pfk && JSON.stringify(pfk) !== JSON.stringify(cfk)) {
        return { label: 'history_edit_fk', detail: ct2.name };
      }
    }
  }

  // Table property edit (comment, color, group, locked)
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (!pt2) continue;
    if ((pt2.comment ?? '') !== (ct2.comment ?? '')) {
      return { label: 'history_edit_table', detail: ct2.name };
    }
    if ((pt2.color ?? '') !== (ct2.color ?? '')) {
      return { label: 'history_edit_table', detail: ct2.name };
    }
    if ((pt2.group ?? '') !== (ct2.group ?? '')) {
      return { label: 'history_edit_table', detail: ct2.name };
    }
    if ((pt2.locked ?? false) !== (ct2.locked ?? false)) {
      return { label: 'history_edit_table', detail: ct2.name };
    }
  }

  // Position changes (layout)
  for (const ct2 of ct) {
    const pt2 = pt.find((t) => t.id === ct2.id);
    if (pt2 && (pt2.position.x !== ct2.position.x || pt2.position.y !== ct2.position.y)) {
      return { label: 'history_layout', detail: '' };
    }
  }

  // groupColors change
  if (JSON.stringify(prev.groupColors ?? {}) !== JSON.stringify(cur.groupColors ?? {})) {
    return { label: 'history_edit_table', detail: '' };
  }

  return { label: 'history_edit', detail: '' };
}

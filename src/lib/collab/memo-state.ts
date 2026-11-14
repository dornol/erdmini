import type { Memo, Table } from '$lib/types/erd';

export interface MemoStatePatch {
  attachedTableId?: string | null;
  position?: { x: number; y: number };
}

/** Apply field state without repeating attachment/detachment positioning logic. */
export function applyMemoState(memo: Memo, patch: MemoStatePatch, tables: readonly Pick<Table, 'id'>[]): void {
  if (Object.hasOwn(patch, 'attachedTableId')) {
    memo.attachedTableId = typeof patch.attachedTableId === 'string'
      && tables.some(table => table.id === patch.attachedTableId) ? patch.attachedTableId : undefined;
  }
  if (patch.position && Number.isFinite(patch.position.x) && Number.isFinite(patch.position.y)) {
    memo.position = { x: patch.position.x, y: patch.position.y };
  }
}

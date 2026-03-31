import type { ERDSchema, Memo } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

export function createMemo(
  schema: ERDSchema,
  position: { x: number; y: number },
  activeSchema?: string,
): Memo {
  const memo: Memo = {
    id: generateId(),
    content: '',
    position,
    width: 200,
    height: 150,
    ...(activeSchema ? { schema: activeSchema } : {}),
  };
  schema.memos = [...schema.memos, memo];
  schema.updatedAt = now();
  return memo;
}

export function deleteMemoOp(schema: ERDSchema, id: string): void {
  schema.memos = schema.memos.filter((m) => m.id !== id);
  schema.updatedAt = now();
}

export function deleteMemosOp(schema: ERDSchema, ids: string[]): void {
  const idSet = new Set(ids);
  schema.memos = schema.memos.filter((m) => !idSet.has(m.id));
  schema.updatedAt = now();
}

export function updateMemoOp(schema: ERDSchema, id: string, patch: Partial<Omit<Memo, 'id'>>): void {
  const memo = schema.memos.find((m) => m.id === id);
  if (!memo) return;
  Object.assign(memo, patch);
  schema.updatedAt = now();
}

export function attachMemoOp(schema: ERDSchema, memoId: string, tableId: string): void {
  const memo = schema.memos.find((m) => m.id === memoId);
  if (!memo) return;
  // Don't attach to non-existent table (race condition in collab)
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  memo.attachedTableId = tableId;
  schema.updatedAt = now();
}

export function detachMemoOp(schema: ERDSchema, memoId: string): string | undefined {
  const memo = schema.memos.find((m) => m.id === memoId);
  if (!memo) return;
  const tableId = memo.attachedTableId;
  delete memo.attachedTableId;
  if (tableId) {
    const table = schema.tables.find((t) => t.id === tableId);
    if (table) {
      memo.position = { x: table.position.x, y: table.position.y - memo.height - 12 };
    }
  }
  schema.updatedAt = now();
  return tableId;
}

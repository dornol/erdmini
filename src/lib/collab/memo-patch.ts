import type { Memo } from '$lib/types/erd';

/**
 * Allowed fields for remote memo patch operations.
 * Excludes: id (immutable), position (use move-memo), schema (use update-table-schema),
 * attachedTableId (use attach-memo/detach-memo).
 */
export const MEMO_PATCH_FIELDS = ['content', 'color', 'width', 'height', 'locked'] as const;

/**
 * Applies only whitelisted fields from a patch to a memo object.
 * Returns the number of fields applied.
 */
export function applyMemoPatch(memo: Memo, patch: Partial<Omit<Memo, 'id'>>): number {
  let applied = 0;
  for (const field of MEMO_PATCH_FIELDS) {
    if (field in patch) {
      (memo as any)[field] = patch[field];
      applied++;
    }
  }
  return applied;
}

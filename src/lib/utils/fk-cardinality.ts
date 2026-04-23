import type { ForeignKey, Table } from '$lib/types/erd';

/**
 * Determines whether a foreign key represents a 1:1 (unique) relationship.
 *
 * Returns true when the FK column(s) are collectively unique in the source table,
 * meaning each parent row can be referenced by at most one child row. Detects:
 * 1. All FK columns are PRIMARY KEY
 * 2. Single-column FK with Column.unique = true
 * 3. FK columns exactly match a composite uniqueKeys entry
 * 4. FK columns exactly match a unique index
 */
export function isFkUnique(fk: ForeignKey, table: Table): boolean {
  if (fk.columnIds.length === 0) return false;

  const fkCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id));
  if (fkCols.some((c) => !c)) return false;

  // 1. All FK columns are PK (covers composite PK = FK pattern)
  if (fkCols.every((c) => c!.primaryKey)) return true;

  // 2. Single column with unique flag
  if (fkCols.length === 1 && fkCols[0]!.unique) return true;

  const fkSet = new Set(fk.columnIds);
  const matchesColumnSet = (ids: string[]) =>
    ids.length === fkSet.size && ids.every((id) => fkSet.has(id));

  // 3. Composite uniqueKey exact match
  if ((table.uniqueKeys ?? []).some((uk) => matchesColumnSet(uk.columnIds))) return true;

  // 4. Unique index exact match
  if ((table.indexes ?? []).some((idx) => idx.unique && matchesColumnSet(idx.columnIds))) return true;

  return false;
}

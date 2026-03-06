import type { Table, Column } from '$lib/types/erd';
import type { ColumnDisplayMode } from '$lib/store/canvas.svelte';

export function getFilteredColumns(table: Table, mode: ColumnDisplayMode): Column[] {
  if (mode === 'all' || mode === 'names-only') return table.columns;
  // pk-fk-only
  const fkColIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
  return table.columns.filter((c) => c.primaryKey || fkColIds.has(c.id));
}

export function getFilteredColumnCount(table: Table, mode: ColumnDisplayMode): number {
  if (mode === 'all' || mode === 'names-only') return table.columns.length;
  const fkColIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
  return table.columns.filter((c) => c.primaryKey || fkColIds.has(c.id)).length;
}

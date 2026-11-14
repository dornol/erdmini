import type { ForeignKey, Table } from '$lib/types/erd';

export function hasConstraintColumns(table: Table | undefined, columnIds: unknown): boolean {
  return !!table && Array.isArray(columnIds) && columnIds.length > 0
    && new Set(columnIds).size === columnIds.length
    && columnIds.every(id => typeof id === 'string' && table.columns.some(column => column.id === id));
}

export function hasForeignKeyReferences(tables: readonly Table[], tableId: string, fk: ForeignKey | undefined): boolean {
  if (!fk) return false;
  const source = tables.find(table => table.id === tableId);
  const target = tables.find(table => table.id === fk.referencedTableId);
  return hasConstraintColumns(source, fk.columnIds)
    && hasConstraintColumns(target, fk.referencedColumnIds)
    && fk.columnIds.length === fk.referencedColumnIds.length;
}

import type { ERDSchema, ForeignKey, UniqueKey, TableIndex } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

export function addForeignKeyOp(
  schema: ERDSchema,
  tableId: string,
  columnIds: string[],
  referencedTableId: string,
  referencedColumnIds: string[],
  onDelete: ForeignKey['onDelete'] = 'RESTRICT',
  onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
): ForeignKey | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const fk: ForeignKey = {
    id: generateId(),
    columnIds,
    referencedTableId,
    referencedColumnIds,
    onDelete,
    onUpdate,
  };
  table.foreignKeys = [...table.foreignKeys, fk];
  schema.updatedAt = now();
  return fk;
}

export function updateForeignKeyOp(
  schema: ERDSchema,
  tableId: string,
  fkId: string,
  columnIds: string[],
  referencedTableId: string,
  referencedColumnIds: string[],
  onDelete: ForeignKey['onDelete'] = 'RESTRICT',
  onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const fk = table.foreignKeys.find((f) => f.id === fkId);
  if (!fk) return;
  fk.columnIds = columnIds;
  fk.referencedTableId = referencedTableId;
  fk.referencedColumnIds = referencedColumnIds;
  fk.onDelete = onDelete;
  fk.onUpdate = onUpdate;
  schema.updatedAt = now();
}

export function updateFkLabelOp(schema: ERDSchema, tableId: string, fkId: string, label: string): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const fk = table.foreignKeys.find((f) => f.id === fkId);
  if (!fk) return;
  fk.label = label || undefined;
  schema.updatedAt = now();
}

export function deleteForeignKeyOp(schema: ERDSchema, tableId: string, fkId: string): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  table.foreignKeys = table.foreignKeys.filter((fk) => fk.id !== fkId);
  schema.updatedAt = now();
}

export function addUniqueKeyOp(schema: ERDSchema, tableId: string, columnIds: string[], name?: string): UniqueKey | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const uk: UniqueKey = {
    id: generateId(),
    columnIds,
    name: name || undefined,
  };
  table.uniqueKeys = [...table.uniqueKeys, uk];
  schema.updatedAt = now();
  return uk;
}

export function deleteUniqueKeyOp(schema: ERDSchema, tableId: string, ukId: string): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  table.uniqueKeys = table.uniqueKeys.filter((uk) => uk.id !== ukId);
  schema.updatedAt = now();
}

export function addIndexOp(schema: ERDSchema, tableId: string, columnIds: string[], unique: boolean, name?: string): TableIndex | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const idx: TableIndex = {
    id: generateId(),
    columnIds,
    unique,
    name: name || undefined,
  };
  table.indexes = [...(table.indexes ?? []), idx];
  schema.updatedAt = now();
  return idx;
}

export function deleteIndexOp(schema: ERDSchema, tableId: string, indexId: string): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  table.indexes = (table.indexes ?? []).filter((idx) => idx.id !== indexId);
  schema.updatedAt = now();
}

import type { Column, ERDSchema } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

export function addColumnOp(schema: ERDSchema, tableId: string): Column | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const n = table.columns.length + 1;
  const newColumn: Column = {
    id: generateId(),
    name: `column_${n}`,
    type: 'VARCHAR',
    length: 255,
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
  };
  table.columns = [...table.columns, newColumn];
  schema.updatedAt = now();
  return newColumn;
}

export function updateColumnOp(schema: ERDSchema, tableId: string, columnId: string, patch: Partial<Column>): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  if (patch.primaryKey) patch.nullable = false;
  table.columns = table.columns.map((c) =>
    c.id === columnId ? { ...c, ...patch } : c
  );
  schema.updatedAt = now();
}

export function deleteColumnOp(schema: ERDSchema, tableId: string, columnId: string): void {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  table.columns = table.columns.filter((c) => c.id !== columnId);
  table.foreignKeys = table.foreignKeys.filter((fk) => !fk.columnIds.includes(columnId));
  if (table.uniqueKeys) {
    table.uniqueKeys = table.uniqueKeys.filter((uk) => !uk.columnIds.includes(columnId));
  }
  if (table.indexes) {
    table.indexes = table.indexes.filter((idx) => !idx.columnIds.includes(columnId));
  }
  // Remove FKs in other tables that reference this column
  for (const t of schema.tables) {
    if (t.id === tableId) continue;
    t.foreignKeys = t.foreignKeys.filter(
      (fk) => !(fk.referencedTableId === tableId && fk.referencedColumnIds.includes(columnId))
    );
  }
  schema.updatedAt = now();
}

export function moveColumnToIndexOp(schema: ERDSchema, tableId: string, columnId: string, toIndex: number): boolean {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return false;
  const fromIdx = table.columns.findIndex((c) => c.id === columnId);
  if (fromIdx < 0 || fromIdx === toIndex) return false;
  const cols = [...table.columns];
  const [item] = cols.splice(fromIdx, 1);
  cols.splice(toIndex, 0, item);
  table.columns = cols;
  schema.updatedAt = now();
  return true;
}

export function moveColumnUpOp(schema: ERDSchema, tableId: string, columnId: string): number | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const idx = table.columns.findIndex((c) => c.id === columnId);
  if (idx <= 0) return;
  const cols = [...table.columns];
  [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
  table.columns = cols;
  schema.updatedAt = now();
  return idx - 1;
}

export function moveColumnDownOp(schema: ERDSchema, tableId: string, columnId: string): number | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const idx = table.columns.findIndex((c) => c.id === columnId);
  if (idx < 0 || idx >= table.columns.length - 1) return;
  const cols = [...table.columns];
  [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
  table.columns = cols;
  schema.updatedAt = now();
  return idx + 1;
}

export function duplicateColumnOp(schema: ERDSchema, tableId: string, columnId: string): Column | undefined {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return;
  const src = table.columns.find((c) => c.id === columnId);
  if (!src) return;
  const newCol: Column = {
    ...src,
    id: generateId(),
    name: `${src.name}_copy`,
    primaryKey: false,
    autoIncrement: false,
    domainId: undefined,
  };
  const idx = table.columns.findIndex((c) => c.id === columnId);
  const cols = [...table.columns];
  cols.splice(idx + 1, 0, newCol);
  table.columns = cols;
  schema.updatedAt = now();
  return newCol;
}

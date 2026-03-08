import type { Column, ERDSchema, ForeignKey, Table, UniqueKey, TableIndex } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

function getNextTableName(tables: Table[]): string {
  let i = 1;
  while (tables.some((t) => t.name === `table_${i}`)) i++;
  return `table_${i}`;
}

export function createTable(
  schema: ERDSchema,
  position: { x: number; y: number },
  activeSchema?: string,
): { table: Table; id: string } {
  const id = generateId();
  const name = getNextTableName(schema.tables);
  const newTable: Table = {
    id,
    name,
    columns: [
      {
        id: generateId(),
        name: 'id',
        type: 'INT',
        nullable: false,
        primaryKey: true,
        unique: true,
        autoIncrement: true,
      },
    ],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position,
    ...(activeSchema ? { schema: activeSchema } : {}),
  };
  schema.tables = [...schema.tables, newTable];
  schema.updatedAt = now();
  return { table: newTable, id };
}

export function createTableFromTemplate(
  schema: ERDSchema,
  templateColumns: Omit<Column, 'id'>[],
  tableName: string,
  position: { x: number; y: number },
  activeSchema?: string,
): { table: Table; id: string } {
  const id = generateId();
  let name = tableName;
  let suffix = 1;
  while (schema.tables.some((t) => t.name === name)) {
    name = `${tableName}_${suffix++}`;
  }
  const columns: Column[] = templateColumns.map((c) => ({ ...c, id: generateId() }));
  const newTable: Table = {
    id,
    name,
    columns,
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position,
    ...(activeSchema ? { schema: activeSchema } : {}),
  };
  schema.tables = [...schema.tables, newTable];
  schema.updatedAt = now();
  return { table: newTable, id };
}

export function pasteTables(
  schema: ERDSchema,
  tables: Table[],
  activeSchema?: string,
): { idMap: Map<string, string>; newIds: string[] } {
  const idMap = new Map<string, string>();
  const newIds: string[] = [];

  for (const srcTable of tables) {
    const newId = generateId();
    idMap.set(srcTable.id, newId);
    let name = srcTable.name;
    let suffix = 1;
    while (schema.tables.some((t) => t.name === name)) {
      name = `${srcTable.name}_${suffix++}`;
    }
    const columns: Column[] = srcTable.columns.map((c) => {
      const newColId = generateId();
      idMap.set(c.id, newColId);
      return { ...c, id: newColId };
    });
    const newTable: Table = {
      id: newId,
      name,
      columns,
      foreignKeys: [],
      uniqueKeys: (srcTable.uniqueKeys ?? []).map((uk) => ({
        ...uk, id: generateId(),
        columnIds: uk.columnIds.map((cid) => idMap.get(cid) ?? cid),
      })),
      indexes: (srcTable.indexes ?? []).map((idx) => ({
        ...idx, id: generateId(),
        columnIds: idx.columnIds.map((cid) => idMap.get(cid) ?? cid),
      })),
      position: { x: srcTable.position.x + 30, y: srcTable.position.y + 30 },
      comment: srcTable.comment,
      color: srcTable.color,
      group: srcTable.group,
      ...(activeSchema ? { schema: activeSchema } : srcTable.schema ? { schema: srcTable.schema } : {}),
    };
    schema.tables = [...schema.tables, newTable];
    newIds.push(newId);
  }

  // Re-map FKs between pasted tables
  for (const srcTable of tables) {
    const newTableId = idMap.get(srcTable.id)!;
    const newTable = schema.tables.find((t) => t.id === newTableId);
    if (!newTable) continue;
    for (const fk of srcTable.foreignKeys) {
      const refId = idMap.get(fk.referencedTableId);
      if (!refId) continue;
      const newFk: ForeignKey = {
        id: generateId(),
        columnIds: fk.columnIds.map((cid) => idMap.get(cid) ?? cid),
        referencedTableId: refId,
        referencedColumnIds: fk.referencedColumnIds.map((cid) => idMap.get(cid) ?? cid),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
        label: fk.label,
      };
      newTable.foreignKeys = [...newTable.foreignKeys, newFk];
    }
  }

  schema.updatedAt = now();
  return { idMap, newIds };
}

export function deleteTableOp(schema: ERDSchema, id: string): void {
  for (const memo of schema.memos) {
    if (memo.attachedTableId === id) {
      delete memo.attachedTableId;
    }
  }
  schema.tables = schema.tables
    .filter((t) => t.id !== id)
    .map((t) => ({
      ...t,
      foreignKeys: t.foreignKeys.filter((fk) => fk.referencedTableId !== id),
    }));
  schema.updatedAt = now();
}

export function deleteTablesOp(schema: ERDSchema, ids: string[]): void {
  const idSet = new Set(ids);
  for (const memo of schema.memos) {
    if (memo.attachedTableId && idSet.has(memo.attachedTableId)) {
      delete memo.attachedTableId;
    }
  }
  schema.tables = schema.tables
    .filter((t) => !idSet.has(t.id))
    .map((t) => ({
      ...t,
      foreignKeys: t.foreignKeys.filter((fk) => !idSet.has(fk.referencedTableId)),
    }));
  schema.updatedAt = now();
}

export function duplicateTableOp(schema: ERDSchema, id: string): Table | undefined {
  const src = schema.tables.find((t) => t.id === id);
  if (!src) return;
  const newId = generateId();
  const newTable: Table = {
    id: newId,
    name: `${src.name}_copy`,
    columns: src.columns.map((c) => ({ ...c, id: generateId() })),
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: src.position.x + 30, y: src.position.y + 30 },
    comment: src.comment,
    color: src.color,
    group: src.group,
  };
  schema.tables = [...schema.tables, newTable];
  schema.updatedAt = now();
  return newTable;
}

export function moveTableOp(
  schema: ERDSchema,
  id: string,
  x: number,
  y: number,
): void {
  const table = schema.tables.find((t) => t.id === id);
  if (!table) return;
  const dx = x - table.position.x;
  const dy = y - table.position.y;
  table.position = { x, y };
  for (const memo of schema.memos) {
    if (memo.attachedTableId === id) {
      memo.position = { x: memo.position.x + dx, y: memo.position.y + dy };
    }
  }
}

export function moveTablesOp(
  schema: ERDSchema,
  moves: { id: string; x: number; y: number }[],
): void {
  for (const move of moves) {
    const table = schema.tables.find((t) => t.id === move.id);
    if (!table) continue;
    const dx = move.x - table.position.x;
    const dy = move.y - table.position.y;
    table.position = { x: move.x, y: move.y };
    for (const memo of schema.memos) {
      if (memo.attachedTableId === move.id) {
        memo.position = { x: memo.position.x + dx, y: memo.position.y + dy };
      }
    }
  }
}

export function cleanupOrphanedGroupColors(schema: ERDSchema): void {
  if (!schema.groupColors) return;
  const activeGroups = new Set(schema.tables.map((t) => t.group).filter(Boolean));
  let changed = false;
  for (const g of Object.keys(schema.groupColors)) {
    if (!activeGroups.has(g)) {
      delete schema.groupColors[g];
      changed = true;
    }
  }
  if (changed) schema.groupColors = { ...schema.groupColors };
}

import type { Column, ColumnDomain, ColumnType, ERDSchema, ForeignKey, Memo, ReferentialAction, Table, UniqueKey, TableIndex } from '$lib/types/erd';
import { DOMAIN_FIELDS } from '$lib/types/erd';
import { propagateWithHierarchy } from '$lib/utils/domain-hierarchy';
import { generateId } from '$lib/utils/common';

function now(): string {
  return new Date().toISOString();
}

function getNextTableName(tables: Table[]): string {
  let i = 1;
  while (tables.some(t => t.name === `table_${i}`)) i++;
  return `table_${i}`;
}

function computeNewTablePosition(tables: Table[]): { x: number; y: number } {
  if (tables.length === 0) return { x: 0, y: 0 };

  let sumX = 0, sumY = 0;
  for (const t of tables) { sumX += t.position.x; sumY += t.position.y; }
  const cx = sumX / tables.length;
  const cy = sumY / tables.length;

  const W = 250, H = 200;
  const overlaps = (x: number, y: number) =>
    tables.some(t => Math.abs(t.position.x - x) < W && Math.abs(t.position.y - y) < H);

  for (let ring = 1; ring <= 10; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = Math.round(cx) + dx * W;
        const y = Math.round(cy) + dy * H;
        if (!overlaps(x, y)) return { x, y };
      }
    }
  }
  return { x: Math.round(cx), y: Math.round(cy) + tables.length * H };
}

export function addTable(
  schema: ERDSchema,
  options?: { name?: string; comment?: string; color?: string; group?: string; withPk?: boolean; schema?: string },
): { schema: ERDSchema; tableId: string } {
  const name = options?.name || getNextTableName(schema.tables);
  const id = generateId();
  const columns: Column[] = [];

  if (options?.withPk !== false) {
    columns.push({
      id: generateId(),
      name: 'id',
      type: 'INT',
      nullable: false,
      primaryKey: true,
      unique: true,
      autoIncrement: true,
    });
  }

  const newTable: Table = {
    id,
    name,
    columns,
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: computeNewTablePosition(schema.tables),
    comment: options?.comment,
    color: options?.color,
    group: options?.group,
    ...(options?.schema ? { schema: options.schema } : {}),
  };

  return {
    schema: { ...schema, tables: [...schema.tables, newTable], updatedAt: now() },
    tableId: id,
  };
}

export function updateTable(
  schema: ERDSchema,
  tableId: string,
  patch: { name?: string; comment?: string; color?: string; group?: string; schema?: string },
): ERDSchema {
  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        name: patch.name ?? t.name,
        comment: patch.comment !== undefined ? (patch.comment || undefined) : t.comment,
        color: patch.color !== undefined ? (patch.color || undefined) : t.color,
        group: patch.group !== undefined ? (patch.group || undefined) : t.group,
        ...(patch.schema !== undefined ? (patch.schema ? { schema: patch.schema } : { schema: undefined }) : {}),
      };
    }),
    updatedAt: now(),
  };
}

export function deleteTable(schema: ERDSchema, tableId: string): ERDSchema {
  return {
    ...schema,
    tables: schema.tables
      .filter(t => t.id !== tableId)
      .map(t => ({
        ...t,
        foreignKeys: t.foreignKeys.filter(fk => fk.referencedTableId !== tableId),
      })),
    updatedAt: now(),
  };
}

export function addColumn(
  schema: ERDSchema,
  tableId: string,
  column?: {
    name?: string;
    type?: ColumnType;
    length?: number;
    scale?: number;
    nullable?: boolean;
    primaryKey?: boolean;
    unique?: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    comment?: string;
    enumValues?: string[];
    check?: string;
    domainId?: string;
  },
): { schema: ERDSchema; columnId: string } | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const columnId = generateId();
  const newColumn: Column = {
    id: columnId,
    name: column?.name || `column_${table.columns.length + 1}`,
    type: column?.type || 'VARCHAR',
    length: column?.length,
    scale: column?.scale,
    nullable: column?.nullable ?? true,
    primaryKey: column?.primaryKey ?? false,
    unique: column?.unique ?? false,
    autoIncrement: column?.autoIncrement ?? false,
    defaultValue: column?.defaultValue,
    comment: column?.comment,
    enumValues: column?.enumValues,
    check: column?.check,
    domainId: column?.domainId,
  };

  // PK implies NOT NULL
  if (newColumn.primaryKey) newColumn.nullable = false;

  return {
    schema: {
      ...schema,
      tables: schema.tables.map(t =>
        t.id === tableId ? { ...t, columns: [...t.columns, newColumn] } : t
      ),
      updatedAt: now(),
    },
    columnId,
  };
}

export function updateColumn(
  schema: ERDSchema,
  tableId: string,
  columnId: string,
  patch: Partial<Omit<Column, 'id'>>,
): ERDSchema {
  // PK implies NOT NULL
  if (patch.primaryKey) patch.nullable = false;

  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        columns: t.columns.map(c =>
          c.id === columnId ? { ...c, ...patch } : c
        ),
      };
    }),
    updatedAt: now(),
  };
}

export function deleteColumn(schema: ERDSchema, tableId: string, columnId: string): ERDSchema {
  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id === tableId) {
        return {
          ...t,
          columns: t.columns.filter(c => c.id !== columnId),
          foreignKeys: t.foreignKeys.filter(fk => !fk.columnIds.includes(columnId)),
          uniqueKeys: (t.uniqueKeys || []).filter(uk => !uk.columnIds.includes(columnId)),
          indexes: (t.indexes || []).filter(idx => !idx.columnIds.includes(columnId)),
        };
      }
      // Remove FKs in other tables that reference this column
      return {
        ...t,
        foreignKeys: t.foreignKeys.filter(
          fk => !(fk.referencedTableId === tableId && fk.referencedColumnIds.includes(columnId))
        ),
      };
    }),
    updatedAt: now(),
  };
}

export function addForeignKey(
  schema: ERDSchema,
  tableId: string,
  fk: {
    columnIds: string[];
    referencedTableId: string;
    referencedColumnIds: string[];
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
  },
): { schema: ERDSchema; fkId: string } | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const refTable = schema.tables.find(t => t.id === fk.referencedTableId);
  if (!refTable) return null;

  const fkId = generateId();
  const newFk: ForeignKey = {
    id: fkId,
    columnIds: fk.columnIds,
    referencedTableId: fk.referencedTableId,
    referencedColumnIds: fk.referencedColumnIds,
    onDelete: fk.onDelete || 'RESTRICT',
    onUpdate: fk.onUpdate || 'RESTRICT',
  };

  return {
    schema: {
      ...schema,
      tables: schema.tables.map(t =>
        t.id === tableId ? { ...t, foreignKeys: [...t.foreignKeys, newFk] } : t
      ),
      updatedAt: now(),
    },
    fkId,
  };
}

export function deleteForeignKey(
  schema: ERDSchema,
  tableId: string,
  fkId: string,
): ERDSchema {
  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        foreignKeys: t.foreignKeys.filter(fk => fk.id !== fkId),
      };
    }),
    updatedAt: now(),
  };
}

// ---- Memo operations ----

export function addMemo(
  schema: ERDSchema,
  options?: { content?: string; color?: string; x?: number; y?: number; width?: number; height?: number; schema?: string },
): { schema: ERDSchema; memoId: string } {
  const id = generateId();
  const memos = schema.memos ?? [];

  const newMemo: Memo = {
    id,
    content: options?.content ?? '',
    position: { x: options?.x ?? 0, y: options?.y ?? 0 },
    width: options?.width ?? 200,
    height: options?.height ?? 150,
    color: options?.color,
    ...(options?.schema ? { schema: options.schema } : {}),
  };

  return {
    schema: { ...schema, memos: [...memos, newMemo], updatedAt: now() },
    memoId: id,
  };
}

export function updateMemo(
  schema: ERDSchema,
  memoId: string,
  patch: { content?: string; color?: string; x?: number; y?: number; width?: number; height?: number; locked?: boolean },
): ERDSchema {
  const memos = schema.memos ?? [];
  return {
    ...schema,
    memos: memos.map(m => {
      if (m.id !== memoId) return m;
      return {
        ...m,
        ...(patch.content !== undefined && { content: patch.content }),
        ...(patch.color !== undefined && { color: patch.color || undefined }),
        ...(patch.x !== undefined || patch.y !== undefined
          ? { position: { x: patch.x ?? m.position.x, y: patch.y ?? m.position.y } }
          : {}),
        ...(patch.width !== undefined && { width: patch.width }),
        ...(patch.height !== undefined && { height: patch.height }),
        ...(patch.locked !== undefined && { locked: patch.locked || undefined }),
      };
    }),
    updatedAt: now(),
  };
}

export function deleteMemo(schema: ERDSchema, memoId: string): ERDSchema {
  const memos = schema.memos ?? [];
  return {
    ...schema,
    memos: memos.filter(m => m.id !== memoId),
    updatedAt: now(),
  };
}

// ---- Domain operations ----

export function addDomain(
  schema: ERDSchema,
  options: Omit<ColumnDomain, 'id'>,
): { schema: ERDSchema; domainId: string } {
  const id = generateId();
  const domain: ColumnDomain = { id, ...options };
  return {
    schema: {
      ...schema,
      domains: [...(schema.domains ?? []), domain],
      updatedAt: now(),
    },
    domainId: id,
  };
}

export function updateDomain(
  schema: ERDSchema,
  domainId: string,
  patch: Partial<Omit<ColumnDomain, 'id'>>,
): ERDSchema {
  return propagateWithHierarchy(schema, domainId, patch);
}

export function deleteDomain(schema: ERDSchema, domainId: string): ERDSchema {
  const deleted = (schema.domains ?? []).find(d => d.id === domainId);
  const parentIdOfDeleted = deleted?.parentId;

  // Re-parent children and remove the domain
  const domains = (schema.domains ?? [])
    .filter(d => d.id !== domainId)
    .map(d => d.parentId === domainId ? { ...d, parentId: parentIdOfDeleted } : d);

  const tables = schema.tables.map(t => ({
    ...t,
    columns: t.columns.map(c =>
      c.domainId === domainId ? { ...c, domainId: undefined } : c
    ),
  }));

  return { ...schema, domains, tables, updatedAt: now() };
}

export interface DomainSuggestion {
  suggestedName: string;
  type: ColumnType;
  length?: number;
  scale?: number;
  columns: { tableName: string; columnName: string }[];
}

export function suggestDomains(schema: ERDSchema): DomainSuggestion[] {
  const linkedDomainIds = new Set((schema.domains ?? []).map(d => d.id));

  // Group unlinked columns by (type, length, scale, baseName)
  type Key = string;
  const groups = new Map<Key, { type: ColumnType; length?: number; scale?: number; baseName: string; columns: { tableName: string; columnName: string }[] }>();

  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.domainId && linkedDomainIds.has(col.domainId)) continue;

      // Normalize column name to a base name (strip table-specific prefix)
      const baseName = col.name.replace(/^(fk_|id_)/, '').toLowerCase();
      const key = `${col.type}|${col.length ?? ''}|${col.scale ?? ''}|${baseName}`;

      const existing = groups.get(key);
      if (existing) {
        existing.columns.push({ tableName: table.name, columnName: col.name });
      } else {
        groups.set(key, {
          type: col.type,
          length: col.length,
          scale: col.scale,
          baseName,
          columns: [{ tableName: table.name, columnName: col.name }],
        });
      }
    }
  }

  // Only suggest groups with 2+ columns
  return [...groups.values()]
    .filter(g => g.columns.length >= 2)
    .map(g => ({
      suggestedName: g.baseName,
      type: g.type,
      length: g.length,
      scale: g.scale,
      columns: g.columns,
    }))
    .sort((a, b) => b.columns.length - a.columns.length);
}

// ---- FK update ----

export function updateForeignKey(
  schema: ERDSchema,
  tableId: string,
  fkId: string,
  patch: {
    columnIds?: string[];
    referencedTableId?: string;
    referencedColumnIds?: string[];
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
    label?: string;
  },
): ERDSchema | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;
  const fk = table.foreignKeys.find(f => f.id === fkId);
  if (!fk) return null;

  if (patch.referencedTableId && !schema.tables.find(t => t.id === patch.referencedTableId)) return null;

  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        foreignKeys: t.foreignKeys.map(f =>
          f.id === fkId ? { ...f, ...patch } : f
        ),
      };
    }),
    updatedAt: now(),
  };
}

// ---- Unique Key operations ----

export function addUniqueKey(
  schema: ERDSchema,
  tableId: string,
  columnIds: string[],
  name?: string,
): { schema: ERDSchema; ukId: string } | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const ukId = generateId();
  const uk: UniqueKey = { id: ukId, columnIds, ...(name ? { name } : {}) };

  return {
    schema: {
      ...schema,
      tables: schema.tables.map(t =>
        t.id === tableId ? { ...t, uniqueKeys: [...(t.uniqueKeys || []), uk] } : t
      ),
      updatedAt: now(),
    },
    ukId,
  };
}

export function deleteUniqueKey(
  schema: ERDSchema,
  tableId: string,
  ukId: string,
): ERDSchema {
  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        uniqueKeys: (t.uniqueKeys || []).filter(uk => uk.id !== ukId),
      };
    }),
    updatedAt: now(),
  };
}

// ---- Index operations ----

export function addIndex(
  schema: ERDSchema,
  tableId: string,
  columnIds: string[],
  unique: boolean,
  name?: string,
): { schema: ERDSchema; indexId: string } | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const indexId = generateId();
  const idx: TableIndex = { id: indexId, columnIds, unique, ...(name ? { name } : {}) };

  return {
    schema: {
      ...schema,
      tables: schema.tables.map(t =>
        t.id === tableId ? { ...t, indexes: [...(t.indexes || []), idx] } : t
      ),
      updatedAt: now(),
    },
    indexId,
  };
}

export function deleteIndex(
  schema: ERDSchema,
  tableId: string,
  indexId: string,
): ERDSchema {
  return {
    ...schema,
    tables: schema.tables.map(t => {
      if (t.id !== tableId) return t;
      return {
        ...t,
        indexes: (t.indexes || []).filter(idx => idx.id !== indexId),
      };
    }),
    updatedAt: now(),
  };
}

// ---- Column reorder ----

export function moveColumn(
  schema: ERDSchema,
  tableId: string,
  columnId: string,
  toIndex: number,
): ERDSchema | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const fromIndex = table.columns.findIndex(c => c.id === columnId);
  if (fromIndex === -1) return null;
  if (toIndex < 0 || toIndex >= table.columns.length) return null;
  if (fromIndex === toIndex) {
    return { ...schema, updatedAt: now() };
  }

  const cols = [...table.columns];
  const [moved] = cols.splice(fromIndex, 1);
  cols.splice(toIndex, 0, moved);

  return {
    ...schema,
    tables: schema.tables.map(t =>
      t.id === tableId ? { ...t, columns: cols } : t
    ),
    updatedAt: now(),
  };
}

// ---- Table duplicate ----

export function duplicateTable(
  schema: ERDSchema,
  tableId: string,
): { schema: ERDSchema; newTableId: string } | null {
  const table = schema.tables.find(t => t.id === tableId);
  if (!table) return null;

  const newTableId = generateId();
  const newColumns = table.columns.map(c => ({ ...c, id: generateId() }));

  const newTable: Table = {
    ...table,
    id: newTableId,
    name: `${table.name}_copy`,
    columns: newColumns,
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: table.position.x + 40, y: table.position.y + 40 },
  };

  return {
    schema: { ...schema, tables: [...schema.tables, newTable], updatedAt: now() },
    newTableId,
  };
}

// ---- Memo attach/detach ----

export function attachMemo(
  schema: ERDSchema,
  memoId: string,
  tableId: string,
): ERDSchema {
  const memos = schema.memos ?? [];
  return {
    ...schema,
    memos: memos.map(m =>
      m.id === memoId ? { ...m, attachedTableId: tableId } : m
    ),
    updatedAt: now(),
  };
}

export function detachMemo(
  schema: ERDSchema,
  memoId: string,
): ERDSchema {
  const memos = schema.memos ?? [];
  return {
    ...schema,
    memos: memos.map(m =>
      m.id === memoId ? { ...m, attachedTableId: undefined } : m
    ),
    updatedAt: now(),
  };
}

// ---- Rename group ----

export function renameGroup(
  schema: ERDSchema,
  oldName: string,
  newName: string,
): ERDSchema {
  if (oldName === newName) return { ...schema, updatedAt: now() };

  const tables = schema.tables.map(t =>
    t.group === oldName ? { ...t, group: newName } : t
  );

  const groupColors = { ...(schema.groupColors ?? {}) };
  if (oldName in groupColors) {
    groupColors[newName] = groupColors[oldName];
    delete groupColors[oldName];
  }

  return { ...schema, tables, groupColors, updatedAt: now() };
}

// ---- Bulk update tables ----

export function bulkUpdateTables(
  schema: ERDSchema,
  updates: { tableId: string; name?: string; comment?: string; color?: string; group?: string; schema?: string }[],
): { schema: ERDSchema; updated: number; notFound: string[] } {
  const tableIds = new Set(schema.tables.map(t => t.id));
  const notFound: string[] = [];
  let s = schema;
  let updated = 0;

  for (const { tableId, ...patch } of updates) {
    if (!tableIds.has(tableId)) {
      notFound.push(tableId);
      continue;
    }
    s = updateTable(s, tableId, patch);
    updated++;
  }

  return { schema: s, updated, notFound };
}

// ---- Bulk update columns ----

export function bulkUpdateColumns(
  schema: ERDSchema,
  updates: { tableId: string; columnId: string; [key: string]: unknown }[],
): { schema: ERDSchema; updated: number; notFound: string[] } {
  const notFound: string[] = [];
  let s = schema;
  let updated = 0;

  for (const { tableId, columnId, ...patch } of updates) {
    const table = s.tables.find(t => t.id === tableId);
    if (!table || !table.columns.find(c => c.id === columnId)) {
      notFound.push(`${tableId}/${columnId}`);
      continue;
    }
    s = updateColumn(s, tableId, columnId, patch as Partial<Omit<Column, 'id'>>);
    updated++;
  }

  return { schema: s, updated, notFound };
}

// ---- Bulk assign domain ----

export function bulkAssignDomainByName(
  schema: ERDSchema,
  domainId: string,
  columnName: string,
  maxCount = 1000,
): { schema: ERDSchema; updated: number } {
  const patch = { domainId: domainId || undefined };
  let s = schema;
  let updated = 0;

  for (const table of s.tables) {
    for (const col of table.columns) {
      if (col.name === columnName) {
        s = updateColumn(s, table.id, col.id, patch);
        updated++;
        if (updated >= maxCount) return { schema: s, updated };
      }
    }
  }

  return { schema: s, updated };
}

export function bulkAssignDomainByPattern(
  schema: ERDSchema,
  domainId: string,
  pattern: RegExp,
  maxCount = 1000,
): { schema: ERDSchema; updated: number } {
  const patch = { domainId: domainId || undefined };
  let s = schema;
  let updated = 0;

  for (const table of s.tables) {
    for (const col of table.columns) {
      if (pattern.test(col.name)) {
        s = updateColumn(s, table.id, col.id, patch);
        updated++;
        if (updated >= maxCount) return { schema: s, updated };
      }
    }
  }

  return { schema: s, updated };
}

export function bulkAssignDomainByList(
  schema: ERDSchema,
  domainId: string,
  columns: { tableId: string; columnId: string }[],
): { schema: ERDSchema; updated: number } {
  const patch = { domainId: domainId || undefined };
  let s = schema;
  let updated = 0;

  for (const { tableId, columnId } of columns) {
    const table = s.tables.find(t => t.id === tableId);
    if (!table || !table.columns.find(c => c.id === columnId)) continue;
    s = updateColumn(s, tableId, columnId, patch);
    updated++;
  }

  return { schema: s, updated };
}

// ---- Delete multiple tables ----

export function deleteTables(schema: ERDSchema, tableIds: string[]): ERDSchema {
  const idSet = new Set(tableIds);
  return {
    ...schema,
    tables: schema.tables
      .filter(t => !idSet.has(t.id))
      .map(t => ({
        ...t,
        foreignKeys: t.foreignKeys.filter(fk => !idSet.has(fk.referencedTableId)),
      })),
    memos: (schema.memos ?? []).map(m =>
      m.attachedTableId && idSet.has(m.attachedTableId)
        ? { ...m, attachedTableId: undefined }
        : m
    ),
    updatedAt: now(),
  };
}

// ---- Schema namespace CRUD ----

export function addSchemaNamespace(
  schema: ERDSchema,
  name: string,
): ERDSchema | null {
  const schemas = schema.schemas ?? [];
  if (schemas.includes(name)) return null;
  return { ...schema, schemas: [...schemas, name], updatedAt: now() };
}

export function deleteSchemaNamespace(
  schema: ERDSchema,
  name: string,
): ERDSchema {
  const schemas = (schema.schemas ?? []).filter(s => s !== name);
  const tables = schema.tables.map(t =>
    t.schema === name ? { ...t, schema: undefined } : t
  );
  const memos = (schema.memos ?? []).map(m =>
    m.schema === name ? { ...m, schema: undefined } : m
  );
  return { ...schema, schemas, tables, memos, updatedAt: now() };
}

// ---- Rename schema namespace ----

export function renameSchema(
  schema: ERDSchema,
  oldName: string,
  newName: string,
): ERDSchema | null {
  if (!newName) return null;
  if (oldName === newName) return { ...schema, updatedAt: now() };

  const schemas = schema.schemas ?? [];
  if (schemas.includes(newName)) return null;

  const tables = schema.tables.map(t =>
    t.schema === oldName ? { ...t, schema: newName } : t
  );

  const memos = (schema.memos ?? []).map(m =>
    m.schema === oldName ? { ...m, schema: newName } : m
  );

  const newSchemas = schemas.map(s => s === oldName ? newName : s);

  return { ...schema, tables, memos, schemas: newSchemas, updatedAt: now() };
}

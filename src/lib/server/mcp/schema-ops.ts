import type { Column, ColumnDomain, ColumnType, ERDSchema, ForeignKey, Memo, ReferentialAction, Table } from '$lib/types/erd';
import { DOMAIN_FIELDS } from '$lib/types/erd';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
  options?: { name?: string; comment?: string; color?: string; group?: string; withPk?: boolean },
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
  };

  return {
    schema: { ...schema, tables: [...schema.tables, newTable], updatedAt: now() },
    tableId: id,
  };
}

export function updateTable(
  schema: ERDSchema,
  tableId: string,
  patch: { name?: string; comment?: string; color?: string; group?: string },
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
  options?: { content?: string; color?: string; x?: number; y?: number; width?: number; height?: number },
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
  const domains = (schema.domains ?? []).map(d =>
    d.id === domainId ? { ...d, ...patch } : d
  );
  const updated = domains.find(d => d.id === domainId);
  if (!updated) return schema;

  // Propagate domain fields to linked columns
  const tables = schema.tables.map(t => ({
    ...t,
    columns: t.columns.map(c => {
      if (c.domainId !== domainId) return c;
      const propagated: Partial<Column> = {};
      for (const field of DOMAIN_FIELDS) {
        (propagated as any)[field] = (updated as any)[field];
      }
      return { ...c, ...propagated };
    }),
  }));

  return { ...schema, domains, tables, updatedAt: now() };
}

export function deleteDomain(schema: ERDSchema, domainId: string): ERDSchema {
  return {
    ...schema,
    domains: (schema.domains ?? []).filter(d => d.id !== domainId),
    tables: schema.tables.map(t => ({
      ...t,
      columns: t.columns.map(c =>
        c.domainId === domainId ? { ...c, domainId: undefined } : c
      ),
    })),
    updatedAt: now(),
  };
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

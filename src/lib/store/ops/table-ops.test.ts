import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ERDSchema, Table, Column, Memo, ForeignKey, UniqueKey, TableIndex } from '$lib/types/erd';
import {
  createTable,
  createTableFromTemplate,
  pasteTables,
  deleteTableOp,
  deleteTablesOp,
  duplicateTableOp,
  moveTableOp,
  moveTablesOp,
  cleanupOrphanedGroupColors,
} from '$lib/store/ops/table-ops';

let idCounter = 0;
vi.mock('$lib/utils/common', () => ({
  generateId: () => `id_${++idCounter}`,
  now: () => '2024-06-01T00:00:00.000Z',
}));

function makeSchema(tables: Table[] = [], memos: Memo[] = []): ERDSchema {
  return {
    version: '1.0',
    tables,
    domains: [],
    memos,
    groupColors: {},
    schemas: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  const id = overrides.id ?? `tbl_${++idCounter}`;
  return {
    id,
    name: overrides.name ?? 'test_table',
    columns: overrides.columns ?? [
      { id: `col_${++idCounter}`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true },
    ],
    foreignKeys: overrides.foreignKeys ?? [],
    uniqueKeys: overrides.uniqueKeys ?? [],
    indexes: overrides.indexes ?? [],
    position: overrides.position ?? { x: 0, y: 0 },
    comment: overrides.comment,
    color: overrides.color,
    group: overrides.group,
    schema: overrides.schema,
  };
}

function makeMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: overrides.id ?? `memo_${++idCounter}`,
    content: overrides.content ?? 'test memo',
    position: overrides.position ?? { x: 100, y: 100 },
    width: overrides.width ?? 200,
    height: overrides.height ?? 150,
    color: overrides.color,
    attachedTableId: overrides.attachedTableId,
  };
}

beforeEach(() => {
  idCounter = 0;
});

// ─── createTable ─────────────────────────────────────────────────────────────

describe('createTable', () => {
  it('creates table_1 on empty schema', () => {
    const schema = makeSchema();
    const { table, id } = createTable(schema, { x: 10, y: 20 });
    expect(table.name).toBe('table_1');
    expect(id).toBe(table.id);
    expect(table.position).toEqual({ x: 10, y: 20 });
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]).toBe(table);
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('creates a default id column', () => {
    const schema = makeSchema();
    const { table } = createTable(schema, { x: 0, y: 0 });
    expect(table.columns).toHaveLength(1);
    const col = table.columns[0];
    expect(col.name).toBe('id');
    expect(col.type).toBe('INT');
    expect(col.primaryKey).toBe(true);
    expect(col.autoIncrement).toBe(true);
    expect(col.nullable).toBe(false);
    expect(col.unique).toBe(true);
  });

  it('auto-names table_2 when table_1 exists', () => {
    const existing = makeTable({ name: 'table_1' });
    const schema = makeSchema([existing]);
    const { table } = createTable(schema, { x: 0, y: 0 });
    expect(table.name).toBe('table_2');
  });

  it('skips conflicts: table_1 and table_2 exist -> table_3', () => {
    const t1 = makeTable({ name: 'table_1' });
    const t2 = makeTable({ name: 'table_2' });
    const schema = makeSchema([t1, t2]);
    const { table } = createTable(schema, { x: 0, y: 0 });
    expect(table.name).toBe('table_3');
  });

  it('assigns activeSchema when provided', () => {
    const schema = makeSchema();
    const { table } = createTable(schema, { x: 0, y: 0 }, 'public');
    expect(table.schema).toBe('public');
  });

  it('does not set schema property when activeSchema is not provided', () => {
    const schema = makeSchema();
    const { table } = createTable(schema, { x: 0, y: 0 });
    expect(table.schema).toBeUndefined();
  });
});

// ─── createTableFromTemplate ─────────────────────────────────────────────────

describe('createTableFromTemplate', () => {
  const templateColumns: Omit<Column, 'id'>[] = [
    { name: 'id', type: 'UUID', nullable: false, primaryKey: true, unique: true, autoIncrement: false },
    { name: 'name', type: 'VARCHAR', nullable: false, primaryKey: false, unique: false, autoIncrement: false, length: 255 },
  ];

  it('creates table with given name and template columns', () => {
    const schema = makeSchema();
    const { table } = createTableFromTemplate(schema, templateColumns, 'users', { x: 50, y: 60 });
    expect(table.name).toBe('users');
    expect(table.columns).toHaveLength(2);
    expect(table.columns[0].name).toBe('id');
    expect(table.columns[0].type).toBe('UUID');
    expect(table.columns[1].name).toBe('name');
    expect(table.columns[1].length).toBe(255);
    expect(table.position).toEqual({ x: 50, y: 60 });
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('assigns generated IDs to columns', () => {
    const schema = makeSchema();
    const { table } = createTableFromTemplate(schema, templateColumns, 'users', { x: 0, y: 0 });
    // Each column should have a unique generated ID
    expect(table.columns[0].id).toBeTruthy();
    expect(table.columns[1].id).toBeTruthy();
    expect(table.columns[0].id).not.toBe(table.columns[1].id);
  });

  it('resolves name conflict with _1, _2 suffix', () => {
    const existing = makeTable({ name: 'users' });
    const schema = makeSchema([existing]);
    const { table } = createTableFromTemplate(schema, templateColumns, 'users', { x: 0, y: 0 });
    expect(table.name).toBe('users_1');
  });

  it('resolves multiple name conflicts', () => {
    const t1 = makeTable({ name: 'users' });
    const t2 = makeTable({ name: 'users_1' });
    const schema = makeSchema([t1, t2]);
    const { table } = createTableFromTemplate(schema, templateColumns, 'users', { x: 0, y: 0 });
    expect(table.name).toBe('users_2');
  });

  it('assigns activeSchema when provided', () => {
    const schema = makeSchema();
    const { table } = createTableFromTemplate(schema, templateColumns, 'users', { x: 0, y: 0 }, 'auth');
    expect(table.schema).toBe('auth');
  });
});

// ─── pasteTables ─────────────────────────────────────────────────────────────

describe('pasteTables', () => {
  it('pastes a single table with new IDs and offset position', () => {
    const srcCol: Column = { id: 'old_col', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true };
    const srcTable = makeTable({ id: 'old_tbl', name: 'orders', columns: [srcCol], position: { x: 100, y: 200 } });
    const schema = makeSchema();

    const { idMap, newIds } = pasteTables(schema, [srcTable]);
    expect(newIds).toHaveLength(1);
    expect(schema.tables).toHaveLength(1);
    const pasted = schema.tables[0];
    expect(pasted.id).not.toBe('old_tbl');
    expect(pasted.name).toBe('orders');
    expect(pasted.position).toEqual({ x: 130, y: 230 });
    expect(pasted.columns[0].id).not.toBe('old_col');
    expect(idMap.get('old_tbl')).toBe(pasted.id);
    expect(idMap.get('old_col')).toBe(pasted.columns[0].id);
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('resolves name conflicts on paste', () => {
    const existing = makeTable({ name: 'orders' });
    const src = makeTable({ id: 'src1', name: 'orders', position: { x: 0, y: 0 } });
    const schema = makeSchema([existing]);

    pasteTables(schema, [src]);
    const pasted = schema.tables.find((t) => t.id !== existing.id)!;
    expect(pasted.name).toBe('orders_1');
  });

  it('remaps FKs between pasted tables', () => {
    const colA: Column = { id: 'colA', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true };
    const colB: Column = { id: 'colB', name: 'a_id', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const tableA = makeTable({ id: 'tblA', name: 'a', columns: [colA], position: { x: 0, y: 0 } });
    const fk: ForeignKey = {
      id: 'fk1', columnIds: ['colB'], referencedTableId: 'tblA', referencedColumnIds: ['colA'],
      onDelete: 'CASCADE', onUpdate: 'CASCADE',
    };
    const tableB = makeTable({ id: 'tblB', name: 'b', columns: [colB], foreignKeys: [fk], position: { x: 300, y: 0 } });
    const schema = makeSchema();

    const { idMap } = pasteTables(schema, [tableA, tableB]);
    const pastedB = schema.tables.find((t) => t.id === idMap.get('tblB'))!;
    expect(pastedB.foreignKeys).toHaveLength(1);
    const pastedFk = pastedB.foreignKeys[0];
    expect(pastedFk.referencedTableId).toBe(idMap.get('tblA'));
    expect(pastedFk.columnIds[0]).toBe(idMap.get('colB'));
    expect(pastedFk.referencedColumnIds[0]).toBe(idMap.get('colA'));
    expect(pastedFk.id).not.toBe('fk1');
  });

  it('does not remap FKs referencing tables outside the pasted set', () => {
    const col: Column = { id: 'colX', name: 'ext_id', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const fk: ForeignKey = {
      id: 'fk_ext', columnIds: ['colX'], referencedTableId: 'external_tbl', referencedColumnIds: ['ext_col'],
      onDelete: 'CASCADE', onUpdate: 'CASCADE',
    };
    const src = makeTable({ id: 'src', name: 'child', columns: [col], foreignKeys: [fk], position: { x: 0, y: 0 } });
    const schema = makeSchema();

    pasteTables(schema, [src]);
    const pasted = schema.tables[0];
    expect(pasted.foreignKeys).toHaveLength(0);
  });

  it('remaps uniqueKey columnIds', () => {
    const col1: Column = { id: 'uk_col1', name: 'email', type: 'VARCHAR', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const col2: Column = { id: 'uk_col2', name: 'tenant', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const uk: UniqueKey = { id: 'uk1', columnIds: ['uk_col1', 'uk_col2'], name: 'uq_email_tenant' };
    const src = makeTable({ id: 'uk_tbl', name: 'users', columns: [col1, col2], uniqueKeys: [uk], position: { x: 0, y: 0 } });
    const schema = makeSchema();

    const { idMap } = pasteTables(schema, [src]);
    const pasted = schema.tables[0];
    expect(pasted.uniqueKeys).toHaveLength(1);
    expect(pasted.uniqueKeys[0].columnIds[0]).toBe(idMap.get('uk_col1'));
    expect(pasted.uniqueKeys[0].columnIds[1]).toBe(idMap.get('uk_col2'));
    expect(pasted.uniqueKeys[0].id).not.toBe('uk1');
  });

  it('remaps index columnIds', () => {
    const col: Column = { id: 'idx_col', name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const idx: TableIndex = { id: 'idx1', columnIds: ['idx_col'], name: 'idx_created', unique: false };
    const src = makeTable({ id: 'idx_tbl', name: 'events', columns: [col], indexes: [idx], position: { x: 0, y: 0 } });
    const schema = makeSchema();

    const { idMap } = pasteTables(schema, [src]);
    const pasted = schema.tables[0];
    expect(pasted.indexes).toHaveLength(1);
    expect(pasted.indexes[0].columnIds[0]).toBe(idMap.get('idx_col'));
    expect(pasted.indexes[0].id).not.toBe('idx1');
  });

  it('assigns activeSchema to pasted tables when provided', () => {
    const src = makeTable({ id: 'src', name: 'items', position: { x: 0, y: 0 }, schema: 'old_schema' });
    const schema = makeSchema();

    pasteTables(schema, [src], 'new_schema');
    expect(schema.tables[0].schema).toBe('new_schema');
  });

  it('preserves source schema when activeSchema is not provided', () => {
    const src = makeTable({ id: 'src', name: 'items', position: { x: 0, y: 0 }, schema: 'public' });
    const schema = makeSchema();

    pasteTables(schema, [src]);
    expect(schema.tables[0].schema).toBe('public');
  });

  it('preserves comment, color, and group', () => {
    const src = makeTable({ id: 'src', name: 'styled', position: { x: 0, y: 0 }, comment: 'hello', color: '#ff0000', group: 'core' });
    const schema = makeSchema();

    pasteTables(schema, [src]);
    const pasted = schema.tables[0];
    expect(pasted.comment).toBe('hello');
    expect(pasted.color).toBe('#ff0000');
    expect(pasted.group).toBe('core');
  });
});

// ─── deleteTableOp ───────────────────────────────────────────────────────────

describe('deleteTableOp', () => {
  it('removes the table from schema', () => {
    const t = makeTable({ id: 'del1', name: 'target' });
    const schema = makeSchema([t]);
    deleteTableOp(schema, 'del1');
    expect(schema.tables).toHaveLength(0);
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('removes FKs in other tables referencing the deleted table', () => {
    const tA = makeTable({ id: 'tA', name: 'parent' });
    const fk: ForeignKey = {
      id: 'fk_ref', columnIds: ['c1'], referencedTableId: 'tA', referencedColumnIds: ['c2'],
      onDelete: 'CASCADE', onUpdate: 'CASCADE',
    };
    const tB = makeTable({ id: 'tB', name: 'child', foreignKeys: [fk] });
    const schema = makeSchema([tA, tB]);
    deleteTableOp(schema, 'tA');
    const remaining = schema.tables.find((t) => t.id === 'tB')!;
    expect(remaining.foreignKeys).toHaveLength(0);
  });

  it('detaches memos attached to the deleted table', () => {
    const t = makeTable({ id: 'tbl_del', name: 'x' });
    const m = makeMemo({ attachedTableId: 'tbl_del' });
    const schema = makeSchema([t], [m]);
    deleteTableOp(schema, 'tbl_del');
    expect(schema.memos[0].attachedTableId).toBeUndefined();
  });

  it('does not affect unrelated memos', () => {
    const t = makeTable({ id: 'tbl_d', name: 'x' });
    const m = makeMemo({ attachedTableId: 'other_tbl' });
    const schema = makeSchema([t], [m]);
    deleteTableOp(schema, 'tbl_d');
    expect(schema.memos[0].attachedTableId).toBe('other_tbl');
  });
});

// ─── deleteTablesOp ──────────────────────────────────────────────────────────

describe('deleteTablesOp', () => {
  it('removes multiple tables', () => {
    const t1 = makeTable({ id: 'b1', name: 'a' });
    const t2 = makeTable({ id: 'b2', name: 'b' });
    const t3 = makeTable({ id: 'b3', name: 'c' });
    const schema = makeSchema([t1, t2, t3]);
    deleteTablesOp(schema, ['b1', 'b3']);
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].id).toBe('b2');
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('removes FKs referencing any deleted table', () => {
    const t1 = makeTable({ id: 'p1', name: 'parent1' });
    const t2 = makeTable({ id: 'p2', name: 'parent2' });
    const fk1: ForeignKey = { id: 'f1', columnIds: ['c1'], referencedTableId: 'p1', referencedColumnIds: ['c2'], onDelete: 'CASCADE', onUpdate: 'CASCADE' };
    const fk2: ForeignKey = { id: 'f2', columnIds: ['c3'], referencedTableId: 'p2', referencedColumnIds: ['c4'], onDelete: 'CASCADE', onUpdate: 'CASCADE' };
    const child = makeTable({ id: 'ch', name: 'child', foreignKeys: [fk1, fk2] });
    const schema = makeSchema([t1, t2, child]);
    deleteTablesOp(schema, ['p1']);
    const remaining = schema.tables.find((t) => t.id === 'ch')!;
    expect(remaining.foreignKeys).toHaveLength(1);
    expect(remaining.foreignKeys[0].referencedTableId).toBe('p2');
  });

  it('detaches memos attached to any deleted table', () => {
    const t1 = makeTable({ id: 'dt1', name: 'x' });
    const t2 = makeTable({ id: 'dt2', name: 'y' });
    const m1 = makeMemo({ attachedTableId: 'dt1' });
    const m2 = makeMemo({ attachedTableId: 'dt2' });
    const m3 = makeMemo({ attachedTableId: 'other' });
    const schema = makeSchema([t1, t2], [m1, m2, m3]);
    deleteTablesOp(schema, ['dt1', 'dt2']);
    expect(schema.memos[0].attachedTableId).toBeUndefined();
    expect(schema.memos[1].attachedTableId).toBeUndefined();
    expect(schema.memos[2].attachedTableId).toBe('other');
  });
});

// ─── duplicateTableOp ────────────────────────────────────────────────────────

describe('duplicateTableOp', () => {
  it('duplicates table with _copy suffix and offset position', () => {
    const col: Column = { id: 'orig_col', name: 'val', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false };
    const src = makeTable({ id: 'dup_src', name: 'products', columns: [col], position: { x: 100, y: 200 }, comment: 'stuff', color: '#123', group: 'shop' });
    const schema = makeSchema([src]);

    const result = duplicateTableOp(schema, 'dup_src');
    expect(result).toBeDefined();
    expect(result!.name).toBe('products_copy');
    expect(result!.position).toEqual({ x: 130, y: 230 });
    expect(result!.columns).toHaveLength(1);
    expect(result!.columns[0].name).toBe('val');
    expect(result!.columns[0].id).not.toBe('orig_col');
    expect(result!.foreignKeys).toEqual([]);
    expect(result!.uniqueKeys).toEqual([]);
    expect(result!.indexes).toEqual([]);
    expect(result!.comment).toBe('stuff');
    expect(result!.color).toBe('#123');
    expect(result!.group).toBe('shop');
    expect(schema.tables).toHaveLength(2);
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('generates new unique IDs for table and columns', () => {
    const col: Column = { id: 'c1', name: 'x', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true };
    const src = makeTable({ id: 'dup2', name: 'tbl', columns: [col], position: { x: 0, y: 0 } });
    const schema = makeSchema([src]);

    const result = duplicateTableOp(schema, 'dup2')!;
    expect(result.id).not.toBe('dup2');
    expect(result.columns[0].id).not.toBe('c1');
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema();
    const result = duplicateTableOp(schema, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('does not copy FKs from source', () => {
    const fk: ForeignKey = { id: 'fk', columnIds: ['c'], referencedTableId: 'other', referencedColumnIds: ['oc'], onDelete: 'CASCADE', onUpdate: 'CASCADE' };
    const src = makeTable({ id: 'fk_src', name: 'has_fk', foreignKeys: [fk], position: { x: 0, y: 0 } });
    const schema = makeSchema([src]);
    const result = duplicateTableOp(schema, 'fk_src')!;
    expect(result.foreignKeys).toEqual([]);
  });
});

// ─── moveTableOp ─────────────────────────────────────────────────────────────

describe('moveTableOp', () => {
  it('moves table to new position', () => {
    const t = makeTable({ id: 'mv1', name: 'movable', position: { x: 10, y: 20 } });
    const schema = makeSchema([t]);
    moveTableOp(schema, 'mv1', 50, 80);
    expect(schema.tables[0].position).toEqual({ x: 50, y: 80 });
  });

  it('moves attached memos by the same delta', () => {
    const t = makeTable({ id: 'mv2', name: 'tbl', position: { x: 100, y: 100 } });
    const m = makeMemo({ attachedTableId: 'mv2', position: { x: 150, y: 120 } });
    const schema = makeSchema([t], [m]);
    moveTableOp(schema, 'mv2', 130, 110); // dx=30, dy=10
    expect(schema.memos[0].position).toEqual({ x: 180, y: 130 });
  });

  it('does not move unattached memos', () => {
    const t = makeTable({ id: 'mv3', name: 'tbl', position: { x: 0, y: 0 } });
    const m = makeMemo({ position: { x: 50, y: 50 } });
    const schema = makeSchema([t], [m]);
    moveTableOp(schema, 'mv3', 10, 10);
    expect(schema.memos[0].position).toEqual({ x: 50, y: 50 });
  });

  it('is no-op for nonexistent table', () => {
    const schema = makeSchema();
    moveTableOp(schema, 'ghost', 10, 10);
    // should not throw
    expect(schema.tables).toHaveLength(0);
  });
});

// ─── moveTablesOp ────────────────────────────────────────────────────────────

describe('moveTablesOp', () => {
  it('moves multiple tables', () => {
    const t1 = makeTable({ id: 'mt1', name: 'a', position: { x: 0, y: 0 } });
    const t2 = makeTable({ id: 'mt2', name: 'b', position: { x: 100, y: 100 } });
    const schema = makeSchema([t1, t2]);
    moveTablesOp(schema, [
      { id: 'mt1', x: 10, y: 20 },
      { id: 'mt2', x: 150, y: 200 },
    ]);
    expect(schema.tables[0].position).toEqual({ x: 10, y: 20 });
    expect(schema.tables[1].position).toEqual({ x: 150, y: 200 });
  });

  it('moves attached memos for each table by delta', () => {
    const t1 = makeTable({ id: 'bmt1', name: 'a', position: { x: 0, y: 0 } });
    const t2 = makeTable({ id: 'bmt2', name: 'b', position: { x: 100, y: 100 } });
    const m1 = makeMemo({ attachedTableId: 'bmt1', position: { x: 20, y: 30 } });
    const m2 = makeMemo({ attachedTableId: 'bmt2', position: { x: 120, y: 130 } });
    const schema = makeSchema([t1, t2], [m1, m2]);
    moveTablesOp(schema, [
      { id: 'bmt1', x: 5, y: 5 },   // dx=5, dy=5
      { id: 'bmt2', x: 110, y: 120 }, // dx=10, dy=20
    ]);
    expect(schema.memos[0].position).toEqual({ x: 25, y: 35 });
    expect(schema.memos[1].position).toEqual({ x: 130, y: 150 });
  });

  it('skips nonexistent table IDs', () => {
    const t = makeTable({ id: 'only', name: 'x', position: { x: 0, y: 0 } });
    const schema = makeSchema([t]);
    moveTablesOp(schema, [
      { id: 'only', x: 10, y: 10 },
      { id: 'ghost', x: 99, y: 99 },
    ]);
    expect(schema.tables[0].position).toEqual({ x: 10, y: 10 });
  });
});

// ─── cleanupOrphanedGroupColors ──────────────────────────────────────────────

describe('cleanupOrphanedGroupColors', () => {
  it('removes groupColors for groups not used by any table', () => {
    const t = makeTable({ group: 'active' });
    const schema = makeSchema([t]);
    schema.groupColors = { active: '#fff', orphan: '#000' };
    cleanupOrphanedGroupColors(schema);
    expect(schema.groupColors).toEqual({ active: '#fff' });
  });

  it('keeps all groupColors when all are active', () => {
    const t1 = makeTable({ group: 'a' });
    const t2 = makeTable({ group: 'b' });
    const schema = makeSchema([t1, t2]);
    schema.groupColors = { a: '#111', b: '#222' };
    cleanupOrphanedGroupColors(schema);
    expect(schema.groupColors).toEqual({ a: '#111', b: '#222' });
  });

  it('is no-op when groupColors is undefined', () => {
    const schema = makeSchema();
    delete schema.groupColors;
    cleanupOrphanedGroupColors(schema);
    expect(schema.groupColors).toBeUndefined();
  });

  it('is no-op when groupColors is empty', () => {
    const schema = makeSchema();
    schema.groupColors = {};
    cleanupOrphanedGroupColors(schema);
    expect(schema.groupColors).toEqual({});
  });

  it('removes all groupColors when no tables have groups', () => {
    const t = makeTable(); // no group
    const schema = makeSchema([t]);
    schema.groupColors = { orphan1: '#aaa', orphan2: '#bbb' };
    cleanupOrphanedGroupColors(schema);
    expect(schema.groupColors).toEqual({});
  });

  it('does not update updatedAt', () => {
    const t = makeTable({ group: 'a' });
    const schema = makeSchema([t]);
    schema.groupColors = { a: '#fff', orphan: '#000' };
    schema.updatedAt = '2024-01-01';
    cleanupOrphanedGroupColors(schema);
    expect(schema.updatedAt).toBe('2024-01-01');
  });
});

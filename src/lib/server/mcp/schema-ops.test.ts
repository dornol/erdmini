import { describe, it, expect } from 'vitest';
import type { ERDSchema, Table, Column, ForeignKey, Memo, ColumnDomain } from '$lib/types/erd';
import {
  addTable, updateTable, deleteTable,
  addColumn, updateColumn, deleteColumn,
  addForeignKey, deleteForeignKey,
  addMemo, updateMemo, deleteMemo,
  addDomain, updateDomain, deleteDomain,
  suggestDomains,
} from './schema-ops';

function emptySchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeTable(name: string, overrides: Partial<Table> = {}): Table {
  return {
    id: name,
    name,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeCol(id: string, name: string, overrides: Partial<Column> = {}): Column {
  return {
    id, name,
    type: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// addTable
// ═══════════════════════════════════════════

describe('addTable', () => {
  it('adds a table with default name to empty schema', () => {
    const { schema, tableId } = addTable(emptySchema());
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].name).toBe('table_1');
    expect(tableId).toBe(schema.tables[0].id);
  });

  it('generates unique 8-char id', () => {
    const { tableId } = addTable(emptySchema());
    expect(tableId).toMatch(/^[a-z0-9]{8}$/);
  });

  it('uses custom name when provided', () => {
    const { schema } = addTable(emptySchema(), { name: 'users' });
    expect(schema.tables[0].name).toBe('users');
  });

  it('adds PK column by default (withPk !== false)', () => {
    const { schema } = addTable(emptySchema());
    const t = schema.tables[0];
    expect(t.columns).toHaveLength(1);
    expect(t.columns[0].name).toBe('id');
    expect(t.columns[0].primaryKey).toBe(true);
    expect(t.columns[0].autoIncrement).toBe(true);
    expect(t.columns[0].nullable).toBe(false);
  });

  it('skips PK column when withPk=false', () => {
    const { schema } = addTable(emptySchema(), { withPk: false });
    expect(schema.tables[0].columns).toHaveLength(0);
  });

  it('applies comment, color, group, schema options', () => {
    const { schema } = addTable(emptySchema(), {
      name: 'users',
      comment: 'User accounts',
      color: '#FF0000',
      group: 'auth',
      schema: 'public',
    });
    const t = schema.tables[0];
    expect(t.comment).toBe('User accounts');
    expect(t.color).toBe('#FF0000');
    expect(t.group).toBe('auth');
    expect(t.schema).toBe('public');
  });

  it('auto-increments default name (table_1, table_2, ...)', () => {
    let s = emptySchema();
    s.tables = [makeTable('table_1')];
    const { schema } = addTable(s);
    expect(schema.tables[1].name).toBe('table_2');
  });

  it('fills gaps in default naming', () => {
    let s = emptySchema();
    s.tables = [makeTable('table_1', { name: 'table_1' }), makeTable('table_3', { name: 'table_3' })];
    const { schema } = addTable(s);
    expect(schema.tables[2].name).toBe('table_2');
  });

  it('updates updatedAt timestamp', () => {
    const original = emptySchema();
    const { schema } = addTable(original);
    expect(schema.updatedAt).not.toBe(original.updatedAt);
  });

  it('does not mutate original schema', () => {
    const original = emptySchema();
    addTable(original);
    expect(original.tables).toHaveLength(0);
  });

  it('positions table to avoid overlap with existing tables', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { position: { x: 0, y: 0 } })];
    const { schema } = addTable(s);
    const newT = schema.tables[1];
    // New table should not be at (0, 0) — must avoid overlap
    expect(newT.position.x !== 0 || newT.position.y !== 0).toBe(true);
  });
});

// ═══════════════════════════════════════════
// updateTable
// ═══════════════════════════════════════════

describe('updateTable', () => {
  it('renames a table', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { name: 'old_name' })];
    const result = updateTable(s, 't1', { name: 'new_name' });
    expect(result.tables[0].name).toBe('new_name');
  });

  it('updates comment', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = updateTable(s, 't1', { comment: 'A comment' });
    expect(result.tables[0].comment).toBe('A comment');
  });

  it('clears comment with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { comment: 'old' })];
    const result = updateTable(s, 't1', { comment: '' });
    expect(result.tables[0].comment).toBeUndefined();
  });

  it('updates color', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = updateTable(s, 't1', { color: '#00FF00' });
    expect(result.tables[0].color).toBe('#00FF00');
  });

  it('clears color with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { color: '#FF0000' })];
    const result = updateTable(s, 't1', { color: '' });
    expect(result.tables[0].color).toBeUndefined();
  });

  it('updates group', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = updateTable(s, 't1', { group: 'auth' });
    expect(result.tables[0].group).toBe('auth');
  });

  it('updates schema namespace', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = updateTable(s, 't1', { schema: 'billing' });
    expect(result.tables[0].schema).toBe('billing');
  });

  it('clears schema with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { schema: 'old' })];
    const result = updateTable(s, 't1', { schema: '' });
    expect(result.tables[0].schema).toBeUndefined();
  });

  it('does not affect other tables', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { name: 'first' }), makeTable('t2', { name: 'second' })];
    const result = updateTable(s, 't1', { name: 'changed' });
    expect(result.tables[0].name).toBe('changed');
    expect(result.tables[1].name).toBe('second');
  });

  it('preserves unpatched fields', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { name: 'original', comment: 'keep', color: '#FFF' })];
    const result = updateTable(s, 't1', { name: 'renamed' });
    expect(result.tables[0].name).toBe('renamed');
    expect(result.tables[0].comment).toBe('keep');
    expect(result.tables[0].color).toBe('#FFF');
  });
});

// ═══════════════════════════════════════════
// deleteTable
// ═══════════════════════════════════════════

describe('deleteTable', () => {
  it('removes the table', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1'), makeTable('t2')];
    const result = deleteTable(s, 't1');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe('t2');
  });

  it('removes FK references to deleted table from other tables', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('users'),
      makeTable('orders', {
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }],
      }),
    ];
    const result = deleteTable(s, 'users');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].foreignKeys).toHaveLength(0);
  });

  it('does not remove FKs referencing other tables', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('users'),
      makeTable('categories'),
      makeTable('orders', {
        foreignKeys: [
          { id: 'fk1', columnIds: ['user_id'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
          { id: 'fk2', columnIds: ['cat_id'], referencedTableId: 'categories', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
        ],
      }),
    ];
    const result = deleteTable(s, 'users');
    const orders = result.tables.find(t => t.id === 'orders')!;
    expect(orders.foreignKeys).toHaveLength(1);
    expect(orders.foreignKeys[0].referencedTableId).toBe('categories');
  });

  it('deleting non-existent table is a no-op', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = deleteTable(s, 'nonexistent');
    expect(result.tables).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// addColumn
// ═══════════════════════════════════════════

describe('addColumn', () => {
  it('adds column to table', () => {
    const s = emptySchema();
    s.tables = [makeTable('users')];
    const result = addColumn(s, 'users', { name: 'email', type: 'VARCHAR', length: 255 });
    expect(result).not.toBeNull();
    expect(result!.schema.tables[0].columns).toHaveLength(1);
    expect(result!.schema.tables[0].columns[0].name).toBe('email');
    expect(result!.schema.tables[0].columns[0].type).toBe('VARCHAR');
    expect(result!.schema.tables[0].columns[0].length).toBe(255);
  });

  it('returns null for non-existent table', () => {
    const result = addColumn(emptySchema(), 'nonexistent', { name: 'col' });
    expect(result).toBeNull();
  });

  it('uses default name column_N', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'existing')] })];
    const result = addColumn(s, 't1');
    expect(result!.schema.tables[0].columns[1].name).toBe('column_2');
  });

  it('defaults to VARCHAR, nullable, non-PK', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = addColumn(s, 't1');
    const col = result!.schema.tables[0].columns[0];
    expect(col.type).toBe('VARCHAR');
    expect(col.nullable).toBe(true);
    expect(col.primaryKey).toBe(false);
    expect(col.unique).toBe(false);
    expect(col.autoIncrement).toBe(false);
  });

  it('PK column implies NOT NULL', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = addColumn(s, 't1', { name: 'id', primaryKey: true, nullable: true });
    expect(result!.schema.tables[0].columns[0].primaryKey).toBe(true);
    expect(result!.schema.tables[0].columns[0].nullable).toBe(false);
  });

  it('supports ENUM with enumValues', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = addColumn(s, 't1', { name: 'status', type: 'ENUM', enumValues: ['active', 'inactive'] });
    expect(result!.schema.tables[0].columns[0].enumValues).toEqual(['active', 'inactive']);
  });

  it('preserves comment and defaultValue', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = addColumn(s, 't1', {
      name: 'created',
      type: 'TIMESTAMP',
      defaultValue: 'CURRENT_TIMESTAMP',
      comment: 'Record creation time',
    });
    const col = result!.schema.tables[0].columns[0];
    expect(col.defaultValue).toBe('CURRENT_TIMESTAMP');
    expect(col.comment).toBe('Record creation time');
  });

  it('returns generated columnId', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = addColumn(s, 't1', { name: 'col1' });
    expect(result!.columnId).toMatch(/^[a-z0-9]{8}$/);
    expect(result!.schema.tables[0].columns[0].id).toBe(result!.columnId);
  });
});

// ═══════════════════════════════════════════
// updateColumn
// ═══════════════════════════════════════════

describe('updateColumn', () => {
  it('updates column name', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'old')] })];
    const result = updateColumn(s, 't1', 'c1', { name: 'new_name' });
    expect(result.tables[0].columns[0].name).toBe('new_name');
  });

  it('updates column type and length', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'col', { type: 'INT' })] })];
    const result = updateColumn(s, 't1', 'c1', { type: 'VARCHAR', length: 100 });
    expect(result.tables[0].columns[0].type).toBe('VARCHAR');
    expect(result.tables[0].columns[0].length).toBe(100);
  });

  it('PK patch forces nullable=false', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'col', { nullable: true })] })];
    const result = updateColumn(s, 't1', 'c1', { primaryKey: true });
    expect(result.tables[0].columns[0].primaryKey).toBe(true);
    expect(result.tables[0].columns[0].nullable).toBe(false);
  });

  it('does not affect other columns', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'first'), makeCol('c2', 'second')] })];
    const result = updateColumn(s, 't1', 'c1', { name: 'changed' });
    expect(result.tables[0].columns[0].name).toBe('changed');
    expect(result.tables[0].columns[1].name).toBe('second');
  });
});

// ═══════════════════════════════════════════
// deleteColumn
// ═══════════════════════════════════════════

describe('deleteColumn', () => {
  it('removes column from table', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'a'), makeCol('c2', 'b')] })];
    const result = deleteColumn(s, 't1', 'c1');
    expect(result.tables[0].columns).toHaveLength(1);
    expect(result.tables[0].columns[0].id).toBe('c2');
  });

  it('removes FKs that reference the deleted column (same table)', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [makeCol('c1', 'user_id')],
      foreignKeys: [{ id: 'fk1', columnIds: ['c1'], referencedTableId: 'users', referencedColumnIds: ['uid'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' }],
    })];
    const result = deleteColumn(s, 't1', 'c1');
    expect(result.tables[0].foreignKeys).toHaveLength(0);
  });

  it('removes FKs from other tables referencing the deleted column', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('users', { columns: [makeCol('uid', 'id')] }),
      makeTable('orders', {
        columns: [makeCol('oid', 'id'), makeCol('user_id', 'user_id')],
        foreignKeys: [{ id: 'fk1', columnIds: ['user_id'], referencedTableId: 'users', referencedColumnIds: ['uid'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' }],
      }),
    ];
    const result = deleteColumn(s, 'users', 'uid');
    expect(result.tables[1].foreignKeys).toHaveLength(0);
  });

  it('removes uniqueKeys that include the deleted column', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [makeCol('c1', 'a'), makeCol('c2', 'b')],
      uniqueKeys: [{ id: 'uk1', columnIds: ['c1'] }, { id: 'uk2', columnIds: ['c2'] }],
    })];
    const result = deleteColumn(s, 't1', 'c1');
    expect(result.tables[0].uniqueKeys).toHaveLength(1);
    expect(result.tables[0].uniqueKeys![0].id).toBe('uk2');
  });
});

// ═══════════════════════════════════════════
// addForeignKey
// ═══════════════════════════════════════════

describe('addForeignKey', () => {
  it('adds FK to table', () => {
    const s = emptySchema();
    s.tables = [makeTable('users'), makeTable('orders')];
    const result = addForeignKey(s, 'orders', {
      columnIds: ['user_id'],
      referencedTableId: 'users',
      referencedColumnIds: ['id'],
    });
    expect(result).not.toBeNull();
    expect(result!.schema.tables[1].foreignKeys).toHaveLength(1);
    expect(result!.fkId).toMatch(/^[a-z0-9]{8}$/);
  });

  it('defaults onDelete and onUpdate to RESTRICT', () => {
    const s = emptySchema();
    s.tables = [makeTable('users'), makeTable('orders')];
    const result = addForeignKey(s, 'orders', {
      columnIds: ['user_id'],
      referencedTableId: 'users',
      referencedColumnIds: ['id'],
    });
    const fk = result!.schema.tables[1].foreignKeys[0];
    expect(fk.onDelete).toBe('RESTRICT');
    expect(fk.onUpdate).toBe('RESTRICT');
  });

  it('uses custom referential actions', () => {
    const s = emptySchema();
    s.tables = [makeTable('users'), makeTable('orders')];
    const result = addForeignKey(s, 'orders', {
      columnIds: ['user_id'],
      referencedTableId: 'users',
      referencedColumnIds: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'SET NULL',
    });
    const fk = result!.schema.tables[1].foreignKeys[0];
    expect(fk.onDelete).toBe('CASCADE');
    expect(fk.onUpdate).toBe('SET NULL');
  });

  it('returns null if source table not found', () => {
    const s = emptySchema();
    s.tables = [makeTable('users')];
    const result = addForeignKey(s, 'nonexistent', {
      columnIds: ['user_id'],
      referencedTableId: 'users',
      referencedColumnIds: ['id'],
    });
    expect(result).toBeNull();
  });

  it('returns null if referenced table not found', () => {
    const s = emptySchema();
    s.tables = [makeTable('orders')];
    const result = addForeignKey(s, 'orders', {
      columnIds: ['user_id'],
      referencedTableId: 'nonexistent',
      referencedColumnIds: ['id'],
    });
    expect(result).toBeNull();
  });

  it('supports composite FK (multiple columns)', () => {
    const s = emptySchema();
    s.tables = [makeTable('parent'), makeTable('child')];
    const result = addForeignKey(s, 'child', {
      columnIds: ['a', 'b'],
      referencedTableId: 'parent',
      referencedColumnIds: ['x', 'y'],
    });
    expect(result!.schema.tables[1].foreignKeys[0].columnIds).toEqual(['a', 'b']);
    expect(result!.schema.tables[1].foreignKeys[0].referencedColumnIds).toEqual(['x', 'y']);
  });
});

// ═══════════════════════════════════════════
// deleteForeignKey
// ═══════════════════════════════════════════

describe('deleteForeignKey', () => {
  it('removes FK from table', () => {
    const fk: ForeignKey = { id: 'fk1', columnIds: ['c1'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' };
    const s = emptySchema();
    s.tables = [makeTable('users'), makeTable('orders', { foreignKeys: [fk] })];
    const result = deleteForeignKey(s, 'orders', 'fk1');
    expect(result.tables[1].foreignKeys).toHaveLength(0);
  });

  it('does not affect other FKs', () => {
    const fk1: ForeignKey = { id: 'fk1', columnIds: ['c1'], referencedTableId: 'a', referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' };
    const fk2: ForeignKey = { id: 'fk2', columnIds: ['c2'], referencedTableId: 'b', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' };
    const s = emptySchema();
    s.tables = [makeTable('a'), makeTable('b'), makeTable('t', { foreignKeys: [fk1, fk2] })];
    const result = deleteForeignKey(s, 't', 'fk1');
    expect(result.tables[2].foreignKeys).toHaveLength(1);
    expect(result.tables[2].foreignKeys[0].id).toBe('fk2');
  });
});

// ═══════════════════════════════════════════
// addMemo
// ═══════════════════════════════════════════

describe('addMemo', () => {
  it('adds memo to schema', () => {
    const { schema, memoId } = addMemo(emptySchema(), { content: 'Hello' });
    expect(schema.memos).toHaveLength(1);
    expect(schema.memos[0].content).toBe('Hello');
    expect(memoId).toBe(schema.memos[0].id);
  });

  it('defaults to empty content', () => {
    const { schema } = addMemo(emptySchema());
    expect(schema.memos[0].content).toBe('');
  });

  it('uses custom position and dimensions', () => {
    const { schema } = addMemo(emptySchema(), { x: 100, y: 200, width: 300, height: 250 });
    const m = schema.memos[0];
    expect(m.position).toEqual({ x: 100, y: 200 });
    expect(m.width).toBe(300);
    expect(m.height).toBe(250);
  });

  it('defaults width=200, height=150', () => {
    const { schema } = addMemo(emptySchema());
    expect(schema.memos[0].width).toBe(200);
    expect(schema.memos[0].height).toBe(150);
  });

  it('applies color and schema namespace', () => {
    const { schema } = addMemo(emptySchema(), { color: '#FFE082', schema: 'public' });
    expect(schema.memos[0].color).toBe('#FFE082');
    expect(schema.memos[0].schema).toBe('public');
  });

  it('preserves existing memos', () => {
    const s = emptySchema();
    s.memos = [{ id: 'existing', content: 'Old', position: { x: 0, y: 0 }, width: 100, height: 100 }];
    const { schema } = addMemo(s, { content: 'New' });
    expect(schema.memos).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// updateMemo
// ═══════════════════════════════════════════

describe('updateMemo', () => {
  const baseMemo: Memo = { id: 'm1', content: 'Old', position: { x: 10, y: 20 }, width: 200, height: 150, color: '#FFF' };

  it('updates content', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { content: 'New content' });
    expect(result.memos[0].content).toBe('New content');
  });

  it('updates position', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { x: 500, y: 600 });
    expect(result.memos[0].position).toEqual({ x: 500, y: 600 });
  });

  it('updates only x, keeps y', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { x: 999 });
    expect(result.memos[0].position).toEqual({ x: 999, y: 20 });
  });

  it('updates dimensions', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { width: 400, height: 300 });
    expect(result.memos[0].width).toBe(400);
    expect(result.memos[0].height).toBe(300);
  });

  it('clears color with empty string', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { color: '' });
    expect(result.memos[0].color).toBeUndefined();
  });

  it('sets locked', () => {
    const s = emptySchema();
    s.memos = [baseMemo];
    const result = updateMemo(s, 'm1', { locked: true });
    expect(result.memos[0].locked).toBe(true);
  });

  it('clears locked with false', () => {
    const s = emptySchema();
    s.memos = [{ ...baseMemo, locked: true }];
    const result = updateMemo(s, 'm1', { locked: false });
    expect(result.memos[0].locked).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// deleteMemo
// ═══════════════════════════════════════════

describe('deleteMemo', () => {
  it('removes memo', () => {
    const s = emptySchema();
    s.memos = [
      { id: 'm1', content: 'A', position: { x: 0, y: 0 }, width: 100, height: 100 },
      { id: 'm2', content: 'B', position: { x: 0, y: 0 }, width: 100, height: 100 },
    ];
    const result = deleteMemo(s, 'm1');
    expect(result.memos).toHaveLength(1);
    expect(result.memos[0].id).toBe('m2');
  });

  it('deleting non-existent memo is a no-op', () => {
    const s = emptySchema();
    s.memos = [{ id: 'm1', content: 'A', position: { x: 0, y: 0 }, width: 100, height: 100 }];
    const result = deleteMemo(s, 'nonexistent');
    expect(result.memos).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// addDomain
// ═══════════════════════════════════════════

describe('addDomain', () => {
  it('adds domain to schema', () => {
    const { schema, domainId } = addDomain(emptySchema(), {
      name: 'email',
      type: 'VARCHAR',
      length: 255,
      nullable: false,
      primaryKey: false,
      unique: true,
      autoIncrement: false,
    });
    expect(schema.domains).toHaveLength(1);
    expect(schema.domains[0].name).toBe('email');
    expect(schema.domains[0].type).toBe('VARCHAR');
    expect(schema.domains[0].unique).toBe(true);
    expect(domainId).toMatch(/^[a-z0-9]{8}$/);
  });

  it('supports hierarchy (parentId)', () => {
    const s = emptySchema();
    s.domains = [{ id: 'parent', name: 'base', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false }];
    const { schema } = addDomain(s, {
      name: 'child',
      type: 'VARCHAR',
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
      parentId: 'parent',
    });
    expect(schema.domains).toHaveLength(2);
    expect(schema.domains[1].parentId).toBe('parent');
  });

  it('supports documentation fields', () => {
    const { schema } = addDomain(emptySchema(), {
      name: 'email',
      type: 'VARCHAR',
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
      description: 'Email address',
      alias: 'e-mail',
      tags: ['contact', 'pii'],
    });
    expect(schema.domains[0].description).toBe('Email address');
    expect(schema.domains[0].alias).toBe('e-mail');
    expect(schema.domains[0].tags).toEqual(['contact', 'pii']);
  });
});

// ═══════════════════════════════════════════
// deleteDomain
// ═══════════════════════════════════════════

describe('deleteDomain', () => {
  it('removes domain', () => {
    const s = emptySchema();
    s.domains = [
      { id: 'd1', name: 'a', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { id: 'd2', name: 'b', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
    ];
    const result = deleteDomain(s, 'd1');
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].id).toBe('d2');
  });

  it('clears domainId from columns referencing deleted domain', () => {
    const s = emptySchema();
    s.domains = [{ id: 'd1', name: 'email', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false }];
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'email', { domainId: 'd1' })] })];
    const result = deleteDomain(s, 'd1');
    expect(result.tables[0].columns[0].domainId).toBeUndefined();
  });

  it('re-parents children of deleted domain to its parent', () => {
    const s = emptySchema();
    s.domains = [
      { id: 'grandparent', name: 'gp', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { id: 'parent', name: 'p', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false, parentId: 'grandparent' },
      { id: 'child', name: 'c', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false, parentId: 'parent' },
    ];
    const result = deleteDomain(s, 'parent');
    expect(result.domains).toHaveLength(2);
    const child = result.domains.find(d => d.id === 'child')!;
    expect(child.parentId).toBe('grandparent');
  });

  it('re-parents children to undefined if deleted domain has no parent', () => {
    const s = emptySchema();
    s.domains = [
      { id: 'parent', name: 'p', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { id: 'child', name: 'c', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false, parentId: 'parent' },
    ];
    const result = deleteDomain(s, 'parent');
    expect(result.domains[0].parentId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// suggestDomains
// ═══════════════════════════════════════════

describe('suggestDomains', () => {
  it('returns empty for schema with no duplicate patterns', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'unique_col')] })];
    expect(suggestDomains(s)).toEqual([]);
  });

  it('suggests domain for columns with same name/type appearing 2+ times', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('users', { columns: [makeCol('c1', 'email', { type: 'VARCHAR', length: 255 })] }),
      makeTable('contacts', { columns: [makeCol('c2', 'email', { type: 'VARCHAR', length: 255 })] }),
    ];
    const suggestions = suggestDomains(s);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedName).toBe('email');
    expect(suggestions[0].type).toBe('VARCHAR');
    expect(suggestions[0].length).toBe(255);
    expect(suggestions[0].columns).toHaveLength(2);
  });

  it('does not suggest for columns already linked to a domain', () => {
    const s = emptySchema();
    s.domains = [{ id: 'd1', name: 'email', type: 'VARCHAR', length: 255, nullable: true, primaryKey: false, unique: false, autoIncrement: false }];
    s.tables = [
      makeTable('users', { columns: [makeCol('c1', 'email', { type: 'VARCHAR', length: 255, domainId: 'd1' })] }),
      makeTable('contacts', { columns: [makeCol('c2', 'email', { type: 'VARCHAR', length: 255, domainId: 'd1' })] }),
    ];
    const suggestions = suggestDomains(s);
    expect(suggestions).toEqual([]);
  });

  it('sorts suggestions by column count descending', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'name', { type: 'VARCHAR', length: 100 }), makeCol('c2', 'status', { type: 'VARCHAR', length: 20 })] }),
      makeTable('t2', { columns: [makeCol('c3', 'name', { type: 'VARCHAR', length: 100 }), makeCol('c4', 'status', { type: 'VARCHAR', length: 20 })] }),
      makeTable('t3', { columns: [makeCol('c5', 'name', { type: 'VARCHAR', length: 100 })] }),
    ];
    const suggestions = suggestDomains(s);
    expect(suggestions[0].suggestedName).toBe('name');
    expect(suggestions[0].columns).toHaveLength(3);
    expect(suggestions[1].suggestedName).toBe('status');
    expect(suggestions[1].columns).toHaveLength(2);
  });

  it('only groups columns with matching type AND length', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'code', { type: 'VARCHAR', length: 10 })] }),
      makeTable('t2', { columns: [makeCol('c2', 'code', { type: 'VARCHAR', length: 50 })] }),
    ];
    const suggestions = suggestDomains(s);
    // Different lengths → no suggestion
    expect(suggestions).toEqual([]);
  });

  it('returns empty for empty schema', () => {
    expect(suggestDomains(emptySchema())).toEqual([]);
  });
});

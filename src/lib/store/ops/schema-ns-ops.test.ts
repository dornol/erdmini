import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ERDSchema, Table, Memo } from '$lib/types/erd';
import {
  addSchemaOp,
  renameSchemaOp,
  reorderSchemasOp,
  deleteSchemaOp,
  updateTableSchemaOp
} from '$lib/store/ops/schema-ns-ops';

vi.mock('$lib/utils/common', () => ({
  now: () => '2024-06-01T00:00:00.000Z'
}));

function makeTable(overrides?: Partial<Table>): Table {
  return {
    id: 't1',
    name: 'test_table',
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides
  } as Table;
}

function makeMemo(overrides?: Partial<Memo>): Memo {
  return {
    id: 'm1',
    content: '',
    position: { x: 0, y: 0 },
    width: 200,
    height: 150,
    ...overrides
  } as Memo;
}

function makeSchema(overrides?: Partial<ERDSchema>): ERDSchema {
  return {
    version: '1.0',
    tables: [],
    domains: [],
    memos: [],
    groupColors: {},
    schemas: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides
  };
}

describe('addSchemaOp', () => {
  it('adds a schema name to the schemas array', () => {
    const s = makeSchema();
    const result = addSchemaOp(s, 'public');
    expect(result).toBe(true);
    expect(s.schemas).toEqual(['public']);
  });

  it('returns true on success', () => {
    const s = makeSchema();
    expect(addSchemaOp(s, 'auth')).toBe(true);
  });

  it('initializes schemas array if undefined', () => {
    const s = makeSchema({ schemas: undefined });
    const result = addSchemaOp(s, 'core');
    expect(result).toBe(true);
    expect(s.schemas).toEqual(['core']);
  });

  it('returns false for duplicate schema name', () => {
    const s = makeSchema({ schemas: ['public'] });
    const result = addSchemaOp(s, 'public');
    expect(result).toBe(false);
    expect(s.schemas).toEqual(['public']);
  });

  it('updates updatedAt on success', () => {
    const s = makeSchema();
    addSchemaOp(s, 'new_schema');
    expect(s.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('does not update updatedAt on duplicate', () => {
    const s = makeSchema({ schemas: ['dup'] });
    addSchemaOp(s, 'dup');
    expect(s.updatedAt).toBe('2024-01-01');
  });

  it('can add multiple schemas sequentially', () => {
    const s = makeSchema();
    addSchemaOp(s, 'a');
    addSchemaOp(s, 'b');
    addSchemaOp(s, 'c');
    expect(s.schemas).toEqual(['a', 'b', 'c']);
  });
});

describe('renameSchemaOp', () => {
  it('renames a schema in the schemas array', () => {
    const s = makeSchema({ schemas: ['old'] });
    const result = renameSchemaOp(s, 'old', 'new');
    expect(result).toBe(true);
    expect(s.schemas).toEqual(['new']);
  });

  it('updates table.schema references', () => {
    const t = makeTable({ schema: 'old' });
    const s = makeSchema({ schemas: ['old'], tables: [t] });
    renameSchemaOp(s, 'old', 'new');
    expect(t.schema).toBe('new');
  });

  it('does not change tables with different schema', () => {
    const t = makeTable({ schema: 'other' });
    const s = makeSchema({ schemas: ['old', 'other'], tables: [t] });
    renameSchemaOp(s, 'old', 'new');
    expect(t.schema).toBe('other');
  });

  it('updates memo.schema references', () => {
    const mm = makeMemo({ schema: 'old' });
    const s = makeSchema({ schemas: ['old'], memos: [mm] });
    renameSchemaOp(s, 'old', 'new');
    expect(mm.schema).toBe('new');
  });

  it('does not change memos with different schema', () => {
    const mm = makeMemo({ schema: 'other' });
    const s = makeSchema({ schemas: ['old', 'other'], memos: [mm] });
    renameSchemaOp(s, 'old', 'new');
    expect(mm.schema).toBe('other');
  });

  it('returns false when newName is empty', () => {
    const s = makeSchema({ schemas: ['a'] });
    expect(renameSchemaOp(s, 'a', '')).toBe(false);
  });

  it('returns false when oldName equals newName', () => {
    const s = makeSchema({ schemas: ['same'] });
    expect(renameSchemaOp(s, 'same', 'same')).toBe(false);
  });

  it('returns false when newName already exists', () => {
    const s = makeSchema({ schemas: ['a', 'b'] });
    expect(renameSchemaOp(s, 'a', 'b')).toBe(false);
    expect(s.schemas).toEqual(['a', 'b']);
  });

  it('updates updatedAt on success', () => {
    const s = makeSchema({ schemas: ['x'] });
    renameSchemaOp(s, 'x', 'y');
    expect(s.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('does not update updatedAt on failure', () => {
    const s = makeSchema({ schemas: ['a'] });
    renameSchemaOp(s, 'a', 'a');
    expect(s.updatedAt).toBe('2024-01-01');
  });

  it('preserves position of renamed schema in array', () => {
    const s = makeSchema({ schemas: ['first', 'middle', 'last'] });
    renameSchemaOp(s, 'middle', 'center');
    expect(s.schemas).toEqual(['first', 'center', 'last']);
  });

  it('updates multiple tables and memos with the same schema', () => {
    const t1 = makeTable({ id: 't1', schema: 'old' });
    const t2 = makeTable({ id: 't2', schema: 'old' });
    const m1 = makeMemo({ id: 'm1', schema: 'old' });
    const m2 = makeMemo({ id: 'm2', schema: 'old' });
    const s = makeSchema({ schemas: ['old'], tables: [t1, t2], memos: [m1, m2] });
    renameSchemaOp(s, 'old', 'new');
    expect(t1.schema).toBe('new');
    expect(t2.schema).toBe('new');
    expect(m1.schema).toBe('new');
    expect(m2.schema).toBe('new');
  });
});

describe('reorderSchemasOp', () => {
  it('replaces the schemas array', () => {
    const s = makeSchema({ schemas: ['a', 'b', 'c'] });
    reorderSchemasOp(s, ['c', 'a', 'b']);
    expect(s.schemas).toEqual(['c', 'a', 'b']);
  });

  it('updates updatedAt', () => {
    const s = makeSchema({ schemas: ['x'] });
    reorderSchemasOp(s, ['x']);
    expect(s.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('can set to empty array', () => {
    const s = makeSchema({ schemas: ['a', 'b'] });
    reorderSchemasOp(s, []);
    expect(s.schemas).toEqual([]);
  });
});

describe('deleteSchemaOp', () => {
  it('removes schema from schemas array', () => {
    const s = makeSchema({ schemas: ['a', 'b', 'c'] });
    deleteSchemaOp(s, 'b');
    expect(s.schemas).toEqual(['a', 'c']);
  });

  it('clears schema property from tables with that schema', () => {
    const t = makeTable({ schema: 'doomed' });
    const s = makeSchema({ schemas: ['doomed'], tables: [t] });
    deleteSchemaOp(s, 'doomed');
    expect(t.schema).toBeUndefined();
  });

  it('clears schema property from memos with that schema', () => {
    const mm = makeMemo({ schema: 'doomed' });
    const s = makeSchema({ schemas: ['doomed'], memos: [mm] });
    deleteSchemaOp(s, 'doomed');
    expect(mm.schema).toBeUndefined();
  });

  it('does not affect tables/memos with different schema', () => {
    const t = makeTable({ schema: 'keep' });
    const mm = makeMemo({ schema: 'keep' });
    const s = makeSchema({ schemas: ['remove', 'keep'], tables: [t], memos: [mm] });
    deleteSchemaOp(s, 'remove');
    expect(t.schema).toBe('keep');
    expect(mm.schema).toBe('keep');
  });

  it('updates updatedAt', () => {
    const s = makeSchema({ schemas: ['a'] });
    deleteSchemaOp(s, 'a');
    expect(s.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('handles deleting non-existent schema gracefully', () => {
    const s = makeSchema({ schemas: ['a'] });
    deleteSchemaOp(s, 'nonexistent');
    expect(s.schemas).toEqual(['a']);
  });

  it('clears schema from multiple tables and memos', () => {
    const t1 = makeTable({ id: 't1', schema: 'x' });
    const t2 = makeTable({ id: 't2', schema: 'x' });
    const m1 = makeMemo({ id: 'm1', schema: 'x' });
    const s = makeSchema({ schemas: ['x'], tables: [t1, t2], memos: [m1] });
    deleteSchemaOp(s, 'x');
    expect(t1.schema).toBeUndefined();
    expect(t2.schema).toBeUndefined();
    expect(m1.schema).toBeUndefined();
  });
});

describe('updateTableSchemaOp', () => {
  it('sets schema on a table', () => {
    const t = makeTable({ id: 't1' });
    const s = makeSchema({ tables: [t] });
    updateTableSchemaOp(s, 't1', 'public');
    expect(t.schema).toBe('public');
  });

  it('clears schema when undefined is passed', () => {
    const t = makeTable({ id: 't1', schema: 'old' });
    const s = makeSchema({ tables: [t] });
    updateTableSchemaOp(s, 't1', undefined);
    expect(t.schema).toBeUndefined();
  });

  it('no-op for nonexistent table', () => {
    const s = makeSchema();
    updateTableSchemaOp(s, 'nonexistent', 'public');
    // should not throw, updatedAt unchanged
    expect(s.updatedAt).toBe('2024-01-01');
  });

  it('updates updatedAt on success', () => {
    const t = makeTable({ id: 't1' });
    const s = makeSchema({ tables: [t] });
    updateTableSchemaOp(s, 't1', 'new');
    expect(s.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('replaces existing schema with new one', () => {
    const t = makeTable({ id: 't1', schema: 'old' });
    const s = makeSchema({ tables: [t] });
    updateTableSchemaOp(s, 't1', 'new');
    expect(t.schema).toBe('new');
  });

  it('does not affect other tables', () => {
    const t1 = makeTable({ id: 't1', schema: 'a' });
    const t2 = makeTable({ id: 't2', schema: 'b' });
    const s = makeSchema({ tables: [t1, t2] });
    updateTableSchemaOp(s, 't1', 'c');
    expect(t1.schema).toBe('c');
    expect(t2.schema).toBe('b');
  });

  it('clears schema when empty string is passed', () => {
    const t = makeTable({ id: 't1', schema: 'old' });
    const s = makeSchema({ tables: [t] });
    updateTableSchemaOp(s, 't1', '');
    // empty string is falsy, so schema should be deleted
    expect(t.schema).toBeUndefined();
  });
});

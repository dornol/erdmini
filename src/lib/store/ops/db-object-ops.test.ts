import { describe, it, expect, beforeEach } from 'vitest';
import type { ERDSchema } from '$lib/types/erd';
import {
  addDbObjectOp,
  updateDbObjectOp,
  deleteDbObjectOp,
  addDbObjectCategoryOp,
  renameDbObjectCategoryOp,
  deleteDbObjectCategoryOp,
} from './db-object-ops';

function makeSchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    dbObjects: [],
    dbObjectCategories: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

describe('addDbObjectOp', () => {
  it('adds object to schema', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure', 'get_users');
    expect(s.dbObjects).toHaveLength(1);
    expect(obj.name).toBe('get_users');
    expect(obj.category).toBe('Procedure');
    expect(obj.sql).toBe('');
    expect(obj.id).toHaveLength(8);
  });

  it('auto-creates category if not exists', () => {
    const s = makeSchema();
    addDbObjectOp(s, 'Function');
    expect(s.dbObjectCategories).toContain('Function');
  });

  it('does not duplicate category', () => {
    const s = makeSchema();
    addDbObjectOp(s, 'View');
    addDbObjectOp(s, 'View');
    expect(s.dbObjectCategories!.filter((c) => c === 'View')).toHaveLength(1);
  });

  it('generates default name when not provided', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Trigger');
    expect(obj.name).toBe('new_trigger');
  });

  it('initializes arrays if missing', () => {
    const s = makeSchema();
    delete (s as any).dbObjects;
    delete (s as any).dbObjectCategories;
    addDbObjectOp(s, 'Procedure');
    expect(s.dbObjects).toHaveLength(1);
    expect(s.dbObjectCategories).toContain('Procedure');
  });
});

describe('updateDbObjectOp', () => {
  it('updates name', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure', 'old_name');
    updateDbObjectOp(s, obj.id, { name: 'new_name' });
    expect(s.dbObjects![0].name).toBe('new_name');
  });

  it('updates sql', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    updateDbObjectOp(s, obj.id, { sql: 'SELECT 1' });
    expect(s.dbObjects![0].sql).toBe('SELECT 1');
  });

  it('updates includeInDdl', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'View');
    updateDbObjectOp(s, obj.id, { includeInDdl: true });
    expect(s.dbObjects![0].includeInDdl).toBe(true);
  });

  it('updates category', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'Function');
    const obj = addDbObjectOp(s, 'Procedure');
    updateDbObjectOp(s, obj.id, { category: 'Function' });
    expect(s.dbObjects![0].category).toBe('Function');
  });

  it('updates comment', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    updateDbObjectOp(s, obj.id, { comment: 'test comment' });
    expect(s.dbObjects![0].comment).toBe('test comment');
  });

  it('updates schema namespace', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    updateDbObjectOp(s, obj.id, { schema: 'public' });
    expect(s.dbObjects![0].schema).toBe('public');
  });

  it('returns false for non-existent object', () => {
    const s = makeSchema();
    expect(updateDbObjectOp(s, 'nonexistent', { name: 'test' })).toBe(false);
  });

  it('returns false when dbObjects is missing', () => {
    const s = makeSchema();
    delete (s as any).dbObjects;
    expect(updateDbObjectOp(s, 'x', { name: 'y' })).toBe(false);
  });
});

describe('deleteDbObjectOp', () => {
  it('deletes object', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    expect(deleteDbObjectOp(s, obj.id)).toBe(true);
    expect(s.dbObjects).toHaveLength(0);
  });

  it('returns false for non-existent object', () => {
    const s = makeSchema();
    expect(deleteDbObjectOp(s, 'nonexistent')).toBe(false);
  });

  it('does not remove other objects', () => {
    const s = makeSchema();
    const a = addDbObjectOp(s, 'Procedure', 'a');
    addDbObjectOp(s, 'Procedure', 'b');
    deleteDbObjectOp(s, a.id);
    expect(s.dbObjects).toHaveLength(1);
    expect(s.dbObjects![0].name).toBe('b');
  });
});

describe('addDbObjectCategoryOp', () => {
  it('adds category', () => {
    const s = makeSchema();
    expect(addDbObjectCategoryOp(s, 'View')).toBe(true);
    expect(s.dbObjectCategories).toContain('View');
  });

  it('returns false for duplicate', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'View');
    expect(addDbObjectCategoryOp(s, 'View')).toBe(false);
  });

  it('initializes array if missing', () => {
    const s = makeSchema();
    delete (s as any).dbObjectCategories;
    addDbObjectCategoryOp(s, 'Function');
    expect(s.dbObjectCategories).toEqual(['Function']);
  });
});

describe('renameDbObjectCategoryOp', () => {
  it('renames category and updates objects', () => {
    const s = makeSchema();
    addDbObjectOp(s, 'Proc', 'fn1');
    addDbObjectOp(s, 'Proc', 'fn2');
    expect(renameDbObjectCategoryOp(s, 'Proc', 'Procedure')).toBe(true);
    expect(s.dbObjectCategories).toContain('Procedure');
    expect(s.dbObjectCategories).not.toContain('Proc');
    expect(s.dbObjects!.every((o) => o.category === 'Procedure')).toBe(true);
  });

  it('returns false if old name not found', () => {
    const s = makeSchema();
    expect(renameDbObjectCategoryOp(s, 'nope', 'test')).toBe(false);
  });

  it('returns false if new name already exists', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'A');
    addDbObjectCategoryOp(s, 'B');
    expect(renameDbObjectCategoryOp(s, 'A', 'B')).toBe(false);
  });

  it('does not rename objects of other categories', () => {
    const s = makeSchema();
    addDbObjectOp(s, 'Proc', 'fn1');
    addDbObjectOp(s, 'View', 'v1');
    renameDbObjectCategoryOp(s, 'Proc', 'Procedure');
    expect(s.dbObjects!.find((o) => o.name === 'v1')?.category).toBe('View');
  });
});

describe('deleteDbObjectCategoryOp', () => {
  it('deletes category and its objects', () => {
    const s = makeSchema();
    addDbObjectOp(s, 'Proc', 'fn1');
    addDbObjectOp(s, 'View', 'v1');
    expect(deleteDbObjectCategoryOp(s, 'Proc')).toBe(true);
    expect(s.dbObjectCategories).not.toContain('Proc');
    expect(s.dbObjects).toHaveLength(1);
    expect(s.dbObjects![0].name).toBe('v1');
  });

  it('returns false if category not found', () => {
    const s = makeSchema();
    expect(deleteDbObjectCategoryOp(s, 'nope')).toBe(false);
  });

  it('preserves other categories', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'A');
    addDbObjectCategoryOp(s, 'B');
    deleteDbObjectCategoryOp(s, 'A');
    expect(s.dbObjectCategories).toEqual(['B']);
  });
});

describe('updatedAt tracking', () => {
  it('updates timestamp on add', () => {
    const s = makeSchema();
    const before = s.updatedAt;
    addDbObjectOp(s, 'Procedure');
    expect(s.updatedAt).not.toBe(before);
  });

  it('updates timestamp on update', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    const before = s.updatedAt;
    // Force a different time
    s.updatedAt = '2020-01-01';
    updateDbObjectOp(s, obj.id, { name: 'changed' });
    expect(s.updatedAt).not.toBe('2020-01-01');
  });

  it('updates timestamp on delete', () => {
    const s = makeSchema();
    const obj = addDbObjectOp(s, 'Procedure');
    s.updatedAt = '2020-01-01';
    deleteDbObjectOp(s, obj.id);
    expect(s.updatedAt).not.toBe('2020-01-01');
  });

  it('updates timestamp on category add', () => {
    const s = makeSchema();
    s.updatedAt = '2020-01-01';
    addDbObjectCategoryOp(s, 'View');
    expect(s.updatedAt).not.toBe('2020-01-01');
  });

  it('updates timestamp on category rename', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'A');
    s.updatedAt = '2020-01-01';
    renameDbObjectCategoryOp(s, 'A', 'B');
    expect(s.updatedAt).not.toBe('2020-01-01');
  });

  it('updates timestamp on category delete', () => {
    const s = makeSchema();
    addDbObjectCategoryOp(s, 'A');
    s.updatedAt = '2020-01-01';
    deleteDbObjectCategoryOp(s, 'A');
    expect(s.updatedAt).not.toBe('2020-01-01');
  });
});

import { describe, it, expect } from 'vitest';
import type { ERDSchema, Table, Column, ForeignKey } from '$lib/types/erd';
import {
  addForeignKeyOp,
  updateForeignKeyOp,
  updateFkLabelOp,
  deleteForeignKeyOp,
  addUniqueKeyOp,
  deleteUniqueKeyOp,
  addIndexOp,
  deleteIndexOp,
} from '$lib/store/ops/fk-ops';

function makeSchema(tables: Table[] = []): ERDSchema {
  return {
    version: '1.0',
    tables,
    domains: [],
    memos: [],
    groupColors: {},
    schemas: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeTable(id: string, columns: Column[], fks: ForeignKey[] = []): Table {
  return {
    id,
    name: `t_${id}`,
    columns,
    foreignKeys: fks,
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
  };
}

function makeCol(id: string, name: string): Column {
  return {
    id,
    name,
    type: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
  };
}

describe('addForeignKeyOp', () => {
  it('creates FK with default RESTRICT actions', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'user_id')]);
    const t2 = makeTable('t2', [makeCol('c2', 'id')]);
    const schema = makeSchema([t1, t2]);

    const fk = addForeignKeyOp(schema, 't1', ['c1'], 't2', ['c2']);

    expect(fk).toBeDefined();
    expect(fk!.columnIds).toEqual(['c1']);
    expect(fk!.referencedTableId).toBe('t2');
    expect(fk!.referencedColumnIds).toEqual(['c2']);
    expect(fk!.onDelete).toBe('RESTRICT');
    expect(fk!.onUpdate).toBe('RESTRICT');
    expect(fk!.id).toBeTruthy();
    expect(t1.foreignKeys).toHaveLength(1);
    expect(t1.foreignKeys[0]).toBe(fk);
  });

  it('creates FK with custom CASCADE actions', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'user_id')]);
    const t2 = makeTable('t2', [makeCol('c2', 'id')]);
    const schema = makeSchema([t1, t2]);

    const fk = addForeignKeyOp(schema, 't1', ['c1'], 't2', ['c2'], 'CASCADE', 'CASCADE');

    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe('CASCADE');
    expect(fk!.onUpdate).toBe('CASCADE');
  });

  it('updates updatedAt', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'col')]);
    const t2 = makeTable('t2', [makeCol('c2', 'id')]);
    const schema = makeSchema([t1, t2]);
    const before = schema.updatedAt;

    addForeignKeyOp(schema, 't1', ['c1'], 't2', ['c2']);

    expect(schema.updatedAt).not.toBe(before);
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);

    const result = addForeignKeyOp(schema, 'missing', ['c1'], 't2', ['c2']);

    expect(result).toBeUndefined();
  });

  it('appends to existing foreign keys', () => {
    const existingFk: ForeignKey = {
      id: 'fk0',
      columnIds: ['c0'],
      referencedTableId: 'tX',
      referencedColumnIds: ['cX'],
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'col')], [existingFk]);
    const t2 = makeTable('t2', [makeCol('c2', 'id')]);
    const schema = makeSchema([t1, t2]);

    addForeignKeyOp(schema, 't1', ['c1'], 't2', ['c2']);

    expect(t1.foreignKeys).toHaveLength(2);
    expect(t1.foreignKeys[0].id).toBe('fk0');
  });

  it('supports composite foreign keys', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a'), makeCol('c2', 'b')]);
    const t2 = makeTable('t2', [makeCol('c3', 'x'), makeCol('c4', 'y')]);
    const schema = makeSchema([t1, t2]);

    const fk = addForeignKeyOp(schema, 't1', ['c1', 'c2'], 't2', ['c3', 'c4']);

    expect(fk!.columnIds).toEqual(['c1', 'c2']);
    expect(fk!.referencedColumnIds).toEqual(['c3', 'c4']);
  });
});

describe('updateForeignKeyOp', () => {
  it('updates all fields of an existing FK', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 'tOld',
      referencedColumnIds: ['cOld'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a'), makeCol('c2', 'b')], [fk]);
    const schema = makeSchema([t1]);

    updateForeignKeyOp(schema, 't1', 'fk1', ['c2'], 'tNew', ['cNew'], 'CASCADE', 'SET NULL');

    expect(fk.columnIds).toEqual(['c2']);
    expect(fk.referencedTableId).toBe('tNew');
    expect(fk.referencedColumnIds).toEqual(['cNew']);
    expect(fk.onDelete).toBe('CASCADE');
    expect(fk.onUpdate).toBe('SET NULL');
  });

  it('updates updatedAt', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    updateForeignKeyOp(schema, 't1', 'fk1', ['c1'], 't2', ['c2'], 'CASCADE', 'CASCADE');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    updateForeignKeyOp(schema, 'missing', 'fk1', ['c1'], 't2', ['c2']);

    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent FK', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    updateForeignKeyOp(schema, 't1', 'missing', ['c1'], 't2', ['c2']);

    expect(schema.updatedAt).toBe(before);
  });

  it('defaults to RESTRICT when actions not provided', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);

    updateForeignKeyOp(schema, 't1', 'fk1', ['c1'], 't2', ['c2']);

    expect(fk.onDelete).toBe('RESTRICT');
    expect(fk.onUpdate).toBe('RESTRICT');
  });
});

describe('updateFkLabelOp', () => {
  it('sets label on FK', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);

    updateFkLabelOp(schema, 't1', 'fk1', 'belongs to');

    expect(fk.label).toBe('belongs to');
  });

  it('clears label with empty string (sets undefined)', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
      label: 'old label',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);

    updateFkLabelOp(schema, 't1', 'fk1', '');

    expect(fk.label).toBeUndefined();
  });

  it('updates updatedAt', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    updateFkLabelOp(schema, 't1', 'fk1', 'test');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    updateFkLabelOp(schema, 'missing', 'fk1', 'label');

    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent FK', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    updateFkLabelOp(schema, 't1', 'missing', 'label');

    expect(schema.updatedAt).toBe(before);
  });
});

describe('deleteForeignKeyOp', () => {
  it('removes FK from table', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);

    deleteForeignKeyOp(schema, 't1', 'fk1');

    expect(t1.foreignKeys).toHaveLength(0);
  });

  it('updates updatedAt', () => {
    const fk: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    deleteForeignKeyOp(schema, 't1', 'fk1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    deleteForeignKeyOp(schema, 'missing', 'fk1');

    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent FK (does not throw)', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    expect(() => deleteForeignKeyOp(schema, 't1', 'missing')).not.toThrow();
    // updatedAt still updates because filter runs regardless
  });

  it('only removes the targeted FK', () => {
    const fk1: ForeignKey = {
      id: 'fk1',
      columnIds: ['c1'],
      referencedTableId: 't2',
      referencedColumnIds: ['c2'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    };
    const fk2: ForeignKey = {
      id: 'fk2',
      columnIds: ['c3'],
      referencedTableId: 't3',
      referencedColumnIds: ['c4'],
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    };
    const t1 = makeTable('t1', [makeCol('c1', 'a')], [fk1, fk2]);
    const schema = makeSchema([t1]);

    deleteForeignKeyOp(schema, 't1', 'fk1');

    expect(t1.foreignKeys).toHaveLength(1);
    expect(t1.foreignKeys[0].id).toBe('fk2');
  });
});

describe('addUniqueKeyOp', () => {
  it('creates unique key without name', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'email')]);
    const schema = makeSchema([t1]);

    const uk = addUniqueKeyOp(schema, 't1', ['c1']);

    expect(uk).toBeDefined();
    expect(uk!.columnIds).toEqual(['c1']);
    expect(uk!.name).toBeUndefined();
    expect(uk!.id).toBeTruthy();
    expect(t1.uniqueKeys).toHaveLength(1);
  });

  it('creates unique key with name', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'email')]);
    const schema = makeSchema([t1]);

    const uk = addUniqueKeyOp(schema, 't1', ['c1'], 'uq_email');

    expect(uk!.name).toBe('uq_email');
  });

  it('clears name when empty string provided', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'email')]);
    const schema = makeSchema([t1]);

    const uk = addUniqueKeyOp(schema, 't1', ['c1'], '');

    expect(uk!.name).toBeUndefined();
  });

  it('returns the created unique key', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    const uk = addUniqueKeyOp(schema, 't1', ['c1']);

    expect(t1.uniqueKeys[0]).toBe(uk);
  });

  it('updates updatedAt', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    addUniqueKeyOp(schema, 't1', ['c1']);

    expect(schema.updatedAt).not.toBe(before);
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);

    const result = addUniqueKeyOp(schema, 'missing', ['c1']);

    expect(result).toBeUndefined();
  });

  it('supports composite unique keys', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a'), makeCol('c2', 'b')]);
    const schema = makeSchema([t1]);

    const uk = addUniqueKeyOp(schema, 't1', ['c1', 'c2'], 'uq_composite');

    expect(uk!.columnIds).toEqual(['c1', 'c2']);
  });
});

describe('deleteUniqueKeyOp', () => {
  it('removes unique key from table', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.uniqueKeys = [{ id: 'uk1', columnIds: ['c1'] }];
    const schema = makeSchema([t1]);

    deleteUniqueKeyOp(schema, 't1', 'uk1');

    expect(t1.uniqueKeys).toHaveLength(0);
  });

  it('updates updatedAt', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.uniqueKeys = [{ id: 'uk1', columnIds: ['c1'] }];
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    deleteUniqueKeyOp(schema, 't1', 'uk1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    deleteUniqueKeyOp(schema, 'missing', 'uk1');

    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent UK (does not throw)', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    expect(() => deleteUniqueKeyOp(schema, 't1', 'missing')).not.toThrow();
  });

  it('only removes the targeted unique key', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.uniqueKeys = [
      { id: 'uk1', columnIds: ['c1'] },
      { id: 'uk2', columnIds: ['c2'] },
    ];
    const schema = makeSchema([t1]);

    deleteUniqueKeyOp(schema, 't1', 'uk1');

    expect(t1.uniqueKeys).toHaveLength(1);
    expect(t1.uniqueKeys[0].id).toBe('uk2');
  });
});

describe('addIndexOp', () => {
  it('creates non-unique index without name', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'name')]);
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1'], false);

    expect(idx).toBeDefined();
    expect(idx!.columnIds).toEqual(['c1']);
    expect(idx!.unique).toBe(false);
    expect(idx!.name).toBeUndefined();
    expect(idx!.id).toBeTruthy();
    expect(t1.indexes).toHaveLength(1);
  });

  it('creates unique index with name', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'email')]);
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1'], true, 'idx_email');

    expect(idx!.unique).toBe(true);
    expect(idx!.name).toBe('idx_email');
  });

  it('clears name when empty string provided', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1'], false, '');

    expect(idx!.name).toBeUndefined();
  });

  it('returns the created index', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1'], false);

    expect(t1.indexes![0]).toBe(idx);
  });

  it('updates updatedAt', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    addIndexOp(schema, 't1', ['c1'], false);

    expect(schema.updatedAt).not.toBe(before);
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);

    const result = addIndexOp(schema, 'missing', ['c1'], false);

    expect(result).toBeUndefined();
  });

  it('supports composite index', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a'), makeCol('c2', 'b')]);
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1', 'c2'], true, 'idx_composite');

    expect(idx!.columnIds).toEqual(['c1', 'c2']);
  });

  it('handles table with undefined indexes array', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    // @ts-expect-error simulate missing indexes
    t1.indexes = undefined;
    const schema = makeSchema([t1]);

    const idx = addIndexOp(schema, 't1', ['c1'], false);

    expect(idx).toBeDefined();
    expect(t1.indexes).toHaveLength(1);
  });
});

describe('deleteIndexOp', () => {
  it('removes index from table', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.indexes = [{ id: 'idx1', columnIds: ['c1'], unique: false }];
    const schema = makeSchema([t1]);

    deleteIndexOp(schema, 't1', 'idx1');

    expect(t1.indexes).toHaveLength(0);
  });

  it('updates updatedAt', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.indexes = [{ id: 'idx1', columnIds: ['c1'], unique: false }];
    const schema = makeSchema([t1]);
    const before = schema.updatedAt;

    deleteIndexOp(schema, 't1', 'idx1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    deleteIndexOp(schema, 'missing', 'idx1');

    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent index (does not throw)', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    const schema = makeSchema([t1]);

    expect(() => deleteIndexOp(schema, 't1', 'missing')).not.toThrow();
  });

  it('only removes the targeted index', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    t1.indexes = [
      { id: 'idx1', columnIds: ['c1'], unique: false },
      { id: 'idx2', columnIds: ['c2'], unique: true },
    ];
    const schema = makeSchema([t1]);

    deleteIndexOp(schema, 't1', 'idx1');

    expect(t1.indexes).toHaveLength(1);
    expect(t1.indexes[0].id).toBe('idx2');
  });

  it('handles table with undefined indexes array', () => {
    const t1 = makeTable('t1', [makeCol('c1', 'a')]);
    // @ts-expect-error simulate missing indexes
    t1.indexes = undefined;
    const schema = makeSchema([t1]);

    expect(() => deleteIndexOp(schema, 't1', 'idx1')).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import {
  addColumnOp,
  updateColumnOp,
  deleteColumnOp,
  moveColumnToIndexOp,
  moveColumnUpOp,
  moveColumnDownOp,
  duplicateColumnOp,
} from '$lib/store/ops/column-ops';
import type { Column, ERDSchema, ForeignKey, Table } from '$lib/types/erd';

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

function makeCol(id: string, name: string, extra?: Partial<Column>): Column {
  return {
    id,
    name,
    type: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...extra,
  };
}

function makeFk(
  id: string,
  columnIds: string[],
  referencedTableId: string,
  referencedColumnIds: string[],
): ForeignKey {
  return {
    id,
    columnIds,
    referencedTableId,
    referencedColumnIds,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  };
}

describe('addColumnOp', () => {
  it('adds a column with auto-name column_N based on current length', () => {
    const col1 = makeCol('c1', 'id');
    const table = makeTable('t1', [col1]);
    const schema = makeSchema([table]);

    const result = addColumnOp(schema, 't1');

    expect(result).toBeDefined();
    expect(result!.name).toBe('column_2');
    expect(result!.type).toBe('VARCHAR');
    expect(result!.length).toBe(255);
    expect(result!.nullable).toBe(false);
    expect(result!.primaryKey).toBe(false);
    expect(table.columns).toHaveLength(2);
    expect(table.columns[1].id).toBe(result!.id);
  });

  it('adds column_1 to an empty table', () => {
    const table = makeTable('t1', []);
    const schema = makeSchema([table]);

    const result = addColumnOp(schema, 't1');

    expect(result).toBeDefined();
    expect(result!.name).toBe('column_1');
    expect(table.columns).toHaveLength(1);
  });

  it('returns the new column', () => {
    const schema = makeSchema([makeTable('t1', [])]);
    const result = addColumnOp(schema, 't1');

    expect(result).toBeDefined();
    expect(result!.id).toBeTruthy();
  });

  it('updates updatedAt', () => {
    const schema = makeSchema([makeTable('t1', [])]);
    const before = schema.updatedAt;

    addColumnOp(schema, 't1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);
    const result = addColumnOp(schema, 'nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('updateColumnOp', () => {
  it('patches specified fields', () => {
    const col = makeCol('c1', 'name', { type: 'INT' });
    const table = makeTable('t1', [col]);
    const schema = makeSchema([table]);

    updateColumnOp(schema, 't1', 'c1', { name: 'username', type: 'VARCHAR', length: 100 });

    const updated = schema.tables[0].columns[0];
    expect(updated.name).toBe('username');
    expect(updated.type).toBe('VARCHAR');
    expect(updated.length).toBe(100);
  });

  it('forces nullable=false when primaryKey=true', () => {
    const col = makeCol('c1', 'id', { nullable: true });
    const table = makeTable('t1', [col]);
    const schema = makeSchema([table]);

    updateColumnOp(schema, 't1', 'c1', { primaryKey: true, nullable: true });

    const updated = schema.tables[0].columns[0];
    expect(updated.primaryKey).toBe(true);
    expect(updated.nullable).toBe(false);
  });

  it('allows nullable=true when primaryKey is not set', () => {
    const col = makeCol('c1', 'id', { nullable: false });
    const table = makeTable('t1', [col]);
    const schema = makeSchema([table]);

    updateColumnOp(schema, 't1', 'c1', { nullable: true });

    expect(schema.tables[0].columns[0].nullable).toBe(true);
  });

  it('updates updatedAt', () => {
    const col = makeCol('c1', 'name');
    const schema = makeSchema([makeTable('t1', [col])]);
    const before = schema.updatedAt;

    updateColumnOp(schema, 't1', 'c1', { name: 'new_name' });

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);
    const before = schema.updatedAt;

    // Should not throw
    updateColumnOp(schema, 'nonexistent', 'c1', { name: 'x' });

    // updatedAt still changes because the function updates it after find
    // Actually let's check: the function returns early if table not found
    // so updatedAt should remain unchanged... wait, let me re-read the code.
    // The code does `if (!table) return;` before updating, so updatedAt is unchanged.
    // But it always calls `schema.updatedAt = now()` at the end... let me check.
    // Actually the code does: find table → if (!table) return; → map → updatedAt = now()
    // So if table not found, it returns before updatedAt update. Good.
    expect(schema.updatedAt).toBe(before);
  });

  it('no-op for nonexistent column (table exists but column does not)', () => {
    const col = makeCol('c1', 'name');
    const schema = makeSchema([makeTable('t1', [col])]);

    updateColumnOp(schema, 't1', 'nonexistent', { name: 'x' });

    // Column is unchanged (map produces same array since no id match)
    expect(schema.tables[0].columns[0].name).toBe('name');
  });
});

describe('deleteColumnOp', () => {
  it('removes the column from the table', () => {
    const col1 = makeCol('c1', 'id');
    const col2 = makeCol('c2', 'name');
    const table = makeTable('t1', [col1, col2]);
    const schema = makeSchema([table]);

    deleteColumnOp(schema, 't1', 'c1');

    expect(table.columns).toHaveLength(1);
    expect(table.columns[0].id).toBe('c2');
  });

  it('removes FKs in the same table that reference the deleted column', () => {
    const col1 = makeCol('c1', 'id');
    const col2 = makeCol('c2', 'ref_id');
    const fk = makeFk('fk1', ['c2'], 'other', ['oc1']);
    const table = makeTable('t1', [col1, col2], [fk]);
    const schema = makeSchema([table]);

    deleteColumnOp(schema, 't1', 'c2');

    expect(table.foreignKeys).toHaveLength(0);
  });

  it('removes FKs in OTHER tables that reference this column', () => {
    const col1 = makeCol('c1', 'id');
    const table1 = makeTable('t1', [col1]);

    const col2 = makeCol('c2', 'ref_id');
    const fk = makeFk('fk1', ['c2'], 't1', ['c1']);
    const table2 = makeTable('t2', [col2], [fk]);

    const schema = makeSchema([table1, table2]);

    deleteColumnOp(schema, 't1', 'c1');

    // FK in table2 that referenced t1.c1 should be removed
    expect(table2.foreignKeys).toHaveLength(0);
  });

  it('keeps FKs in other tables that do not reference the deleted column', () => {
    const col1 = makeCol('c1', 'id');
    const col1b = makeCol('c1b', 'other_id');
    const table1 = makeTable('t1', [col1, col1b]);

    const col2 = makeCol('c2', 'ref_id');
    const fk = makeFk('fk1', ['c2'], 't1', ['c1b']);
    const table2 = makeTable('t2', [col2], [fk]);

    const schema = makeSchema([table1, table2]);

    deleteColumnOp(schema, 't1', 'c1');

    // FK referencing c1b should remain
    expect(table2.foreignKeys).toHaveLength(1);
  });

  it('removes from uniqueKeys', () => {
    const col1 = makeCol('c1', 'id');
    const col2 = makeCol('c2', 'name');
    const table = makeTable('t1', [col1, col2]);
    table.uniqueKeys = [{ id: 'uk1', columnIds: ['c1'] }, { id: 'uk2', columnIds: ['c2'] }];
    const schema = makeSchema([table]);

    deleteColumnOp(schema, 't1', 'c1');

    expect(table.uniqueKeys).toHaveLength(1);
    expect(table.uniqueKeys[0].id).toBe('uk2');
  });

  it('removes from indexes', () => {
    const col1 = makeCol('c1', 'id');
    const col2 = makeCol('c2', 'name');
    const table = makeTable('t1', [col1, col2]);
    table.indexes = [
      { id: 'idx1', columnIds: ['c1'], name: 'idx_c1', unique: false },
      { id: 'idx2', columnIds: ['c2'], name: 'idx_c2', unique: false },
    ];
    const schema = makeSchema([table]);

    deleteColumnOp(schema, 't1', 'c1');

    expect(table.indexes).toHaveLength(1);
    expect(table.indexes[0].id).toBe('idx2');
  });

  it('no-op for nonexistent table', () => {
    const schema = makeSchema([]);

    // Should not throw
    deleteColumnOp(schema, 'nonexistent', 'c1');
  });

  it('updates updatedAt', () => {
    const col = makeCol('c1', 'id');
    const schema = makeSchema([makeTable('t1', [col])]);
    const before = schema.updatedAt;

    deleteColumnOp(schema, 't1', 'c1');

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('moveColumnToIndexOp', () => {
  it('moves column to specified index and returns true', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b'), makeCol('c3', 'c')];
    const table = makeTable('t1', cols);
    const schema = makeSchema([table]);

    const result = moveColumnToIndexOp(schema, 't1', 'c1', 2);

    expect(result).toBe(true);
    expect(table.columns.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('returns false when fromIndex equals toIndex', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const table = makeTable('t1', cols);
    const schema = makeSchema([table]);

    const result = moveColumnToIndexOp(schema, 't1', 'c1', 0);

    expect(result).toBe(false);
  });

  it('returns false for nonexistent table', () => {
    const schema = makeSchema([]);
    const result = moveColumnToIndexOp(schema, 'nonexistent', 'c1', 0);
    expect(result).toBe(false);
  });

  it('returns false for nonexistent column', () => {
    const cols = [makeCol('c1', 'a')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = moveColumnToIndexOp(schema, 't1', 'nonexistent', 0);

    expect(result).toBe(false);
  });

  it('updates updatedAt on successful move', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const schema = makeSchema([makeTable('t1', cols)]);
    const before = schema.updatedAt;

    moveColumnToIndexOp(schema, 't1', 'c1', 1);

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('moveColumnUpOp', () => {
  it('swaps column with previous and returns new index', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b'), makeCol('c3', 'c')];
    const table = makeTable('t1', cols);
    const schema = makeSchema([table]);

    const result = moveColumnUpOp(schema, 't1', 'c2');

    expect(result).toBe(0);
    expect(table.columns.map((c) => c.id)).toEqual(['c2', 'c1', 'c3']);
  });

  it('returns undefined for first column (cannot move up)', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = moveColumnUpOp(schema, 't1', 'c1');

    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);
    const result = moveColumnUpOp(schema, 'nonexistent', 'c1');
    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent column', () => {
    const cols = [makeCol('c1', 'a')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = moveColumnUpOp(schema, 't1', 'nonexistent');

    expect(result).toBeUndefined();
  });

  it('updates updatedAt on successful move', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const schema = makeSchema([makeTable('t1', cols)]);
    const before = schema.updatedAt;

    moveColumnUpOp(schema, 't1', 'c2');

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('moveColumnDownOp', () => {
  it('swaps column with next and returns new index', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b'), makeCol('c3', 'c')];
    const table = makeTable('t1', cols);
    const schema = makeSchema([table]);

    const result = moveColumnDownOp(schema, 't1', 'c2');

    expect(result).toBe(2);
    expect(table.columns.map((c) => c.id)).toEqual(['c1', 'c3', 'c2']);
  });

  it('returns undefined for last column (cannot move down)', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = moveColumnDownOp(schema, 't1', 'c2');

    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);
    const result = moveColumnDownOp(schema, 'nonexistent', 'c1');
    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent column', () => {
    const cols = [makeCol('c1', 'a')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = moveColumnDownOp(schema, 't1', 'nonexistent');

    expect(result).toBeUndefined();
  });

  it('updates updatedAt on successful move', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b')];
    const schema = makeSchema([makeTable('t1', cols)]);
    const before = schema.updatedAt;

    moveColumnDownOp(schema, 't1', 'c1');

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('duplicateColumnOp', () => {
  it('copies column with _copy suffix', () => {
    const col = makeCol('c1', 'email', { type: 'VARCHAR', length: 100, nullable: true });
    const table = makeTable('t1', [col]);
    const schema = makeSchema([table]);

    const result = duplicateColumnOp(schema, 't1', 'c1');

    expect(result).toBeDefined();
    expect(result!.name).toBe('email_copy');
    expect(result!.type).toBe('VARCHAR');
    expect(result!.length).toBe(100);
    expect(result!.nullable).toBe(true);
  });

  it('clears primaryKey, autoIncrement, and domainId', () => {
    const col = makeCol('c1', 'id', {
      primaryKey: true,
      autoIncrement: true,
      domainId: 'dom1',
    });
    const table = makeTable('t1', [col]);
    const schema = makeSchema([table]);

    const result = duplicateColumnOp(schema, 't1', 'c1');

    expect(result!.primaryKey).toBe(false);
    expect(result!.autoIncrement).toBe(false);
    expect(result!.domainId).toBeUndefined();
  });

  it('inserts after the original column', () => {
    const cols = [makeCol('c1', 'a'), makeCol('c2', 'b'), makeCol('c3', 'c')];
    const table = makeTable('t1', cols);
    const schema = makeSchema([table]);

    const result = duplicateColumnOp(schema, 't1', 'c2');

    expect(table.columns).toHaveLength(4);
    expect(table.columns[1].id).toBe('c2');
    expect(table.columns[2].id).toBe(result!.id);
    expect(table.columns[2].name).toBe('b_copy');
    expect(table.columns[3].id).toBe('c3');
  });

  it('generates a new unique id', () => {
    const col = makeCol('c1', 'name');
    const schema = makeSchema([makeTable('t1', [col])]);

    const result = duplicateColumnOp(schema, 't1', 'c1');

    expect(result!.id).not.toBe('c1');
  });

  it('returns undefined for nonexistent table', () => {
    const schema = makeSchema([]);
    const result = duplicateColumnOp(schema, 'nonexistent', 'c1');
    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent column', () => {
    const cols = [makeCol('c1', 'a')];
    const schema = makeSchema([makeTable('t1', cols)]);

    const result = duplicateColumnOp(schema, 't1', 'nonexistent');

    expect(result).toBeUndefined();
  });

  it('updates updatedAt', () => {
    const col = makeCol('c1', 'name');
    const schema = makeSchema([makeTable('t1', [col])]);
    const before = schema.updatedAt;

    duplicateColumnOp(schema, 't1', 'c1');

    expect(schema.updatedAt).not.toBe(before);
  });
});

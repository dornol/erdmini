import { describe, it, expect, beforeEach } from 'vitest';
import { diffSchemas } from './schema-diff';
import { makeColumn, makeTable, makeSchema, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

describe('diffSchemas — identical schemas', () => {
  it('returns no changes for identical schemas', () => {
    const schema = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
    ]);
    const diff = diffSchemas(schema, schema);
    expect(diff.addedTables).toHaveLength(0);
    expect(diff.removedTables).toHaveLength(0);
    expect(diff.modifiedTables).toHaveLength(0);
    expect(diff.summary).toEqual({ added: 0, removed: 0, modified: 0 });
  });

  it('returns no changes for empty schemas', () => {
    const diff = diffSchemas(makeSchema([]), makeSchema([]));
    expect(diff.summary).toEqual({ added: 0, removed: 0, modified: 0 });
  });
});

describe('diffSchemas — table additions', () => {
  it('detects a new table', () => {
    const prev = makeSchema([]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.addedTables).toHaveLength(1);
    expect(diff.addedTables[0].name).toBe('users');
    expect(diff.summary.added).toBe(1);
  });

  it('detects multiple new tables', () => {
    const prev = makeSchema([]);
    const curr = makeSchema([
      makeTable({ id: 't1', name: 'users', columns: [makeColumn({ name: 'id', type: 'INT', nullable: false })] }),
      makeTable({ id: 't2', name: 'orders', columns: [makeColumn({ name: 'id', type: 'INT', nullable: false })] }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.addedTables).toHaveLength(2);
    expect(diff.summary.added).toBe(2);
  });
});

describe('diffSchemas — table removals', () => {
  it('detects a removed table', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const curr = makeSchema([]);
    const diff = diffSchemas(prev, curr);
    expect(diff.removedTables).toHaveLength(1);
    expect(diff.removedTables[0].name).toBe('users');
    expect(diff.summary.removed).toBe(1);
  });
});

describe('diffSchemas — table modifications', () => {
  it('detects table name change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'accounts',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].prevName).toBe('users');
    expect(diff.modifiedTables[0].tableName).toBe('accounts');
    expect(diff.modifiedTables[0].propertyChanges).toContain('name: users → accounts');
  });

  it('detects table comment change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
        comment: 'Old comment',
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
        comment: 'New comment',
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].propertyChanges).toContain('comment changed');
  });
});

describe('diffSchemas — column changes', () => {
  it('detects added column', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false }),
          makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR', nullable: false }),
        ],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns[0].name).toBe('email');
  });

  it('detects removed column', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false }),
          makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR', nullable: false }),
        ],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].removedColumns).toHaveLength(1);
    expect(diff.modifiedTables[0].removedColumns[0].name).toBe('email');
  });

  it('detects column type change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'age', type: 'INT', nullable: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'age', type: 'BIGINT', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    const mod = diff.modifiedTables[0].modifiedColumns[0];
    expect(mod.columnName).toBe('age');
    expect(mod.changes).toContain('type: INT → BIGINT');
  });

  it('detects column nullable change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'name', type: 'VARCHAR', nullable: true })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'name', type: 'VARCHAR', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain('nullable: true → false');
  });

  it('detects column primaryKey change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain('primaryKey: false → true');
  });

  it('detects column default value change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'status', type: 'VARCHAR', nullable: false, defaultValue: "'active'" })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'status', type: 'VARCHAR', nullable: false, defaultValue: "'inactive'" })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain("default: 'active' → 'inactive'");
  });

  it('detects column name change', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'user_name', type: 'VARCHAR', nullable: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'username', type: 'VARCHAR', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain('name: user_name → username');
  });
});

describe('diffSchemas — FK changes', () => {
  it('detects added FK', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        id: 't2',
        name: 'orders',
        columns: [
          makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c3', name: 'user_id', type: 'INT', nullable: false }),
        ],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        id: 't2',
        name: 'orders',
        columns: [
          makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c3', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1', columnIds: ['c3'], referencedTableId: 't1',
          referencedColumnIds: ['c1'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedFKs).toHaveLength(1);
    expect(diff.modifiedTables[0].addedFKs[0].id).toBe('fk1');
  });

  it('detects removed FK', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        id: 't2',
        name: 'orders',
        columns: [
          makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c3', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1', columnIds: ['c3'], referencedTableId: 't1',
          referencedColumnIds: ['c1'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        id: 't2',
        name: 'orders',
        columns: [
          makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c3', name: 'user_id', type: 'INT', nullable: false }),
        ],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].removedFKs).toHaveLength(1);
  });
});

describe('diffSchemas — index changes', () => {
  it('detects added index', () => {
    const col = makeColumn({ id: 'c1', name: 'email', type: 'VARCHAR', nullable: false });
    const prev = makeSchema([makeTable({ id: 't1', name: 'users', columns: [col] })]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [col],
        indexes: [{ id: 'idx1', columnIds: ['c1'], unique: false, name: 'idx_email' }],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedIndexes).toHaveLength(1);
  });

  it('detects removed index', () => {
    const col = makeColumn({ id: 'c1', name: 'email', type: 'VARCHAR', nullable: false });
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [col],
        indexes: [{ id: 'idx1', columnIds: ['c1'], unique: false, name: 'idx_email' }],
      }),
    ]);
    const curr = makeSchema([makeTable({ id: 't1', name: 'users', columns: [col] })]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].removedIndexes).toHaveLength(1);
  });
});

describe('diffSchemas — name fallback matching', () => {
  it('matches tables by name when IDs differ', () => {
    const prev = makeSchema([
      makeTable({
        id: 'old_id',
        name: 'users',
        columns: [makeColumn({ id: 'c_old', name: 'id', type: 'INT', nullable: false })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 'new_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'c_new', name: 'id', type: 'INT', nullable: false }),
          makeColumn({ id: 'c_new2', name: 'email', type: 'VARCHAR', nullable: false }),
        ],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.addedTables).toHaveLength(0);
    expect(diff.removedTables).toHaveLength(0);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns).toHaveLength(1);
  });

  it('matches columns by name when IDs differ', () => {
    const prev = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'old_c', name: 'email', type: 'VARCHAR', nullable: true })],
      }),
    ]);
    const curr = makeSchema([
      makeTable({
        id: 't1',
        name: 'users',
        columns: [makeColumn({ id: 'new_c', name: 'email', type: 'VARCHAR', nullable: false })],
      }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns).toHaveLength(0);
    expect(diff.modifiedTables[0].removedColumns).toHaveLength(0);
    expect(diff.modifiedTables[0].modifiedColumns).toHaveLength(1);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain('nullable: true → false');
  });
});

describe('diffSchemas — summary', () => {
  it('calculates correct summary counts', () => {
    const prev = makeSchema([
      makeTable({ id: 't1', name: 'users', columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false })] }),
      makeTable({ id: 't2', name: 'old_table', columns: [makeColumn({ id: 'c2', name: 'id', type: 'INT', nullable: false })] }),
    ]);
    const curr = makeSchema([
      makeTable({ id: 't1', name: 'users', columns: [
        makeColumn({ id: 'c1', name: 'id', type: 'INT', nullable: false }),
        makeColumn({ id: 'c3', name: 'email', type: 'VARCHAR', nullable: false }),
      ]}),
      makeTable({ id: 't3', name: 'new_table', columns: [makeColumn({ id: 'c4', name: 'id', type: 'INT', nullable: false })] }),
    ]);
    const diff = diffSchemas(prev, curr);
    expect(diff.summary).toEqual({ added: 1, removed: 1, modified: 1 });
  });
});

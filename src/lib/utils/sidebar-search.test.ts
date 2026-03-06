import { describe, it, expect } from 'vitest';
import { tableHasAttr, filterTables, getTableMeta } from './sidebar-search';
import { makeColumn, makeTable, makeSchema } from './test-helpers';

// ── Shared fixtures ──

function buildFixtures() {
  const idCol = makeColumn({ name: 'id', type: 'INT', primaryKey: true });
  const nameCol = makeColumn({ name: 'name', type: 'VARCHAR', comment: 'Display name' });
  const emailCol = makeColumn({ name: 'email', type: 'VARCHAR', unique: true });
  const statusCol = makeColumn({ name: 'status', type: 'ENUM', enumValues: ['active', 'inactive'] });
  const defaultCol = makeColumn({ name: 'active', type: 'BOOLEAN', defaultValue: 'true' });
  const autoCol = makeColumn({ name: 'seq', type: 'INT', autoIncrement: true });
  const domainCol = makeColumn({ name: 'code', type: 'VARCHAR', domainId: 'd1' });

  const usersTable = makeTable({
    name: 'users',
    columns: [idCol, nameCol, emailCol],
    group: 'auth',
    comment: 'User accounts',
    color: 'blue',
  });

  const fkCol = makeColumn({ name: 'user_id', type: 'INT' });
  const ordersTable = makeTable({
    name: 'orders',
    columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true }), fkCol],
    foreignKeys: [
      {
        id: 'fk1',
        columnIds: [fkCol.id],
        referencedTableId: usersTable.id,
        referencedColumnIds: [idCol.id],
      },
    ],
  });

  const configTable = makeTable({
    name: 'config',
    columns: [
      makeColumn({ name: 'key', type: 'VARCHAR' }),
      makeColumn({ name: 'value', type: 'TEXT' }),
    ],
    locked: true,
    schema: 'settings',
  });

  const allCols = makeTable({
    name: 'all_features',
    columns: [autoCol, statusCol, defaultCol, domainCol],
    uniqueKeys: [{ id: 'uk1', columnIds: [autoCol.id], name: 'uk_seq' }],
    indexes: [{ id: 'idx1', columnIds: [domainCol.id], name: 'idx_code', unique: false }],
  });

  return { usersTable, ordersTable, configTable, allCols, idCol, fkCol };
}

// ── tableHasAttr ──

describe('tableHasAttr', () => {
  const { usersTable, ordersTable, configTable, allCols } = buildFixtures();

  it('pk: true when table has PK column', () => {
    expect(tableHasAttr(usersTable, 'pk')).toBe(true);
  });

  it('pk: false when no PK', () => {
    expect(tableHasAttr(configTable, 'pk')).toBe(false);
  });

  it('fk: true when table has FK', () => {
    expect(tableHasAttr(ordersTable, 'fk')).toBe(true);
  });

  it('fk: false when no FK', () => {
    expect(tableHasAttr(usersTable, 'fk')).toBe(false);
  });

  it('index/idx: true when has indexes', () => {
    expect(tableHasAttr(allCols, 'index')).toBe(true);
    expect(tableHasAttr(allCols, 'idx')).toBe(true);
  });

  it('index: false when no indexes', () => {
    expect(tableHasAttr(usersTable, 'index')).toBe(false);
  });

  it('comment: true when has table or column comment', () => {
    expect(tableHasAttr(usersTable, 'comment')).toBe(true);
  });

  it('comment: false when no comments', () => {
    expect(tableHasAttr(configTable, 'comment')).toBe(false);
  });

  it('domain: true when has domainId column', () => {
    expect(tableHasAttr(allCols, 'domain')).toBe(true);
  });

  it('domain: false when no domain columns', () => {
    expect(tableHasAttr(usersTable, 'domain')).toBe(false);
  });

  it('unique/uq: true when has unique column or UK', () => {
    expect(tableHasAttr(usersTable, 'unique')).toBe(true); // emailCol.unique
    expect(tableHasAttr(allCols, 'uq')).toBe(true); // uniqueKeys
  });

  it('auto/ai: true when autoIncrement', () => {
    expect(tableHasAttr(allCols, 'auto')).toBe(true);
    expect(tableHasAttr(allCols, 'ai')).toBe(true);
  });

  it('default: true when defaultValue set', () => {
    expect(tableHasAttr(allCols, 'default')).toBe(true);
  });

  it('color: true when color set', () => {
    expect(tableHasAttr(usersTable, 'color')).toBe(true);
  });

  it('color: false when no color', () => {
    expect(tableHasAttr(ordersTable, 'color')).toBe(false);
  });

  it('enum: true when ENUM type or enumValues', () => {
    expect(tableHasAttr(allCols, 'enum')).toBe(true);
  });

  it('locked: true when locked', () => {
    expect(tableHasAttr(configTable, 'locked')).toBe(true);
  });

  it('locked: false when not locked', () => {
    expect(tableHasAttr(usersTable, 'locked')).toBe(false);
  });

  it('unknown attr returns false', () => {
    expect(tableHasAttr(usersTable, 'nonexistent')).toBe(false);
  });
});

// ── filterTables ──

describe('filterTables', () => {
  const { usersTable, ordersTable, configTable, allCols, idCol, fkCol } = buildFixtures();
  const allTables = [usersTable, ordersTable, configTable, allCols];
  const schema = makeSchema(allTables);

  it('returns all tables when no query and no schema filter', () => {
    const result = filterTables(allTables, allTables, schema, '', '(all)', 'creation');
    expect(result).toHaveLength(4);
  });

  it('filters by schema namespace', () => {
    const result = filterTables(allTables, allTables, schema, '', 'settings', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('config');
  });

  it('filters by table name (default search)', () => {
    // "users" matches users table by name AND orders table by FK ref → 2 results
    const result = filterTables(allTables, allTables, schema, 'users', '(all)', 'creation');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name).sort()).toEqual(['orders', 'users']);
  });

  it('filters by column name', () => {
    const result = filterTables(allTables, allTables, schema, 'email', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('filters by column comment', () => {
    const result = filterTables(allTables, allTables, schema, 'Display name', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('filters by table comment', () => {
    const result = filterTables(allTables, allTables, schema, 'accounts', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('filters by group name', () => {
    const result = filterTables(allTables, allTables, schema, 'auth', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('fk: prefix filters by FK referenced table name', () => {
    const result = filterTables(allTables, allTables, schema, 'fk:users', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orders');
  });

  it('group: prefix filters by group', () => {
    const result = filterTables(allTables, allTables, schema, 'group:auth', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('locked: prefix filters locked tables', () => {
    const result = filterTables(allTables, allTables, schema, 'locked:', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('config');
  });

  it('type: prefix filters by column type', () => {
    const result = filterTables(allTables, allTables, schema, 'type:enum', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('all_features');
  });

  it('has: prefix filters by attribute', () => {
    const result = filterTables(allTables, allTables, schema, 'has:fk', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orders');
  });

  it('no: prefix filters by absence of attribute', () => {
    const result = filterTables(allTables, allTables, schema, 'no:pk', '(all)', 'creation');
    // configTable and allCols have no PK
    expect(result.map((t) => t.name).sort()).toEqual(['all_features', 'config']);
  });

  it('color: prefix filters by color', () => {
    const result = filterTables(allTables, allTables, schema, 'color:blue', '(all)', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('users');
  });

  it('sorts by name when sortBy is "name"', () => {
    const result = filterTables(allTables, allTables, schema, '', '(all)', 'name');
    expect(result.map((t) => t.name)).toEqual(
      [...allTables.map((t) => t.name)].sort(),
    );
  });

  it('preserves creation order when sortBy is "creation"', () => {
    const result = filterTables(allTables, allTables, schema, '', '(all)', 'creation');
    expect(result.map((t) => t.name)).toEqual(allTables.map((t) => t.name));
  });

  it('returns empty when no tables match', () => {
    const result = filterTables(allTables, allTables, schema, 'zzz_not_found', '(all)', 'creation');
    expect(result).toHaveLength(0);
  });

  it('case-insensitive search', () => {
    // "USERS" matches users table by name AND orders table by FK ref
    const result = filterTables(allTables, allTables, schema, 'USERS', '(all)', 'creation');
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toContain('users');
  });

  it('schema filter + query combined', () => {
    // config is in 'settings' schema; search for 'key' column
    const result = filterTables(allTables, allTables, schema, 'key', 'settings', 'creation');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('config');

    // same query but wrong schema
    const result2 = filterTables(allTables, allTables, schema, 'key', 'auth', 'creation');
    expect(result2).toHaveLength(0);
  });
});

// ── getTableMeta ──

describe('getTableMeta', () => {
  const { usersTable, ordersTable, idCol, fkCol } = buildFixtures();
  const allTables = [usersTable, ordersTable];

  it('returns correct column count', () => {
    const meta = getTableMeta(usersTable, allTables);
    expect(meta.colCount).toBe(3);
  });

  it('returns correct FK count', () => {
    const meta = getTableMeta(ordersTable, allTables);
    expect(meta.fkCount).toBe(1);
  });

  it('returns PK column names', () => {
    const meta = getTableMeta(usersTable, allTables);
    expect(meta.pkCols).toEqual(['id']);
  });

  it('returns FK details with arrow notation', () => {
    const meta = getTableMeta(ordersTable, allTables);
    expect(meta.fkDetails).toHaveLength(1);
    expect(meta.fkDetails[0]).toContain('→');
    expect(meta.fkDetails[0]).toContain('users');
  });

  it('returns reference count (tables referencing this)', () => {
    const meta = getTableMeta(usersTable, allTables);
    expect(meta.refCount).toBe(1);
    expect(meta.refDetails).toHaveLength(1);
    expect(meta.refDetails[0]).toContain('orders');
  });

  it('returns 0 refs for table with no inbound FKs', () => {
    const meta = getTableMeta(ordersTable, allTables);
    expect(meta.refCount).toBe(0);
  });

  it('handles table with no FKs', () => {
    const meta = getTableMeta(usersTable, allTables);
    expect(meta.fkCount).toBe(0);
    expect(meta.fkDetails).toHaveLength(0);
  });
});

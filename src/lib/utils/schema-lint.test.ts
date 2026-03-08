import { describe, it, expect, beforeEach } from 'vitest';
import { lintSchema } from './schema-lint';
import { makeColumn, makeTable, makeSchema, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

describe('lintSchema', () => {
  it('returns empty array for valid schema', () => {
    const t = makeTable({
      name: 'users',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ name: 'name', type: 'VARCHAR' }),
      ],
    });
    const issues = lintSchema(makeSchema([t]));
    expect(issues).toHaveLength(0);
  });

  describe('no-pk', () => {
    it('warns when table has no primary key', () => {
      const t = makeTable({
        name: 'logs',
        columns: [
          makeColumn({ name: 'msg', type: 'TEXT' }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      const noPk = issues.filter((i) => i.ruleId === 'no-pk');
      expect(noPk).toHaveLength(1);
      expect(noPk[0].severity).toBe('warning');
      expect(noPk[0].tableId).toBe(t.id);
    });

    it('does not warn when table has a primary key', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      expect(issues.filter((i) => i.ruleId === 'no-pk')).toHaveLength(0);
    });
  });

  describe('fk-target-missing', () => {
    it('errors when FK references non-existent table', () => {
      const t = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c2', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['c2'],
          referencedTableId: 'nonexistent',
          referencedColumnIds: ['x'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([t]));
      const fkMissing = issues.filter((i) => i.ruleId === 'fk-target-missing');
      expect(fkMissing).toHaveLength(1);
      expect(fkMissing[0].severity).toBe('error');
    });

    it('errors when FK references non-existent column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['nonexistent_col'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      const fkMissing = issues.filter((i) => i.ruleId === 'fk-target-missing');
      expect(fkMissing).toHaveLength(1);
    });
  });

  describe('set-null-not-nullable', () => {
    it('warns when SET NULL on NOT NULL column (onDelete)', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      const setNull = issues.filter((i) => i.ruleId === 'set-null-not-nullable');
      expect(setNull).toHaveLength(1);
      expect(setNull[0].severity).toBe('warning');
      expect(setNull[0].columnId).toBe('o_uid');
    });

    it('does not warn when SET NULL on nullable column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT', nullable: true }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'set-null-not-nullable')).toHaveLength(0);
    });
  });

  describe('duplicate-column-name', () => {
    it('errors when table has duplicate column names', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'name', type: 'VARCHAR' }),
          makeColumn({ name: 'name', type: 'TEXT' }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      const dups = issues.filter((i) => i.ruleId === 'duplicate-column-name');
      expect(dups).toHaveLength(1);
      expect(dups[0].severity).toBe('error');
    });

    it('is case-insensitive', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'Name', type: 'VARCHAR' }),
          makeColumn({ name: 'name', type: 'TEXT' }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      expect(issues.filter((i) => i.ruleId === 'duplicate-column-name')).toHaveLength(1);
    });
  });

  describe('duplicate-table-name', () => {
    it('errors when schema has duplicate table names', () => {
      const t1 = makeTable({
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      const t2 = makeTable({
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      const issues = lintSchema(makeSchema([t1, t2]));
      const dups = issues.filter((i) => i.ruleId === 'duplicate-table-name');
      expect(dups).toHaveLength(2); // both tables flagged
      expect(dups[0].severity).toBe('error');
    });

    it('is case-insensitive', () => {
      const t1 = makeTable({
        name: 'Users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      const t2 = makeTable({
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      const issues = lintSchema(makeSchema([t1, t2]));
      expect(issues.filter((i) => i.ruleId === 'duplicate-table-name')).toHaveLength(2);
    });
  });

  describe('duplicate-index', () => {
    it('warns when table has duplicate indexes', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR' }),
        ],
        indexes: [
          { id: 'idx1', columnIds: ['c1', 'c2'], unique: false },
          { id: 'idx2', columnIds: ['c2', 'c1'], unique: true },
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      const dups = issues.filter((i) => i.ruleId === 'duplicate-index');
      expect(dups).toHaveLength(1);
      expect(dups[0].severity).toBe('warning');
    });
  });

  describe('circular-fk', () => {
    it('warns when there is a circular FK reference', () => {
      const a = makeTable({
        id: 'a',
        name: 'A',
        columns: [
          makeColumn({ id: 'a_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'a_bid', name: 'b_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk_a',
          columnIds: ['a_bid'],
          referencedTableId: 'b',
          referencedColumnIds: ['b_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const b = makeTable({
        id: 'b',
        name: 'B',
        columns: [
          makeColumn({ id: 'b_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'b_aid', name: 'a_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk_b',
          columnIds: ['b_aid'],
          referencedTableId: 'a',
          referencedColumnIds: ['a_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([a, b]));
      const circular = issues.filter((i) => i.ruleId === 'circular-fk');
      expect(circular.length).toBeGreaterThanOrEqual(2);
      expect(circular[0].severity).toBe('warning');
    });

    it('does not warn for self-referencing FK', () => {
      const t = makeTable({
        id: 't1',
        name: 'categories',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c2', name: 'parent_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk_self',
          columnIds: ['c2'],
          referencedTableId: 't1',
          referencedColumnIds: ['c1'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([t]));
      expect(issues.filter((i) => i.ruleId === 'circular-fk')).toHaveLength(0);
    });

    it('detects 3-node cycle', () => {
      const a = makeTable({
        id: 'a', name: 'A',
        columns: [
          makeColumn({ id: 'a1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'a2', name: 'b_id', type: 'INT' }),
        ],
        foreignKeys: [{ id: 'fk1', columnIds: ['a2'], referencedTableId: 'b', referencedColumnIds: ['b1'], onDelete: 'CASCADE', onUpdate: 'CASCADE' }],
      });
      const b = makeTable({
        id: 'b', name: 'B',
        columns: [
          makeColumn({ id: 'b1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'b2', name: 'c_id', type: 'INT' }),
        ],
        foreignKeys: [{ id: 'fk2', columnIds: ['b2'], referencedTableId: 'c', referencedColumnIds: ['c1'], onDelete: 'CASCADE', onUpdate: 'CASCADE' }],
      });
      const c = makeTable({
        id: 'c', name: 'C',
        columns: [
          makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'c2', name: 'a_id', type: 'INT' }),
        ],
        foreignKeys: [{ id: 'fk3', columnIds: ['c2'], referencedTableId: 'a', referencedColumnIds: ['a1'], onDelete: 'CASCADE', onUpdate: 'CASCADE' }],
      });
      const issues = lintSchema(makeSchema([a, b, c]));
      const circular = issues.filter((i) => i.ruleId === 'circular-fk');
      expect(circular).toHaveLength(3);
    });
  });

  describe('empty-table', () => {
    it('reports info when table has no columns', () => {
      const t = makeTable({ name: 'empty', columns: [] });
      const issues = lintSchema(makeSchema([t]));
      const empty = issues.filter((i) => i.ruleId === 'empty-table');
      expect(empty).toHaveLength(1);
      expect(empty[0].severity).toBe('info');
    });

    it('does not report when table has columns', () => {
      const t = makeTable({
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      const issues = lintSchema(makeSchema([t]));
      expect(issues.filter((i) => i.ruleId === 'empty-table')).toHaveLength(0);
    });
  });

  describe('fk-type-mismatch', () => {
    it('warns when FK column type is incompatible with referenced column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'VARCHAR' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      const mismatch = issues.filter((i) => i.ruleId === 'fk-type-mismatch');
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].severity).toBe('warning');
      expect(mismatch[0].message).toContain('VARCHAR');
      expect(mismatch[0].message).toContain('INT');
    });

    it('does not warn when types are in same compat group (INT vs BIGINT)', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'BIGINT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-type-mismatch')).toHaveLength(0);
    });

    it('does not warn when types match exactly', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'UUID', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'UUID', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'UUID' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-type-mismatch')).toHaveLength(0);
    });

    it('skips when referenced table is missing', () => {
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'VARCHAR' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'nonexistent',
          referencedColumnIds: ['x'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-type-mismatch')).toHaveLength(0);
    });
  });

  describe('nullable-pk', () => {
    it('warns when PK column is nullable', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: true }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      const npk = issues.filter((i) => i.ruleId === 'nullable-pk');
      expect(npk).toHaveLength(1);
      expect(npk[0].severity).toBe('warning');
      expect(npk[0].message).toBe('users.id');
    });

    it('does not warn when PK is NOT NULL', () => {
      const t = makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const issues = lintSchema(makeSchema([t]));
      expect(issues.filter((i) => i.ruleId === 'nullable-pk')).toHaveLength(0);
    });
  });

  describe('fk-column-count-mismatch', () => {
    it('errors when FK columnIds and referencedColumnIds have different lengths', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT' }),
          makeColumn({ id: 'o_extra', name: 'extra', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid', 'o_extra'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      const mismatch = issues.filter((i) => i.ruleId === 'fk-column-count-mismatch');
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].severity).toBe('error');
      expect(mismatch[0].message).toContain('2 vs 1');
    });

    it('does not error when counts match', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-column-count-mismatch')).toHaveLength(0);
    });
  });

  describe('fk-references-non-unique', () => {
    it('warns when FK references a non-PK, non-unique column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'u_email', name: 'email', type: 'VARCHAR' }),
        ],
      });
      const logs = makeTable({
        name: 'logs',
        columns: [
          makeColumn({ id: 'l_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'l_email', name: 'user_email', type: 'VARCHAR' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['l_email'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_email'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, logs]));
      const nonUnique = issues.filter((i) => i.ruleId === 'fk-references-non-unique');
      expect(nonUnique).toHaveLength(1);
      expect(nonUnique[0].severity).toBe('warning');
    });

    it('does not warn when FK references PK column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_uid'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-references-non-unique')).toHaveLength(0);
    });

    it('does not warn when FK references unique column', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'u_email', name: 'email', type: 'VARCHAR', unique: true }),
        ],
      });
      const logs = makeTable({
        name: 'logs',
        columns: [
          makeColumn({ id: 'l_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'l_email', name: 'user_email', type: 'VARCHAR' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['l_email'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_email'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, logs]));
      expect(issues.filter((i) => i.ruleId === 'fk-references-non-unique')).toHaveLength(0);
    });

    it('does not warn when FK references columns matching a unique key', () => {
      const users = makeTable({
        id: 'users_id',
        name: 'users',
        columns: [
          makeColumn({ id: 'u_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'u_a', name: 'a', type: 'INT' }),
          makeColumn({ id: 'u_b', name: 'b', type: 'INT' }),
        ],
        uniqueKeys: [{ id: 'uk1', columnIds: ['u_a', 'u_b'] }],
      });
      const orders = makeTable({
        name: 'orders',
        columns: [
          makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: 'o_a', name: 'a', type: 'INT' }),
          makeColumn({ id: 'o_b', name: 'b', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['o_a', 'o_b'],
          referencedTableId: 'users_id',
          referencedColumnIds: ['u_a', 'u_b'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      });
      const issues = lintSchema(makeSchema([users, orders]));
      expect(issues.filter((i) => i.ruleId === 'fk-references-non-unique')).toHaveLength(0);
    });
  });

  describe('multiple rules combined', () => {
    it('reports multiple issues from different rules', () => {
      const t = makeTable({
        name: 'bad_table',
        columns: [],
      });
      const issues = lintSchema(makeSchema([t]));
      const ruleIds = new Set(issues.map((i) => i.ruleId));
      expect(ruleIds.has('no-pk')).toBe(true);
      expect(ruleIds.has('empty-table')).toBe(true);
    });
  });
});

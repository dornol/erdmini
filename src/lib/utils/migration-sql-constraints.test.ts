import { describe, it, expect } from 'vitest';
import { generateMigrationSQL } from './migration-sql';
import type { SchemaDiff, TableDiff } from './schema-diff';
import type { Column, Table, ForeignKey, TableIndex, UniqueKey, Dialect } from '$lib/types/erd';

// ── Helpers ──

function col(overrides: Partial<Column> & { name: string }): Column {
  return {
    id: overrides.id ?? overrides.name,
    name: overrides.name,
    type: overrides.type ?? 'VARCHAR',
    length: overrides.length,
    scale: overrides.scale,
    nullable: overrides.nullable ?? true,
    primaryKey: overrides.primaryKey ?? false,
    unique: overrides.unique ?? false,
    autoIncrement: overrides.autoIncrement ?? false,
    defaultValue: overrides.defaultValue,
    check: overrides.check,
    enumValues: overrides.enumValues,
    comment: overrides.comment,
  };
}

function table(overrides: Partial<Table> & { name: string; columns: Column[] }): Table {
  return {
    id: overrides.id ?? overrides.name,
    name: overrides.name,
    columns: overrides.columns,
    foreignKeys: overrides.foreignKeys ?? [],
    uniqueKeys: overrides.uniqueKeys ?? [],
    indexes: overrides.indexes ?? [],
    position: overrides.position ?? { x: 0, y: 0 },
    comment: overrides.comment,
    schema: overrides.schema,
  };
}

function emptyDiff(): SchemaDiff {
  return {
    addedTables: [],
    removedTables: [],
    modifiedTables: [],
    summary: { added: 0, removed: 0, modified: 0 },
  };
}

function tableDiff(overrides: Partial<TableDiff> & { tableName: string }): TableDiff {
  return {
    tableId: overrides.tableId ?? overrides.tableName,
    tableName: overrides.tableName,
    prevName: overrides.prevName,
    addedColumns: overrides.addedColumns ?? [],
    removedColumns: overrides.removedColumns ?? [],
    modifiedColumns: overrides.modifiedColumns ?? [],
    addedFKs: overrides.addedFKs ?? [],
    removedFKs: overrides.removedFKs ?? [],
    addedIndexes: overrides.addedIndexes ?? [],
    removedIndexes: overrides.removedIndexes ?? [],
    addedUniqueKeys: overrides.addedUniqueKeys ?? [],
    removedUniqueKeys: overrides.removedUniqueKeys ?? [],
    propertyChanges: overrides.propertyChanges ?? [],
  };
}

const opts = { upperCaseKeywords: true, quoteStyle: 'none' as const };

// ── Tests ──

describe('generateMigrationSQL', () => {
  // ── ADD/DROP FK ──
  describe('Foreign Key operations', () => {
    it('adds FK constraint', () => {
      const diff = emptyDiff();
      const ordersTable = table({
        name: 'orders',
        columns: [
          col({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          col({ name: 'user_id', type: 'INT' }),
        ],
      });
      const usersTable = table({
        name: 'users',
        columns: [col({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'orders',
        tableName: 'orders',
        addedFKs: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [ordersTable, usersTable]);
      expect(sql).toContain('ADD CONSTRAINT fk_orders_user_id');
      expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users (id)');
      expect(sql).toContain('ON DELETE CASCADE');
      expect(sql).toContain('ON UPDATE NO ACTION');
    });

    it('drops FK constraint in MySQL', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'orders',
        columns: [col({ name: 'user_id', type: 'INT' })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'orders',
        tableName: 'orders',
        removedFKs: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
      expect(sql).toContain('DROP FOREIGN KEY fk_orders_user_id;');
    });

    it('drops FK constraint in PostgreSQL', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'orders',
        columns: [col({ name: 'user_id', type: 'INT' })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'orders',
        tableName: 'orders',
        removedFKs: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('DROP CONSTRAINT fk_orders_user_id;');
    });

    it('omits ON UPDATE for Oracle FKs', () => {
      const diff = emptyDiff();
      const ordersTable = table({
        name: 'orders',
        columns: [col({ name: 'user_id', type: 'INT' })],
      });
      const usersTable = table({
        name: 'users',
        columns: [col({ name: 'id', type: 'INT', primaryKey: true })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'orders',
        tableName: 'orders',
        addedFKs: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'oracle', opts, [ordersTable, usersTable]);
      expect(sql).toContain('ON DELETE CASCADE');
      expect(sql).not.toContain('ON UPDATE');
    });

    it('adds FKs from newly created tables', () => {
      const diff = emptyDiff();
      const usersTable = table({
        name: 'users',
        columns: [col({ name: 'id', type: 'INT', primaryKey: true })],
      });
      diff.addedTables = [table({
        name: 'orders',
        columns: [
          col({ name: 'id', type: 'INT', primaryKey: true }),
          col({ name: 'user_id', type: 'INT' }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['user_id'],
          referencedTableId: 'users',
          referencedColumnIds: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [usersTable]);
      expect(sql).toContain('ADD CONSTRAINT fk_orders_user_id');
    });
  });

  // ── ADD/DROP INDEX ──
  describe('Index operations', () => {
    it('creates index', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'users',
        columns: [col({ name: 'email', type: 'VARCHAR' })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'users',
        tableName: 'users',
        addedIndexes: [{
          id: 'idx1',
          columnIds: ['email'],
          name: 'idx_users_email',
          unique: false,
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('CREATE INDEX idx_users_email ON users (email);');
    });

    it('creates unique index', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'users',
        columns: [col({ name: 'email', type: 'VARCHAR' })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'users',
        tableName: 'users',
        addedIndexes: [{
          id: 'idx1',
          columnIds: ['email'],
          name: 'idx_users_email_unique',
          unique: true,
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('CREATE UNIQUE INDEX idx_users_email_unique ON users (email);');
    });

    it('drops index in MySQL (with ON clause)', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedIndexes: [{
          id: 'idx1',
          columnIds: ['email'],
          name: 'idx_users_email',
          unique: false,
        }],
      })];
      const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
      expect(sql).toContain('DROP INDEX idx_users_email ON users;');
    });

    it('drops index in PostgreSQL (without ON clause)', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedIndexes: [{
          id: 'idx1',
          columnIds: ['email'],
          name: 'idx_users_email',
          unique: false,
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('DROP INDEX idx_users_email;');
      expect(sql).not.toContain('ON users');
    });
  });

  // ── ADD/DROP Unique Key ──
  describe('Unique Key operations', () => {
    it('adds unique key constraint', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'users',
        columns: [col({ name: 'email' }), col({ name: 'tenant_id' })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'users',
        tableName: 'users',
        addedUniqueKeys: [{
          id: 'uk1',
          columnIds: ['email', 'tenant_id'],
          name: 'uq_users_email_tenant',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('ADD CONSTRAINT uq_users_email_tenant UNIQUE (email, tenant_id);');
    });

    it('drops unique key in MySQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedUniqueKeys: [{
          id: 'uk1',
          columnIds: ['email'],
          name: 'uq_users_email',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
      expect(sql).toContain('DROP INDEX uq_users_email');
    });

    it('drops unique key in PostgreSQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedUniqueKeys: [{
          id: 'uk1',
          columnIds: ['email'],
          name: 'uq_users_email',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('DROP CONSTRAINT uq_users_email;');
    });
  });

  // ── Ordering ──
  describe('Statement ordering', () => {
    it('drops FKs before tables', () => {
      const diff = emptyDiff();
      const srcTable = table({
        name: 'items',
        columns: [col({ name: 'order_id' })],
        foreignKeys: [{
          id: 'fk1', columnIds: ['order_id'], referencedTableId: 'orders',
          referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'CASCADE',
        }],
      });
      diff.removedTables = [srcTable];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      const dropFkIdx = sql.indexOf('DROP CONSTRAINT');
      const dropTableIdx = sql.indexOf('DROP TABLE');
      expect(dropFkIdx).toBeLessThan(dropTableIdx);
    });

    it('creates tables before adding FKs', () => {
      const diff = emptyDiff();
      const usersTable = table({
        name: 'users',
        columns: [col({ name: 'id', type: 'INT', primaryKey: true })],
      });
      diff.addedTables = [table({
        name: 'orders',
        columns: [col({ name: 'id' }), col({ name: 'user_id' })],
        foreignKeys: [{
          id: 'fk1', columnIds: ['user_id'], referencedTableId: 'users',
          referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'CASCADE',
        }],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [usersTable]);
      const createIdx = sql.indexOf('CREATE TABLE');
      const addFkIdx = sql.indexOf('ADD CONSTRAINT');
      expect(createIdx).toBeLessThan(addFkIdx);
    });

    it('renames tables before adding columns', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'articles',
        columns: [col({ name: 'id' }), col({ name: 'title' })],
      });
      diff.modifiedTables = [tableDiff({
        tableName: 'articles',
        prevName: 'posts',
        addedColumns: [col({ name: 'title' })],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      const renameIdx = sql.indexOf('RENAME TO');
      const addColIdx = sql.indexOf('ADD COLUMN');
      expect(renameIdx).toBeLessThan(addColIdx);
    });
  });
});

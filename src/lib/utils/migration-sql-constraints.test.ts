import { describe, it, expect } from 'vitest';
import { generateMigrationSQL } from './migration-sql';
import { diffSchemas, type SchemaDiff, type TableDiff } from './schema-diff';
import type { Column, ERDSchema, Table, ForeignKey, TableIndex, UniqueKey, Dialect } from '$lib/types/erd';

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

function schema(tables: Table[]): ERDSchema {
  return {
    version: '1.0.0',
    dialect: 'mssql',
    tables,
    domains: [],
    memos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
    it('adds a single-column unique constraint when column unique changes to true', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'tClientDetail',
        columns: [col({ name: 'Original_Coupon_No', type: 'INT', nullable: false, unique: true })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'tClientDetail',
        tableName: 'tClientDetail',
        modifiedColumns: [{
          columnName: 'Original_Coupon_No',
          prev: col({ name: 'Original_Coupon_No', type: 'INT', nullable: false, unique: false }),
          curr: col({ name: 'Original_Coupon_No', type: 'INT', nullable: false, unique: true }),
          changes: ['unique: false → true'],
        }],
      })];

      const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);

      expect(sql).toContain('-- Add indexes / unique keys');
      expect(sql).toContain('ALTER TABLE tClientDetail ADD CONSTRAINT uq_tClientDetail_Original_Coupon_No UNIQUE (Original_Coupon_No);');
    });

    it.each(['mysql', 'mariadb', 'postgresql', 'mssql', 'oracle', 'h2'] as const)(
      'adds a single-column unique constraint for %s',
      (dialect) => {
        const diff = emptyDiff();
        const currTable = table({
          name: 'users',
          columns: [col({ name: 'email', unique: true })],
        });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'email',
            prev: col({ name: 'email', unique: false }),
            curr: col({ name: 'email', unique: true }),
            changes: ['unique: false → true'],
          }],
        })];

        const sql = generateMigrationSQL(diff, dialect, opts, [currTable]);

        expect(sql).toContain('ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);');
      },
    );

    it('uses SQLite recreate-table migration for column unique changes', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'users',
        columns: [col({ name: 'email', unique: true })],
      });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        modifiedColumns: [{
          columnName: 'email',
          prev: col({ name: 'email', unique: false }),
          curr: col({ name: 'email', unique: true }),
          changes: ['unique: false → true'],
        }],
      })];

      const sql = generateMigrationSQL(diff, 'sqlite', opts, [currTable]);

      expect(sql).toContain('-- Modify columns (SQLite recreate-table)');
      expect(sql).toContain('CREATE TABLE _temp_users');
      expect(sql).toContain('UNIQUE (email)');
      expect(sql).not.toContain('ADD CONSTRAINT uq_users_email');
    });

    it('drops a single-column unique constraint when column unique changes to false', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'users',
        columns: [col({ name: 'email', unique: false })],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'users',
        tableName: 'users',
        modifiedColumns: [{
          columnName: 'email',
          prev: col({ name: 'email', unique: true }),
          curr: col({ name: 'email', unique: false }),
          changes: ['unique: true → false'],
        }],
      })];

      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);

      expect(sql).toContain('-- Drop indexes / unique keys');
      expect(sql).toContain('ALTER TABLE users DROP CONSTRAINT uq_users_email;');
    });

    it('exports column unique changes and added indexes from the same diff', () => {
      const diff = emptyDiff();
      const currTable = table({
        name: 'tUser',
        columns: [
          col({ id: 'Login_Id', name: 'Login_Id', unique: true }),
          col({ id: 'User_No', name: 'User_No', type: 'INT' }),
          col({ id: 'Status', name: 'Status' }),
        ],
      });
      diff.modifiedTables = [tableDiff({
        tableId: 'tUser',
        tableName: 'tUser',
        modifiedColumns: [{
          columnName: 'Login_Id',
          prev: col({ id: 'Login_Id', name: 'Login_Id', unique: false }),
          curr: col({ id: 'Login_Id', name: 'Login_Id', unique: true }),
          changes: ['unique: false → true'],
        }],
        addedIndexes: [
          { id: 'idx1', columnIds: ['User_No'], name: 'NCX_tUser_1', unique: false },
          { id: 'idx2', columnIds: ['Status'], name: 'NCX_tUser_2', unique: false },
        ],
      })];

      const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);

      expect(sql).toContain('CREATE INDEX NCX_tUser_1 ON tUser (User_No);');
      expect(sql).toContain('CREATE INDEX NCX_tUser_2 ON tUser (Status);');
      expect(sql).toContain('ALTER TABLE tUser ADD CONSTRAINT uq_tUser_Login_Id UNIQUE (Login_Id);');
    });

    it('exports migration SQL for real schema diff unique changes and added indexes', () => {
      const prevUser = table({
        id: 'existing-user-table',
        name: 'tUser',
        columns: [
          col({ id: 'login-id', name: 'Login_Id', unique: false }),
          col({ id: 'user-no', name: 'User_No', type: 'INT' }),
          col({ id: 'status', name: 'Status' }),
        ],
      });
      const currUser = table({
        id: 'imported-user-table',
        name: 'tUser',
        columns: [
          col({ id: 'login-id', name: 'Login_Id', unique: true }),
          col({ id: 'user-no', name: 'User_No', type: 'INT' }),
          col({ id: 'status', name: 'Status' }),
        ],
        indexes: [
          { id: 'idx1', columnIds: ['user-no'], name: 'NCX_tUser_1', unique: false },
          { id: 'idx2', columnIds: ['status'], name: 'NCX_tUser_2', unique: false },
        ],
      });
      const prevClient = table({
        id: 'existing-client-detail',
        name: 'tClientDetail',
        columns: [col({ id: 'original-coupon-no', name: 'Original_Coupon_No', type: 'INT', nullable: false, unique: false })],
      });
      const currClient = table({
        id: 'imported-client-detail',
        name: 'tClientDetail',
        columns: [col({ id: 'original-coupon-no', name: 'Original_Coupon_No', type: 'INT', nullable: false, unique: true })],
      });
      const currTables = [currUser, currClient];
      const diff = diffSchemas(schema([prevUser, prevClient]), schema(currTables));

      expect(diff.modifiedTables).toHaveLength(2);

      const sql = generateMigrationSQL(diff, 'mssql', opts, currTables);

      expect(sql).not.toBe('');
      expect(sql).toContain('ALTER TABLE tUser ADD CONSTRAINT uq_tUser_Login_Id UNIQUE (Login_Id);');
      expect(sql).toContain('ALTER TABLE tClientDetail ADD CONSTRAINT uq_tClientDetail_Original_Coupon_No UNIQUE (Original_Coupon_No);');
      expect(sql).toContain('CREATE INDEX NCX_tUser_1 ON tUser (User_No);');
      expect(sql).toContain('CREATE INDEX NCX_tUser_2 ON tUser (Status);');
    });

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

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
  // ── ADD COLUMN ──
  describe('ADD COLUMN', () => {
    it('adds a single column', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'id' }), col({ name: 'email', type: 'VARCHAR', length: 255 })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        addedColumns: [col({ name: 'email', type: 'VARCHAR', length: 255 })],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE users ADD COLUMN email VARCHAR(255);');
    });

    it('adds NOT NULL column with DEFAULT', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'active', type: 'BOOLEAN', nullable: false, defaultValue: 'true' })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        addedColumns: [col({ name: 'active', type: 'BOOLEAN', nullable: false, defaultValue: 'true' })],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('NOT NULL');
      expect(sql).toContain('DEFAULT true');
    });

    it('adds column with MSSQL DEFAULT wrapping', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'score', type: 'INT', nullable: false, defaultValue: '0' })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        addedColumns: [col({ name: 'score', type: 'INT', nullable: false, defaultValue: '0' })],
      })];
      const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
      expect(sql).toContain('DEFAULT (0)');
    });

    it('adds multiple columns', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [
        col({ name: 'phone' }),
        col({ name: 'address', type: 'TEXT' }),
      ]});
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        addedColumns: [
          col({ name: 'phone' }),
          col({ name: 'address', type: 'TEXT' }),
        ],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('ADD COLUMN phone');
      expect(sql).toContain('ADD COLUMN address');
    });
  });

  // ── DROP COLUMN ──
  describe('DROP COLUMN', () => {
    it('drops column in MySQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'id' })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedColumns: [col({ name: 'old_field' })],
      })];
      const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE users DROP COLUMN old_field;');
    });

    it('drops column in PostgreSQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'id' })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedColumns: [col({ name: 'legacy' })],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE users DROP COLUMN legacy;');
    });

    it('drops column in MSSQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [col({ name: 'id' })] });
      diff.modifiedTables = [tableDiff({
        tableName: 'users',
        removedColumns: [col({ name: 'temp' })],
      })];
      const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE users DROP COLUMN temp;');
    });

    it('uses recreate-table pattern for SQLite', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'users', columns: [
        col({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        col({ name: 'name', type: 'VARCHAR' }),
      ]});
      diff.modifiedTables = [tableDiff({
        tableId: 'users',
        tableName: 'users',
        removedColumns: [col({ name: 'old_field' })],
      })];
      const sql = generateMigrationSQL(diff, 'sqlite', opts, [currTable]);
      expect(sql).toContain('PRAGMA foreign_keys=off;');
      expect(sql).toContain('BEGIN TRANSACTION;');
      expect(sql).toContain('CREATE TABLE _temp_users');
      expect(sql).toContain('INSERT INTO _temp_users');
      expect(sql).toContain('DROP TABLE users;');
      expect(sql).toContain('ALTER TABLE _temp_users RENAME TO users;');
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain('PRAGMA foreign_keys=on;');
    });
  });

  // ── ALTER COLUMN ──
  describe('ALTER COLUMN', () => {
    describe('MySQL / MariaDB', () => {
      it('modifies column type', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'bio', type: 'TEXT' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'bio',
            prev: col({ name: 'bio', type: 'VARCHAR', length: 255 }),
            curr: col({ name: 'bio', type: 'TEXT' }),
            changes: ['type: VARCHAR → TEXT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
        expect(sql).toContain('MODIFY COLUMN bio TEXT');
      });

      it('modifies column with AUTO_INCREMENT', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'items', columns: [col({ name: 'id', type: 'BIGINT', autoIncrement: true, nullable: false })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'items',
          modifiedColumns: [{
            columnName: 'id',
            prev: col({ name: 'id', type: 'INT', autoIncrement: true, nullable: false }),
            curr: col({ name: 'id', type: 'BIGINT', autoIncrement: true, nullable: false }),
            changes: ['type: INT → BIGINT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
        expect(sql).toContain('MODIFY COLUMN');
        expect(sql).toContain('BIGINT');
      });
    });

    describe('PostgreSQL', () => {
      it('changes column type with ALTER COLUMN ... TYPE', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'age', type: 'BIGINT' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'age',
            prev: col({ name: 'age', type: 'INT' }),
            curr: col({ name: 'age', type: 'BIGINT' }),
            changes: ['type: INT → BIGINT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER TABLE users ALTER COLUMN age TYPE BIGINT;');
      });

      it('sets NOT NULL', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'email', type: 'VARCHAR', nullable: false })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'email',
            prev: col({ name: 'email', type: 'VARCHAR', nullable: true }),
            curr: col({ name: 'email', type: 'VARCHAR', nullable: false }),
            changes: ['nullable: true → false'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER COLUMN email SET NOT NULL;');
      });

      it('drops NOT NULL', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'email', type: 'VARCHAR', nullable: true })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'email',
            prev: col({ name: 'email', type: 'VARCHAR', nullable: false }),
            curr: col({ name: 'email', type: 'VARCHAR', nullable: true }),
            changes: ['nullable: false → true'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER COLUMN email DROP NOT NULL;');
      });

      it('sets default value', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'score', type: 'INT', defaultValue: '0' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'score',
            prev: col({ name: 'score', type: 'INT' }),
            curr: col({ name: 'score', type: 'INT', defaultValue: '0' }),
            changes: ['default: - → 0'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER COLUMN score SET DEFAULT 0;');
      });

      it('drops default value', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'score', type: 'INT' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'score',
            prev: col({ name: 'score', type: 'INT', defaultValue: '0' }),
            curr: col({ name: 'score', type: 'INT' }),
            changes: ['default: 0 → -'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER COLUMN score DROP DEFAULT;');
      });

      it('handles combined type + nullable change', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'age', type: 'BIGINT', nullable: false })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'age',
            prev: col({ name: 'age', type: 'INT', nullable: true }),
            curr: col({ name: 'age', type: 'BIGINT', nullable: false }),
            changes: ['type: INT → BIGINT', 'nullable: true → false'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('ALTER COLUMN age TYPE BIGINT;');
        expect(sql).toContain('ALTER COLUMN age SET NOT NULL;');
      });
    });

    describe('Oracle', () => {
      it('uses MODIFY syntax', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'name', type: 'VARCHAR', length: 500 })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'name',
            prev: col({ name: 'name', type: 'VARCHAR', length: 255 }),
            curr: col({ name: 'name', type: 'VARCHAR', length: 500 }),
            changes: ['length: 255 → 500'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'oracle', opts, [currTable]);
        expect(sql).toContain('MODIFY (name VARCHAR2(500))');
      });
    });

    describe('MSSQL', () => {
      it('uses ALTER COLUMN syntax', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'bio', type: 'TEXT' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'bio',
            prev: col({ name: 'bio', type: 'VARCHAR', length: 255 }),
            curr: col({ name: 'bio', type: 'TEXT' }),
            changes: ['type: VARCHAR → TEXT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
        expect(sql).toContain('ALTER TABLE users ALTER COLUMN bio NVARCHAR(MAX)');
      });

      it('uses bracket quoting with default options', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'age', type: 'BIGINT' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'age',
            prev: col({ name: 'age', type: 'INT' }),
            curr: col({ name: 'age', type: 'BIGINT' }),
            changes: ['type: INT → BIGINT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mssql');
        expect(sql).toContain('[users]');
        expect(sql).toContain('[age]');
      });

      it('adds DEFAULT with FOR clause', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'active', type: 'BOOLEAN', defaultValue: '1' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'active',
            prev: col({ name: 'active', type: 'BOOLEAN' }),
            curr: col({ name: 'active', type: 'BOOLEAN', defaultValue: '1' }),
            changes: ['default: - → 1'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
        expect(sql).toContain('ADD DEFAULT (1) FOR active;');
      });
    });

    describe('H2', () => {
      it('uses ALTER COLUMN with full definition', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'name', type: 'VARCHAR', length: 500 })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'name',
            prev: col({ name: 'name', type: 'VARCHAR', length: 255 }),
            curr: col({ name: 'name', type: 'VARCHAR', length: 500 }),
            changes: ['length: 255 → 500'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'h2', opts, [currTable]);
        expect(sql).toContain('ALTER TABLE users ALTER COLUMN name VARCHAR(500);');
      });
    });

    describe('SQLite', () => {
      it('uses recreate-table pattern for column modification', () => {
        const diff = emptyDiff();
        const currTable = table({
          name: 'users',
          columns: [
            col({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            col({ name: 'name', type: 'TEXT' }),
          ],
        });
        diff.modifiedTables = [tableDiff({
          tableId: 'users',
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'name',
            prev: col({ name: 'name', type: 'VARCHAR' }),
            curr: col({ name: 'name', type: 'TEXT' }),
            changes: ['type: VARCHAR → TEXT'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'sqlite', opts, [currTable]);
        expect(sql).toContain('PRAGMA foreign_keys=off;');
        expect(sql).toContain('_temp_users');
        expect(sql).toContain('PRAGMA foreign_keys=on;');
      });
    });

    describe('Column rename', () => {
      it('renames column in PostgreSQL', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'email_address', type: 'VARCHAR' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'email_address',
            prev: col({ name: 'email', type: 'VARCHAR' }),
            curr: col({ name: 'email_address', type: 'VARCHAR' }),
            changes: ['name: email → email_address'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
        expect(sql).toContain('RENAME COLUMN email TO email_address;');
      });

      it('renames column in MSSQL with sp_rename', () => {
        const diff = emptyDiff();
        const currTable = table({ name: 'users', columns: [col({ name: 'email_address', type: 'VARCHAR' })] });
        diff.modifiedTables = [tableDiff({
          tableName: 'users',
          modifiedColumns: [{
            columnName: 'email_address',
            prev: col({ name: 'email', type: 'VARCHAR' }),
            curr: col({ name: 'email_address', type: 'VARCHAR' }),
            changes: ['name: email → email_address'],
          }],
        })];
        const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
        expect(sql).toContain("EXEC sp_rename 'users.email', 'email_address', 'COLUMN';");
      });
    });
  });
});

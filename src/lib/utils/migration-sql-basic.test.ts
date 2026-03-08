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
  describe('empty diff', () => {
    it('returns empty string for no changes', () => {
      const result = generateMigrationSQL(emptyDiff(), 'postgresql', opts);
      expect(result).toBe('');
    });
  });

  // ── DROP TABLE ──
  describe('DROP TABLE', () => {
    it('drops a single table', () => {
      const diff = emptyDiff();
      diff.removedTables = [table({ name: 'users', columns: [] })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      expect(sql).toContain('DROP TABLE users;');
    });

    it('drops multiple tables', () => {
      const diff = emptyDiff();
      diff.removedTables = [
        table({ name: 'users', columns: [] }),
        table({ name: 'orders', columns: [] }),
      ];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      expect(sql).toContain('DROP TABLE users;');
      expect(sql).toContain('DROP TABLE orders;');
    });

    it('uses schema-qualified name for PostgreSQL', () => {
      const diff = emptyDiff();
      diff.removedTables = [table({ name: 'users', columns: [], schema: 'auth' })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      expect(sql).toContain('DROP TABLE auth.users;');
    });

    it('uses bracket quoting for MSSQL', () => {
      const diff = emptyDiff();
      diff.removedTables = [table({ name: 'users', columns: [] })];
      const sql = generateMigrationSQL(diff, 'mssql');
      expect(sql).toContain('DROP TABLE [users];');
    });

    it('drops FK constraints from removed tables before dropping', () => {
      const refTable = table({ name: 'orders', columns: [col({ name: 'id', primaryKey: true })] });
      const srcTable = table({
        name: 'items',
        columns: [col({ name: 'order_id' })],
        foreignKeys: [{
          id: 'fk1', columnIds: ['order_id'], referencedTableId: 'orders',
          referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'CASCADE',
        }],
      });
      const diff = emptyDiff();
      diff.removedTables = [srcTable];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(sql.indexOf('DROP TABLE'));
    });
  });

  // ── CREATE TABLE ──
  describe('CREATE TABLE', () => {
    it('creates a simple table', () => {
      const diff = emptyDiff();
      diff.addedTables = [table({
        name: 'products',
        columns: [
          col({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          col({ name: 'name', type: 'VARCHAR', length: 100 }),
        ],
      })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts);
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('products');
      expect(sql).toContain('id');
      expect(sql).toContain('name');
    });

    it('creates table with MySQL syntax', () => {
      const diff = emptyDiff();
      diff.addedTables = [table({
        name: 'items',
        columns: [col({ name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true })],
      })];
      const sql = generateMigrationSQL(diff, 'mysql', { quoteStyle: 'backtick' });
      expect(sql).toContain('`items`');
      expect(sql).toContain('AUTO_INCREMENT');
    });
  });

  // ── RENAME TABLE ──
  describe('RENAME TABLE', () => {
    it('renames table in MySQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'articles', columns: [] });
      diff.modifiedTables = [tableDiff({ tableName: 'articles', prevName: 'posts' })];
      const sql = generateMigrationSQL(diff, 'mysql', opts, [currTable]);
      expect(sql).toContain('RENAME TABLE posts TO articles;');
    });

    it('renames table in PostgreSQL', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'articles', columns: [] });
      diff.modifiedTables = [tableDiff({ tableName: 'articles', prevName: 'posts' })];
      const sql = generateMigrationSQL(diff, 'postgresql', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE posts RENAME TO articles;');
    });

    it('renames table in MSSQL with sp_rename', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'articles', columns: [] });
      diff.modifiedTables = [tableDiff({ tableName: 'articles', prevName: 'posts' })];
      const sql = generateMigrationSQL(diff, 'mssql', opts, [currTable]);
      expect(sql).toContain("EXEC sp_rename 'posts', 'articles';");
    });

    it('renames table in Oracle', () => {
      const diff = emptyDiff();
      const currTable = table({ name: 'articles', columns: [] });
      diff.modifiedTables = [tableDiff({ tableName: 'articles', prevName: 'posts' })];
      const sql = generateMigrationSQL(diff, 'oracle', opts, [currTable]);
      expect(sql).toContain('ALTER TABLE posts RENAME TO articles;');
    });
  });
});

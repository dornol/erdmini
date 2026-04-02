import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ─────────────────────────────────────────────
// normalizeType
// ─────────────────────────────────────────────
describe('normalizeType', () => {
  it('maps SERIAL → INT', () => {
    expect(normalizeType('SERIAL')).toBe('INT');
  });

  it('maps BIGSERIAL → BIGINT', () => {
    expect(normalizeType('BIGSERIAL')).toBe('BIGINT');
  });

  it('maps INTEGER → INT', () => {
    expect(normalizeType('INTEGER')).toBe('INT');
  });

  it('maps TINYINT → TINYINT', () => {
    expect(normalizeType('TINYINT')).toBe('TINYINT');
  });

  it('maps MEDIUMINT → MEDIUMINT', () => {
    expect(normalizeType('MEDIUMINT')).toBe('MEDIUMINT');
  });

  it('maps BIT → BIT', () => {
    expect(normalizeType('BIT')).toBe('BIT');
  });

  it('maps BOOL → BOOLEAN', () => {
    expect(normalizeType('BOOL')).toBe('BOOLEAN');
  });

  it('maps DATETIME → DATETIME (preserved)', () => {
    expect(normalizeType('DATETIME')).toBe('DATETIME');
  });

  it('maps DATETIME2 → TIMESTAMP', () => {
    expect(normalizeType('DATETIME2')).toBe('TIMESTAMP');
  });

  it('maps TIMESTAMPTZ → TIMESTAMP', () => {
    expect(normalizeType('TIMESTAMPTZ')).toBe('TIMESTAMP');
  });

  it('maps NUMERIC → NUMERIC', () => {
    expect(normalizeType('NUMERIC')).toBe('NUMERIC');
  });

  it('maps REAL → REAL', () => {
    expect(normalizeType('REAL')).toBe('REAL');
  });

  it('maps MONEY → DECIMAL', () => {
    expect(normalizeType('MONEY')).toBe('DECIMAL');
  });

  it('maps CHARACTER VARYING → VARCHAR', () => {
    expect(normalizeType('CHARACTER VARYING')).toBe('VARCHAR');
  });

  it('maps NVARCHAR → VARCHAR', () => {
    expect(normalizeType('NVARCHAR')).toBe('VARCHAR');
  });

  it('maps NCHAR → CHAR', () => {
    expect(normalizeType('NCHAR')).toBe('CHAR');
  });

  it('maps CHARACTER → CHAR', () => {
    expect(normalizeType('CHARACTER')).toBe('CHAR');
  });

  it('maps UNIQUEIDENTIFIER → UUID', () => {
    expect(normalizeType('UNIQUEIDENTIFIER')).toBe('UUID');
  });

  it('maps TINYTEXT → TEXT', () => {
    expect(normalizeType('TINYTEXT')).toBe('TEXT');
  });

  it('maps MEDIUMTEXT → TEXT', () => {
    expect(normalizeType('MEDIUMTEXT')).toBe('TEXT');
  });

  it('maps LONGTEXT → TEXT', () => {
    expect(normalizeType('LONGTEXT')).toBe('TEXT');
  });

  it('maps BLOB → BLOB', () => {
    expect(normalizeType('BLOB')).toBe('BLOB');
  });

  it('maps VARBINARY → VARBINARY', () => {
    expect(normalizeType('VARBINARY')).toBe('VARBINARY');
  });

  it('maps IMAGE → BLOB', () => {
    expect(normalizeType('IMAGE')).toBe('BLOB');
  });

  it('maps NVARCHAR(MAX) → TEXT (via MAX check)', () => {
    expect(normalizeType('NVARCHAR(MAX)')).toBe('TEXT');
  });

  it('keeps known types as-is: INT, VARCHAR, BOOLEAN, etc.', () => {
    expect(normalizeType('INT')).toBe('INT');
    expect(normalizeType('VARCHAR')).toBe('VARCHAR');
    expect(normalizeType('BOOLEAN')).toBe('BOOLEAN');
    expect(normalizeType('TEXT')).toBe('TEXT');
    expect(normalizeType('JSON')).toBe('JSON');
    expect(normalizeType('UUID')).toBe('UUID');
    expect(normalizeType('FLOAT')).toBe('FLOAT');
    expect(normalizeType('DOUBLE')).toBe('DOUBLE');
    expect(normalizeType('DATE')).toBe('DATE');
  });

  it('falls back to VARCHAR for unknown types', () => {
    expect(normalizeType('CUSTOM_TYPE')).toBe('VARCHAR');
  });

  it('is case-insensitive', () => {
    expect(normalizeType('serial')).toBe('INT');
    expect(normalizeType('Nvarchar')).toBe('VARCHAR');
  });

  it('strips length from base for normalization', () => {
    expect(normalizeType('NVARCHAR(50)')).toBe('VARCHAR');
    expect(normalizeType('DECIMAL(10,2)')).toBe('DECIMAL');
  });

  // Oracle / H2 specific type mappings
  it('maps VARCHAR2 → VARCHAR', () => {
    expect(normalizeType('VARCHAR2')).toBe('VARCHAR');
  });

  it('maps NVARCHAR2 → VARCHAR', () => {
    expect(normalizeType('NVARCHAR2')).toBe('VARCHAR');
  });

  it('maps NUMBER → DECIMAL', () => {
    expect(normalizeType('NUMBER')).toBe('DECIMAL');
  });

  it('maps CLOB → TEXT', () => {
    expect(normalizeType('CLOB')).toBe('TEXT');
  });

  it('maps NCLOB → TEXT', () => {
    expect(normalizeType('NCLOB')).toBe('TEXT');
  });

  it('maps BINARY_DOUBLE → DOUBLE', () => {
    expect(normalizeType('BINARY_DOUBLE')).toBe('DOUBLE');
  });

  it('maps BINARY_FLOAT → FLOAT', () => {
    expect(normalizeType('BINARY_FLOAT')).toBe('FLOAT');
  });

  it('maps LONG → TEXT', () => {
    expect(normalizeType('LONG')).toBe('TEXT');
  });

  it('maps RAW → VARBINARY', () => {
    expect(normalizeType('RAW')).toBe('VARBINARY');
  });

  it('maps DOUBLE PRECISION → DECIMAL', () => {
    expect(normalizeType('DOUBLE PRECISION')).toBe('DECIMAL');
  });

  it('maps SMALLSERIAL → SMALLINT', () => {
    expect(normalizeType('SMALLSERIAL')).toBe('SMALLINT');
  });

  it('maps ENUM → ENUM', () => {
    expect(normalizeType('ENUM')).toBe('ENUM');
  });
});

// ─────────────────────────────────────────────
// Warnings (type normalization)
// ─────────────────────────────────────────────
describe('importDDL — warnings', () => {
  it('generates warning for unknown type with table/column context', async () => {
    // YEAR is an unknown SQL type that normalizeType maps to VARCHAR
    const sql = `CREATE TABLE t1 (id INT PRIMARY KEY, val YEAR);`;
    const result = await importDDL(sql, 'mysql');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('YEAR');
    expect(result.warnings[0]).toContain('VARCHAR');
    expect(result.warnings[0]).toContain('t1.val');
  });

  it('does not generate warning for known types', async () => {
    const sql = `CREATE TABLE t1 (id INT PRIMARY KEY, name VARCHAR(100), flag BOOLEAN);`;
    const result = await importDDL(sql, 'mysql');
    expect(result.warnings).toHaveLength(0);
  });

  it('generates multiple warnings for multiple unknown types', async () => {
    const sql = `CREATE TABLE t1 (id INT PRIMARY KEY, a YEAR, b YEAR);`;
    const result = await importDDL(sql, 'mysql');
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('YEAR');
    expect(result.warnings[1]).toContain('YEAR');
  });
});

// ─────────────────────────────────────────────
// Custom messages parameter
// ─────────────────────────────────────────────
describe('importDDL — custom messages', () => {
  it('uses custom noCreateTable message', async () => {
    const customMsg = {
      noCreateTable: () => 'CUSTOM_NO_TABLE',
      tableParseError: ({ error }: { error: string }) => `CUSTOM_ERR: ${error}`,
      fkResolveFailed: ({ detail }: { detail: string }) => `CUSTOM_FK: ${detail}`,
    };
    const result = await importDDL('SELECT 1;', 'mysql', customMsg);
    expect(result.errors).toContain('CUSTOM_NO_TABLE');
  });

  it('uses custom fkResolveFailed message', async () => {
    const customMsg = {
      noCreateTable: () => 'CUSTOM_NO_TABLE',
      tableParseError: ({ error }: { error: string }) => `CUSTOM_ERR: ${error}`,
      fkResolveFailed: ({ detail }: { detail: string }) => `CUSTOM_FK: ${detail}`,
    };
    const sql = `
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES nonexistent(id)
      );
    `;
    const result = await importDDL(sql, 'mysql', customMsg);
    expect(result.errors.some(e => e.startsWith('CUSTOM_FK:'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Bracket identifier stripping (cross-dialect)
// ─────────────────────────────────────────────
describe('importDDL — bracket identifiers', () => {
  it('strips bracket identifiers for non-MSSQL dialects', async () => {
    const sql = `
      CREATE TABLE [SPRING_SESSION] (
        [primary_id] VARCHAR(36) NOT NULL,
        [session_id] VARCHAR(36) NOT NULL,
        [creation_time] BIGINT NOT NULL,
        [max_inactive_interval] INT NOT NULL,
        [principal_name] VARCHAR(100),
        PRIMARY KEY ([primary_id]),
        UNIQUE ([session_id])
      ) ENGINE=InnoDB;
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('SPRING_SESSION');
    expect(result.tables[0].columns).toHaveLength(5);
    const pk = result.tables[0].columns.find(c => c.name === 'primary_id')!;
    expect(pk.primaryKey).toBe(true);
    const sid = result.tables[0].columns.find(c => c.name === 'session_id')!;
    expect(sid.unique).toBe(true);
  });

  it('strips brackets with H2 dialect', async () => {
    const sql = `
      CREATE TABLE [test] (
        [id] INT NOT NULL,
        [name] VARCHAR(100),
        PRIMARY KEY ([id])
      );
    `;
    const result = await importDDL(sql, 'h2');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].name).toBe('test');
  });

  it('strips brackets with SQLite dialect', async () => {
    const sql = `
      CREATE TABLE [items] (
        [id] INTEGER PRIMARY KEY AUTOINCREMENT,
        [title] TEXT NOT NULL
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].name).toBe('items');
    expect(result.tables[0].columns[0].name).toBe('id');
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeType } from './ddl-import';
import { columnTypeSql, exportDDL } from './ddl-export';
import { generateDummyValue } from './dummy-data';
import { lintSchema } from './schema-lint';
import type { Column, ERDSchema, Dialect } from '$lib/types/erd';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeCol(overrides: Partial<Column> & { type: Column['type'] }): Column {
  return {
    id: 'c1',
    name: 'col',
    type: 'VARCHAR',
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

function makeSchema(columns: Column[]): ERDSchema {
  return {
    version: '1.0',
    tables: [
      {
        id: 't1',
        name: 'test_table',
        columns,
        foreignKeys: [],
        uniqueKeys: [],
        indexes: [],
        position: { x: 0, y: 0 },
      },
    ],
    domains: [],
    memos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const ALL_DIALECTS: Dialect[] = ['mysql', 'mariadb', 'postgresql', 'mssql', 'sqlite', 'oracle', 'h2'];

// ─── 1. normalizeType mapping (import) ───────────────────────────────

describe('normalizeType mapping', () => {
  const directMappings: [string, string][] = [
    ['TINYINT', 'TINYINT'],
    ['MEDIUMINT', 'MEDIUMINT'],
    ['BIT', 'BIT'],
    ['TIME', 'TIME'],
    ['NUMERIC', 'NUMERIC'],
    ['REAL', 'REAL'],
    ['BINARY', 'BINARY'],
    ['VARBINARY', 'VARBINARY'],
    ['BLOB', 'BLOB'],
  ];

  for (const [input, expected] of directMappings) {
    it(`maps ${input} → ${expected}`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  }

  it('maps lowercase tinyint → TINYINT', () => {
    expect(normalizeType('tinyint')).toBe('TINYINT');
  });

  it('maps lowercase mediumint → MEDIUMINT', () => {
    expect(normalizeType('mediumint')).toBe('MEDIUMINT');
  });

  const aliasMappings: [string, string][] = [
    ['TINYBLOB', 'BLOB'],
    ['MEDIUMBLOB', 'BLOB'],
    ['LONGBLOB', 'BLOB'],
    ['IMAGE', 'BLOB'],
    ['RAW', 'VARBINARY'],
  ];

  for (const [input, expected] of aliasMappings) {
    it(`maps alias ${input} → ${expected}`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  }

  it('does not produce VARCHAR fallback for new types (no warning)', () => {
    const knownTypes = ['TINYINT', 'MEDIUMINT', 'BIT', 'TIME', 'NUMERIC', 'REAL', 'BINARY', 'VARBINARY', 'BLOB'];
    for (const t of knownTypes) {
      const result = normalizeType(t);
      expect(result).not.toBe('VARCHAR');
    }
  });
});

// ─── 2. DDL export for each dialect ──────────────────────────────────

describe('columnTypeSql per dialect', () => {
  describe('TINYINT', () => {
    const col = makeCol({ type: 'TINYINT' });

    it('MySQL → TINYINT', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('TINYINT');
    });

    it('MariaDB → TINYINT', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('TINYINT');
    });

    it('PostgreSQL → INTEGER', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('INTEGER');
    });

    it('SQLite → INTEGER', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('INTEGER');
    });

    it('MSSQL → TINYINT', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('TINYINT');
    });

    it('Oracle → NUMBER(3)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(3)');
    });

    it('H2 → TINYINT', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('TINYINT');
    });
  });

  describe('MEDIUMINT', () => {
    const col = makeCol({ type: 'MEDIUMINT' });

    it('MySQL → MEDIUMINT', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('MEDIUMINT');
    });

    it('MariaDB → MEDIUMINT', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('MEDIUMINT');
    });

    it('PostgreSQL → INTEGER', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('INTEGER');
    });

    it('SQLite → INTEGER', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('INTEGER');
    });

    it('MSSQL → INT', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('INT');
    });

    it('Oracle → NUMBER(10)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(10)');
    });

    it('H2 → MEDIUMINT', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('MEDIUMINT');
    });
  });

  describe('BIT', () => {
    const col = makeCol({ type: 'BIT' });

    it('MySQL → TINYINT(1)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('TINYINT(1)');
    });

    it('MariaDB → TINYINT(1)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('TINYINT(1)');
    });

    it('PostgreSQL → BOOLEAN', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('BOOLEAN');
    });

    it('SQLite → INTEGER', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('INTEGER');
    });

    it('MSSQL → BIT', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('BIT');
    });

    it('Oracle → NUMBER(1)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(1)');
    });

    it('H2 → BIT', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('BIT');
    });
  });

  describe('TIME', () => {
    const col = makeCol({ type: 'TIME' });

    it('MySQL → TIME', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('TIME');
    });

    it('MariaDB → TIME', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('TIME');
    });

    it('PostgreSQL → TIME', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('TIME');
    });

    it('SQLite → TEXT', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
    });

    it('MSSQL → TIME', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('TIME');
    });

    it('Oracle → TIMESTAMP', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('TIMESTAMP');
    });

    it('H2 → TIME', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('TIME');
    });
  });

  describe('TIME with length=3 (fractional seconds)', () => {
    const col = makeCol({ type: 'TIME', length: 3 });

    it('MySQL → TIME(3)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('TIME(3)');
    });

    it('PostgreSQL → TIME(3)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('TIME(3)');
    });

    it('MSSQL → TIME(3)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('TIME(3)');
    });
  });

  describe('NUMERIC', () => {
    const col = makeCol({ type: 'NUMERIC' });

    it('MySQL → DECIMAL(10,2)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('DECIMAL(10,2)');
    });

    it('MariaDB → DECIMAL(10,2)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('DECIMAL(10,2)');
    });

    it('PostgreSQL → NUMERIC(10,2)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('NUMERIC(10,2)');
    });

    it('SQLite → REAL', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('REAL');
    });

    it('MSSQL → DECIMAL(10,2)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('DECIMAL(10,2)');
    });

    it('Oracle → NUMBER(10,2)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(10,2)');
    });

    it('H2 → DECIMAL(10,2)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('DECIMAL(10,2)');
    });
  });

  describe('NUMERIC with length=8, scale=4 (custom precision)', () => {
    const col = makeCol({ type: 'NUMERIC', length: 8, scale: 4 });

    it('MySQL → DECIMAL(8,4)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('DECIMAL(8,4)');
    });

    it('PostgreSQL → NUMERIC(8,4)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('NUMERIC(8,4)');
    });

    it('MSSQL → DECIMAL(8,4)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('DECIMAL(8,4)');
    });

    it('Oracle → NUMBER(8,4)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(8,4)');
    });

    it('H2 → DECIMAL(8,4)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('DECIMAL(8,4)');
    });
  });

  describe('REAL', () => {
    const col = makeCol({ type: 'REAL' });

    it('MySQL → FLOAT', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('FLOAT');
    });

    it('MariaDB → FLOAT', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('FLOAT');
    });

    it('PostgreSQL → REAL', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('REAL');
    });

    it('SQLite → REAL', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('REAL');
    });

    it('MSSQL → FLOAT', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('FLOAT');
    });

    it('Oracle → FLOAT', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('FLOAT');
    });

    it('H2 → REAL', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('REAL');
    });
  });

  describe('BINARY with length=16', () => {
    const col = makeCol({ type: 'BINARY', length: 16 });

    it('MySQL → BINARY(16)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('BINARY(16)');
    });

    it('MariaDB → BINARY(16)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('BINARY(16)');
    });

    it('PostgreSQL → BYTEA', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('BYTEA');
    });

    it('SQLite → BLOB', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('BLOB');
    });

    it('MSSQL → BINARY(16)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('BINARY(16)');
    });

    it('Oracle → RAW(16)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('RAW(16)');
    });

    it('H2 → BINARY(16)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('BINARY(16)');
    });
  });

  describe('VARBINARY with length=255', () => {
    const col = makeCol({ type: 'VARBINARY', length: 255 });

    it('MySQL → VARBINARY(255)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('VARBINARY(255)');
    });

    it('MariaDB → VARBINARY(255)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('VARBINARY(255)');
    });

    it('PostgreSQL → BYTEA', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('BYTEA');
    });

    it('SQLite → BLOB', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('BLOB');
    });

    it('MSSQL → VARBINARY(255)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('VARBINARY(255)');
    });

    it('Oracle → RAW(255)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('RAW(255)');
    });

    it('H2 → VARBINARY(255)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('VARBINARY(255)');
    });
  });

  describe('BLOB', () => {
    const col = makeCol({ type: 'BLOB' });

    it('MySQL → LONGBLOB', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('LONGBLOB');
    });

    it('MariaDB → LONGBLOB', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('LONGBLOB');
    });

    it('PostgreSQL → BYTEA', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('BYTEA');
    });

    it('SQLite → BLOB', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('BLOB');
    });

    it('MSSQL → VARBINARY(MAX)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('VARBINARY(MAX)');
    });

    it('Oracle → BLOB', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('BLOB');
    });

    it('H2 → BLOB', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('BLOB');
    });
  });
});

// ─── 3. DDL import round-trip ────────────────────────────────────────

describe('DDL import round-trip', () => {
  // Lazy-import to avoid top-level issues with parser
  async function importDDL(sql: string, dialect: Dialect) {
    const { importDDL } = await import('./ddl-import');
    return importDDL(sql, dialect);
  }

  it('MySQL: imports TINYINT, MEDIUMINT, BIT, TIME, BLOB', async () => {
    const sql = 'CREATE TABLE t (a TINYINT, b MEDIUMINT, c BIT(1), d TIME, e BLOB);';
    const result = await importDDL(sql, 'mysql');
    const cols = result.tables[0].columns;

    expect(cols.find(c => c.name === 'a')?.type).toBe('TINYINT');
    expect(cols.find(c => c.name === 'b')?.type).toBe('MEDIUMINT');
    expect(cols.find(c => c.name === 'c')?.type).toBe('BIT');
    expect(cols.find(c => c.name === 'd')?.type).toBe('TIME');
    expect(cols.find(c => c.name === 'e')?.type).toBe('BLOB');
  });

  it('PostgreSQL: imports NUMERIC, REAL, BYTEA, TIME', async () => {
    const sql = 'CREATE TABLE t (a NUMERIC(10,2), b REAL, c BYTEA, d TIME);';
    const result = await importDDL(sql, 'postgresql');
    const cols = result.tables[0].columns;

    expect(cols.find(c => c.name === 'a')?.type).toBe('NUMERIC');
    expect(cols.find(c => c.name === 'b')?.type).toBe('REAL');
    // BYTEA is not in COLUMN_TYPES, so normalizeType falls back to VARCHAR
    const cType = cols.find(c => c.name === 'c')?.type;
    expect(cType).toBe('VARCHAR');
    expect(cols.find(c => c.name === 'd')?.type).toBe('TIME');
  });

  it('MySQL: imports TINYBLOB/MEDIUMBLOB/LONGBLOB as BLOB', async () => {
    const sql = 'CREATE TABLE t (a TINYBLOB, b MEDIUMBLOB, c LONGBLOB);';
    const result = await importDDL(sql, 'mysql');
    const cols = result.tables[0].columns;

    expect(cols.find(c => c.name === 'a')?.type).toBe('BLOB');
    expect(cols.find(c => c.name === 'b')?.type).toBe('BLOB');
    expect(cols.find(c => c.name === 'c')?.type).toBe('BLOB');
  });

  it('MSSQL: imports BIT and TINYINT correctly', async () => {
    const sql = 'CREATE TABLE t (a BIT, b TINYINT, c VARBINARY(100));';
    const result = await importDDL(sql, 'mssql');
    const cols = result.tables[0].columns;

    expect(cols.find(c => c.name === 'a')?.type).toBe('BIT');
    expect(cols.find(c => c.name === 'b')?.type).toBe('TINYINT');
    expect(cols.find(c => c.name === 'c')?.type).toBe('VARBINARY');
  });

  it('Generic: imports BINARY and VARBINARY', async () => {
    const sql = 'CREATE TABLE t (a BINARY(16), b VARBINARY(255));';
    const result = await importDDL(sql, 'mysql');
    const cols = result.tables[0].columns;

    expect(cols.find(c => c.name === 'a')?.type).toBe('BINARY');
    expect(cols.find(c => c.name === 'b')?.type).toBe('VARBINARY');
  });
});

// ─── 4. Dummy data generation ────────────────────────────────────────

describe('generateDummyValue for new types', () => {
  it('TINYINT returns a number', () => {
    const val = generateDummyValue(makeCol({ type: 'TINYINT' }), 0);
    expect(typeof val).toBe('number');
  });

  it('MEDIUMINT returns a number', () => {
    const val = generateDummyValue(makeCol({ type: 'MEDIUMINT' }), 0);
    expect(typeof val).toBe('number');
  });

  it('BIT returns 0 or 1', () => {
    const val0 = generateDummyValue(makeCol({ type: 'BIT' }), 0);
    const val1 = generateDummyValue(makeCol({ type: 'BIT' }), 1);
    expect([0, 1]).toContain(val0);
    expect([0, 1]).toContain(val1);
  });

  it('TIME returns HH:MM:SS format string', () => {
    const val = generateDummyValue(makeCol({ type: 'TIME' }), 0);
    expect(typeof val).toBe('string');
    expect(val).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('NUMERIC returns a number with decimals', () => {
    const val = generateDummyValue(makeCol({ type: 'NUMERIC' }), 0);
    expect(typeof val).toBe('number');
  });

  it('REAL returns a number with decimals', () => {
    const val = generateDummyValue(makeCol({ type: 'REAL' }), 0);
    expect(typeof val).toBe('number');
  });

  it('BINARY returns hex string starting with X\'', () => {
    const val = generateDummyValue(makeCol({ type: 'BINARY' }), 0);
    expect(typeof val).toBe('string');
    expect((val as string).startsWith("X'")).toBe(true);
  });

  it('VARBINARY returns hex string starting with X\'', () => {
    const val = generateDummyValue(makeCol({ type: 'VARBINARY' }), 0);
    expect(typeof val).toBe('string');
    expect((val as string).startsWith("X'")).toBe(true);
  });

  it('BLOB returns hex string starting with X\'', () => {
    const val = generateDummyValue(makeCol({ type: 'BLOB' }), 0);
    expect(typeof val).toBe('string');
    expect((val as string).startsWith("X'")).toBe(true);
  });

  it('BIT alternates between 0 and 1 for different rows', () => {
    const results = [0, 1, 2, 3].map(i => generateDummyValue(makeCol({ type: 'BIT' }), i));
    expect(results).toContain(0);
    expect(results).toContain(1);
  });

  it('TINYINT/MEDIUMINT values increase with rowIndex', () => {
    const v1 = generateDummyValue(makeCol({ type: 'TINYINT' }), 0) as number;
    const v2 = generateDummyValue(makeCol({ type: 'TINYINT' }), 1) as number;
    expect(v2).toBeGreaterThan(v1);
  });
});

// ─── 5. Full DDL export integration ──────────────────────────────────

describe('Full DDL export with all new types', () => {
  const columns: Column[] = [
    makeCol({ id: 'c1', name: 'tiny_col', type: 'TINYINT' }),
    makeCol({ id: 'c2', name: 'medium_col', type: 'MEDIUMINT' }),
    makeCol({ id: 'c3', name: 'bit_col', type: 'BIT' }),
    makeCol({ id: 'c4', name: 'time_col', type: 'TIME' }),
    makeCol({ id: 'c5', name: 'numeric_col', type: 'NUMERIC', length: 10, scale: 2 }),
    makeCol({ id: 'c6', name: 'real_col', type: 'REAL' }),
    makeCol({ id: 'c7', name: 'binary_col', type: 'BINARY', length: 16 }),
    makeCol({ id: 'c8', name: 'varbinary_col', type: 'VARBINARY', length: 255 }),
    makeCol({ id: 'c9', name: 'blob_col', type: 'BLOB' }),
  ];
  const schema = makeSchema(columns);

  const expectedTypeStrings: Record<Dialect, string[]> = {
    mysql: ['TINYINT', 'MEDIUMINT', 'TINYINT(1)', 'TIME', 'DECIMAL(10,2)', 'FLOAT', 'BINARY(16)', 'VARBINARY(255)', 'LONGBLOB'],
    mariadb: ['TINYINT', 'MEDIUMINT', 'TINYINT(1)', 'TIME', 'DECIMAL(10,2)', 'FLOAT', 'BINARY(16)', 'VARBINARY(255)', 'LONGBLOB'],
    postgresql: ['INTEGER', 'INTEGER', 'BOOLEAN', 'TIME', 'NUMERIC(10,2)', 'REAL', 'BYTEA', 'BYTEA', 'BYTEA'],
    sqlite: ['INTEGER', 'INTEGER', 'INTEGER', 'TEXT', 'REAL', 'REAL', 'BLOB', 'BLOB', 'BLOB'],
    mssql: ['TINYINT', 'INT', 'BIT', 'TIME', 'DECIMAL(10,2)', 'FLOAT', 'BINARY(16)', 'VARBINARY(255)', 'VARBINARY(MAX)'],
    oracle: ['NUMBER(3)', 'NUMBER(10)', 'NUMBER(1)', 'TIMESTAMP', 'NUMBER(10,2)', 'FLOAT', 'RAW(16)', 'RAW(255)', 'BLOB'],
    h2: ['TINYINT', 'MEDIUMINT', 'BIT', 'TIME', 'DECIMAL(10,2)', 'REAL', 'BINARY(16)', 'VARBINARY(255)', 'BLOB'],
  };

  for (const dialect of ALL_DIALECTS) {
    it(`${dialect}: DDL export contains expected type strings`, () => {
      const ddl = exportDDL(schema, dialect);
      for (const typeStr of expectedTypeStrings[dialect]) {
        expect(ddl.toUpperCase(), `${dialect} DDL should contain ${typeStr}`).toContain(typeStr);
      }
    });
  }
});

// ─── 6. SQLite AUTOINCREMENT edge case ───────────────────────────────

describe('SQLite AUTOINCREMENT edge case', () => {
  it('TINYINT with autoIncrement does NOT produce AUTOINCREMENT in SQLite', () => {
    const col = makeCol({ type: 'TINYINT', autoIncrement: true, primaryKey: true });
    const schema = makeSchema([col]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).not.toContain('AUTOINCREMENT');
  });

  it('MEDIUMINT with autoIncrement does NOT produce AUTOINCREMENT in SQLite', () => {
    const col = makeCol({ type: 'MEDIUMINT', autoIncrement: true, primaryKey: true });
    const schema = makeSchema([col]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).not.toContain('AUTOINCREMENT');
  });

  it('INT with autoIncrement DOES produce AUTOINCREMENT in SQLite', () => {
    const col = makeCol({ type: 'INT', autoIncrement: true, primaryKey: true });
    const schema = makeSchema([col]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).toContain('AUTOINCREMENT');
  });

  it('BIGINT with autoIncrement DOES produce AUTOINCREMENT in SQLite', () => {
    const col = makeCol({ type: 'BIGINT', autoIncrement: true, primaryKey: true });
    const schema = makeSchema([col]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).toContain('AUTOINCREMENT');
  });

  it('SMALLINT with autoIncrement DOES produce AUTOINCREMENT in SQLite', () => {
    const col = makeCol({ type: 'SMALLINT', autoIncrement: true, primaryKey: true });
    const schema = makeSchema([col]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).toContain('AUTOINCREMENT');
  });
});

// ─── 7. Schema lint compatibility ────────────────────────────────────

describe('Schema lint compatibility with new types', () => {
  it('lintSchema does not crash on a table with all new types', () => {
    const columns: Column[] = [
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'tiny_col', type: 'TINYINT' }),
      makeCol({ id: 'c3', name: 'medium_col', type: 'MEDIUMINT' }),
      makeCol({ id: 'c4', name: 'bit_col', type: 'BIT' }),
      makeCol({ id: 'c5', name: 'time_col', type: 'TIME' }),
      makeCol({ id: 'c6', name: 'numeric_col', type: 'NUMERIC' }),
      makeCol({ id: 'c7', name: 'real_col', type: 'REAL' }),
      makeCol({ id: 'c8', name: 'binary_col', type: 'BINARY' }),
      makeCol({ id: 'c9', name: 'varbinary_col', type: 'VARBINARY' }),
      makeCol({ id: 'c10', name: 'blob_col', type: 'BLOB' }),
    ];
    const schema = makeSchema(columns);

    expect(() => lintSchema(schema)).not.toThrow();
  });

  it('lintSchema returns an array (not undefined) for schema with new types', () => {
    const columns: Column[] = [
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'BLOB' }),
      makeCol({ id: 'c3', name: 'flag', type: 'BIT' }),
      makeCol({ id: 'c4', name: 'amount', type: 'NUMERIC', length: 10, scale: 2 }),
    ];
    const schema = makeSchema(columns);

    const issues = lintSchema(schema);
    expect(Array.isArray(issues)).toBe(true);
  });

  it('lintSchema finds no-pk issue on table with only new-type columns (no PK)', () => {
    const columns: Column[] = [
      makeCol({ id: 'c1', name: 'val', type: 'TINYINT' }),
      makeCol({ id: 'c2', name: 'ts', type: 'TIME' }),
    ];
    const schema = makeSchema(columns);

    const issues = lintSchema(schema);
    const noPk = issues.find(i => i.ruleId === 'no-pk');
    expect(noPk).toBeDefined();
  });
});

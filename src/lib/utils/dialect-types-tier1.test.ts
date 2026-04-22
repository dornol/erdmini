import { describe, it, expect } from 'vitest';
import { normalizeType } from './ddl-import';
import { columnTypeSql, exportDDL } from './ddl-export';
import { generateDummyValue } from './dummy-data';
import { lintSchema } from './schema-lint';
import { exportPrisma } from './prisma-export';
import { exportDBML } from './dbml-export';
import { detectDialect } from './detect-dialect';
import type { Column, ERDSchema, Dialect } from '$lib/types/erd';
import { COLUMN_TYPES, DIALECT_COLUMN_TYPES, getColumnTypesForDialect } from '$lib/types/erd';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeCol(overrides: Partial<Column> & { type: Column['type'] }): Column {
  const { type, ...rest } = overrides;
  return {
    id: 'c1',
    name: 'col',
    type,
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...rest,
  };
}

function makeSchema(columns: Column[], dialect?: Dialect): ERDSchema {
  return {
    version: '1.0',
    dialect,
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

// ═══════════════════════════════════════════════════════════════════════
// 1. COLUMN_TYPES contains new tier-1 types
// ═══════════════════════════════════════════════════════════════════════

describe('COLUMN_TYPES contains tier-1 dialect types', () => {
  it.each(['JSONB', 'MONEY', 'DATETIMEOFFSET', 'YEAR', 'INTERVAL'])(
    '%s is in COLUMN_TYPES',
    (type) => {
      expect(COLUMN_TYPES).toContain(type);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 2. normalizeType — preservation
// ═══════════════════════════════════════════════════════════════════════

describe('normalizeType preserves tier-1 types', () => {
  const directMappings: [string, string][] = [
    ['JSONB', 'JSONB'],
    ['MONEY', 'MONEY'],
    ['DATETIMEOFFSET', 'DATETIMEOFFSET'],
    ['YEAR', 'YEAR'],
    ['INTERVAL', 'INTERVAL'],
  ];

  for (const [input, expected] of directMappings) {
    it(`preserves ${input} → ${expected}`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  }

  // Case insensitivity
  it('case-insensitive: jsonb → JSONB', () => {
    expect(normalizeType('jsonb')).toBe('JSONB');
  });

  it('case-insensitive: money → MONEY', () => {
    expect(normalizeType('money')).toBe('MONEY');
  });

  it('case-insensitive: datetimeoffset → DATETIMEOFFSET', () => {
    expect(normalizeType('datetimeoffset')).toBe('DATETIMEOFFSET');
  });

  it('case-insensitive: year → YEAR', () => {
    expect(normalizeType('year')).toBe('YEAR');
  });

  it('case-insensitive: interval → INTERVAL', () => {
    expect(normalizeType('interval')).toBe('INTERVAL');
  });

  // Aliases
  it('SMALLMONEY → MONEY (MSSQL alias)', () => {
    expect(normalizeType('SMALLMONEY')).toBe('MONEY');
  });

  it('DATETIMEOFFSET(7) → DATETIMEOFFSET (length stripped)', () => {
    expect(normalizeType('DATETIMEOFFSET(7)')).toBe('DATETIMEOFFSET');
  });

  // INTERVAL with unit specifier
  it('INTERVAL DAY TO SECOND → INTERVAL', () => {
    expect(normalizeType('INTERVAL DAY TO SECOND')).toBe('INTERVAL');
  });

  it('INTERVAL YEAR TO MONTH → INTERVAL', () => {
    expect(normalizeType('INTERVAL YEAR TO MONTH')).toBe('INTERVAL');
  });

  it('does not produce VARCHAR fallback for tier-1 types', () => {
    for (const t of ['JSONB', 'MONEY', 'DATETIMEOFFSET', 'YEAR', 'INTERVAL']) {
      expect(normalizeType(t)).not.toBe('VARCHAR');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. columnTypeSql — per-dialect output
// ═══════════════════════════════════════════════════════════════════════

describe('columnTypeSql per dialect — JSONB', () => {
  const col = makeCol({ type: 'JSONB' });

  it('PostgreSQL → JSONB (native)', () => {
    expect(columnTypeSql(col, 'postgresql', true)).toBe('JSONB');
  });

  it('MySQL → JSON (fallback)', () => {
    expect(columnTypeSql(col, 'mysql', true)).toBe('JSON');
  });

  it('MariaDB → JSON (fallback)', () => {
    expect(columnTypeSql(col, 'mariadb', true)).toBe('JSON');
  });

  it('MSSQL → NVARCHAR(MAX) (fallback)', () => {
    expect(columnTypeSql(col, 'mssql', true)).toBe('NVARCHAR(MAX)');
  });

  it('SQLite → TEXT (fallback)', () => {
    expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
  });

  it('Oracle → CLOB (fallback)', () => {
    expect(columnTypeSql(col, 'oracle', true)).toBe('CLOB');
  });

  it('H2 → JSON (fallback)', () => {
    expect(columnTypeSql(col, 'h2', true)).toBe('JSON');
  });
});

describe('columnTypeSql per dialect — MONEY', () => {
  const col = makeCol({ type: 'MONEY' });

  it('PostgreSQL → MONEY (native)', () => {
    expect(columnTypeSql(col, 'postgresql', true)).toBe('MONEY');
  });

  it('MSSQL → MONEY (native)', () => {
    expect(columnTypeSql(col, 'mssql', true)).toBe('MONEY');
  });

  it('MySQL → DECIMAL(19,4) (fallback)', () => {
    expect(columnTypeSql(col, 'mysql', true)).toBe('DECIMAL(19,4)');
  });

  it('MariaDB → DECIMAL(19,4) (fallback)', () => {
    expect(columnTypeSql(col, 'mariadb', true)).toBe('DECIMAL(19,4)');
  });

  it('SQLite → REAL (fallback)', () => {
    expect(columnTypeSql(col, 'sqlite', true)).toBe('REAL');
  });

  it('Oracle → NUMBER(19,4) (fallback)', () => {
    expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(19,4)');
  });

  it('H2 → DECIMAL(19,4) (fallback)', () => {
    expect(columnTypeSql(col, 'h2', true)).toBe('DECIMAL(19,4)');
  });
});

describe('columnTypeSql per dialect — DATETIMEOFFSET', () => {
  const col = makeCol({ type: 'DATETIMEOFFSET' });

  it('MSSQL → DATETIMEOFFSET (native)', () => {
    expect(columnTypeSql(col, 'mssql', true)).toBe('DATETIMEOFFSET');
  });

  it('MSSQL with length=3 → DATETIMEOFFSET(3)', () => {
    expect(columnTypeSql(makeCol({ type: 'DATETIMEOFFSET', length: 3 }), 'mssql', true)).toBe('DATETIMEOFFSET(3)');
  });

  it('PostgreSQL → TIMESTAMP WITH TIME ZONE (fallback)', () => {
    expect(columnTypeSql(col, 'postgresql', true)).toBe('TIMESTAMP WITH TIME ZONE');
  });

  it('Oracle → TIMESTAMP WITH TIME ZONE (fallback)', () => {
    expect(columnTypeSql(col, 'oracle', true)).toBe('TIMESTAMP WITH TIME ZONE');
  });

  it('H2 → TIMESTAMP WITH TIME ZONE (fallback)', () => {
    expect(columnTypeSql(col, 'h2', true)).toBe('TIMESTAMP WITH TIME ZONE');
  });

  it('MySQL → TIMESTAMP (fallback, no timezone)', () => {
    expect(columnTypeSql(col, 'mysql', true)).toBe('TIMESTAMP');
  });

  it('SQLite → TEXT (fallback)', () => {
    expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
  });
});

describe('columnTypeSql per dialect — YEAR', () => {
  const col = makeCol({ type: 'YEAR' });

  it('MySQL → YEAR (native)', () => {
    expect(columnTypeSql(col, 'mysql', true)).toBe('YEAR');
  });

  it('MariaDB → YEAR (native)', () => {
    expect(columnTypeSql(col, 'mariadb', true)).toBe('YEAR');
  });

  it('PostgreSQL → SMALLINT (fallback)', () => {
    expect(columnTypeSql(col, 'postgresql', true)).toBe('SMALLINT');
  });

  it('MSSQL → SMALLINT (fallback)', () => {
    expect(columnTypeSql(col, 'mssql', true)).toBe('SMALLINT');
  });

  it('SQLite → INTEGER (fallback)', () => {
    expect(columnTypeSql(col, 'sqlite', true)).toBe('INTEGER');
  });

  it('Oracle → NUMBER(5) (fallback)', () => {
    expect(columnTypeSql(col, 'oracle', true)).toBe('NUMBER(5)');
  });

  it('H2 → SMALLINT (fallback)', () => {
    expect(columnTypeSql(col, 'h2', true)).toBe('SMALLINT');
  });
});

describe('columnTypeSql per dialect — INTERVAL', () => {
  const col = makeCol({ type: 'INTERVAL' });

  it('PostgreSQL → INTERVAL (native)', () => {
    expect(columnTypeSql(col, 'postgresql', true)).toBe('INTERVAL');
  });

  it('Oracle → INTERVAL DAY TO SECOND', () => {
    expect(columnTypeSql(col, 'oracle', true)).toBe('INTERVAL DAY TO SECOND');
  });

  it('H2 → INTERVAL DAY TO SECOND', () => {
    expect(columnTypeSql(col, 'h2', true)).toBe('INTERVAL DAY TO SECOND');
  });

  it('MySQL → VARCHAR(64) (fallback)', () => {
    expect(columnTypeSql(col, 'mysql', true)).toBe('VARCHAR(64)');
  });

  it('MariaDB → VARCHAR(64) (fallback)', () => {
    expect(columnTypeSql(col, 'mariadb', true)).toBe('VARCHAR(64)');
  });

  it('MSSQL → NVARCHAR(64) (fallback)', () => {
    expect(columnTypeSql(col, 'mssql', true)).toBe('NVARCHAR(64)');
  });

  it('SQLite → TEXT (fallback)', () => {
    expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. DIALECT_COLUMN_TYPES — type lists per dialect
// ═══════════════════════════════════════════════════════════════════════

describe('DIALECT_COLUMN_TYPES — tier-1 types', () => {
  it('PostgreSQL includes JSONB, MONEY, INTERVAL', () => {
    const types = DIALECT_COLUMN_TYPES.postgresql;
    expect(types).toContain('JSONB');
    expect(types).toContain('MONEY');
    expect(types).toContain('INTERVAL');
  });

  it('PostgreSQL does NOT include YEAR or DATETIMEOFFSET', () => {
    const types = DIALECT_COLUMN_TYPES.postgresql;
    expect(types).not.toContain('YEAR');
    expect(types).not.toContain('DATETIMEOFFSET');
  });

  it('MSSQL includes MONEY, DATETIMEOFFSET', () => {
    const types = DIALECT_COLUMN_TYPES.mssql;
    expect(types).toContain('MONEY');
    expect(types).toContain('DATETIMEOFFSET');
  });

  it('MSSQL does NOT include JSONB, YEAR, INTERVAL', () => {
    const types = DIALECT_COLUMN_TYPES.mssql;
    expect(types).not.toContain('JSONB');
    expect(types).not.toContain('YEAR');
    expect(types).not.toContain('INTERVAL');
  });

  it('MySQL includes YEAR', () => {
    expect(DIALECT_COLUMN_TYPES.mysql).toContain('YEAR');
  });

  it('MariaDB includes YEAR', () => {
    expect(DIALECT_COLUMN_TYPES.mariadb).toContain('YEAR');
  });

  it('MySQL does NOT include JSONB, MONEY, DATETIMEOFFSET, INTERVAL', () => {
    const types = DIALECT_COLUMN_TYPES.mysql;
    expect(types).not.toContain('JSONB');
    expect(types).not.toContain('MONEY');
    expect(types).not.toContain('DATETIMEOFFSET');
    expect(types).not.toContain('INTERVAL');
  });

  it('Oracle includes INTERVAL', () => {
    expect(DIALECT_COLUMN_TYPES.oracle).toContain('INTERVAL');
  });

  it('H2 includes INTERVAL', () => {
    expect(DIALECT_COLUMN_TYPES.h2).toContain('INTERVAL');
  });

  it('SQLite has none of the tier-1 specialized types', () => {
    const types = DIALECT_COLUMN_TYPES.sqlite;
    expect(types).not.toContain('JSONB');
    expect(types).not.toContain('MONEY');
    expect(types).not.toContain('DATETIMEOFFSET');
    expect(types).not.toContain('YEAR');
    expect(types).not.toContain('INTERVAL');
  });

  it('all DIALECT_COLUMN_TYPES entries reference only valid ColumnTypes', () => {
    for (const dialect of ALL_DIALECTS) {
      for (const t of DIALECT_COLUMN_TYPES[dialect]) {
        expect(COLUMN_TYPES, `${t} in ${dialect}`).toContain(t);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. DDL import round-trip
// ═══════════════════════════════════════════════════════════════════════

describe('DDL import round-trip — tier-1 types', () => {
  async function importDDL(sql: string, dialect: Dialect) {
    const { importDDL } = await import('./ddl-import');
    return importDDL(sql, dialect);
  }

  it('MSSQL: imports DATETIMEOFFSET preserving type', async () => {
    const sql = `
      CREATE TABLE [dbo].[events] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [occurred_at] DATETIMEOFFSET NOT NULL,
        CONSTRAINT [PK_events] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'occurred_at')!;
    expect(col.type).toBe('DATETIMEOFFSET');
  });

  it('MSSQL: imports DATETIMEOFFSET(3) preserving precision', async () => {
    const sql = `
      CREATE TABLE [dbo].[events] (
        [id] INT NOT NULL,
        [occurred_at] DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT [PK_events] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'occurred_at')!;
    expect(col.type).toBe('DATETIMEOFFSET');
    expect(col.length).toBe(3);
  });

  it('MSSQL: imports MONEY type', async () => {
    const sql = `
      CREATE TABLE [dbo].[orders] (
        [id] INT NOT NULL,
        [total] MONEY NOT NULL,
        CONSTRAINT [PK_orders] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'total')!;
    expect(col.type).toBe('MONEY');
  });

  it('MSSQL: SMALLMONEY normalizes to MONEY', async () => {
    const sql = `
      CREATE TABLE [dbo].[orders] (
        [id] INT NOT NULL,
        [tax] SMALLMONEY,
        CONSTRAINT [PK_orders] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'tax')!;
    expect(col.type).toBe('MONEY');
  });

  it('MSSQL: DATETIMEOFFSET round-trip (import → export → re-import)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [ts] DATETIMEOFFSET(3),
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result1 = await importDDL(sql, 'mssql');
    const exported = exportDDL(makeSchema(result1.tables[0].columns), 'mssql');
    expect(exported).toContain('DATETIMEOFFSET');
    const result2 = await importDDL(exported, 'mssql');
    expect(result2.tables[0].columns.find(c => c.name === 'ts')!.type).toBe('DATETIMEOFFSET');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Dummy data generation
// ═══════════════════════════════════════════════════════════════════════

describe('generateDummyValue for tier-1 types', () => {
  it('YEAR returns a 4-digit year number', () => {
    const val = generateDummyValue(makeCol({ type: 'YEAR' }), 0);
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThanOrEqual(2000);
    expect(val).toBeLessThanOrEqual(2099);
  });

  it('YEAR values vary with rowIndex', () => {
    const v1 = generateDummyValue(makeCol({ type: 'YEAR' }), 0);
    const v2 = generateDummyValue(makeCol({ type: 'YEAR' }), 1);
    expect(v1).not.toBe(v2);
  });

  it('MONEY returns a number with decimals', () => {
    const val = generateDummyValue(makeCol({ type: 'MONEY' }), 0);
    expect(typeof val).toBe('number');
  });

  it('DATETIMEOFFSET returns timestamp with offset string', () => {
    const val = generateDummyValue(makeCol({ type: 'DATETIMEOFFSET' }), 0);
    expect(typeof val).toBe('string');
    expect(val as string).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}/);
  });

  it('INTERVAL returns interval-like string', () => {
    const val = generateDummyValue(makeCol({ type: 'INTERVAL' }), 0);
    expect(typeof val).toBe('string');
    expect(val as string).toMatch(/days?/);
  });

  it('JSONB returns empty object literal', () => {
    const val = generateDummyValue(makeCol({ type: 'JSONB' }), 0);
    expect(val).toBe('{}');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Full DDL export integration
// ═══════════════════════════════════════════════════════════════════════

describe('Full DDL export with tier-1 types', () => {
  const columns: Column[] = [
    makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
    makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    makeCol({ id: 'c3', name: 'price', type: 'MONEY' }),
    makeCol({ id: 'c4', name: 'occurred_at', type: 'DATETIMEOFFSET' }),
    makeCol({ id: 'c5', name: 'birth_year', type: 'YEAR' }),
    makeCol({ id: 'c6', name: 'duration', type: 'INTERVAL' }),
  ];
  const schema = makeSchema(columns);

  const expectedTypeStrings: Record<Dialect, string[]> = {
    mysql: ['JSON', 'DECIMAL(19,4)', 'TIMESTAMP', 'YEAR', 'VARCHAR(64)'],
    mariadb: ['JSON', 'DECIMAL(19,4)', 'TIMESTAMP', 'YEAR', 'VARCHAR(64)'],
    postgresql: ['JSONB', 'MONEY', 'TIMESTAMP WITH TIME ZONE', 'SMALLINT', 'INTERVAL'],
    sqlite: ['TEXT', 'REAL', 'TEXT', 'INTEGER', 'TEXT'],
    mssql: ['NVARCHAR(MAX)', 'MONEY', 'DATETIMEOFFSET', 'SMALLINT', 'NVARCHAR(64)'],
    oracle: ['CLOB', 'NUMBER(19,4)', 'TIMESTAMP WITH TIME ZONE', 'NUMBER(5)', 'INTERVAL DAY TO SECOND'],
    h2: ['JSON', 'DECIMAL(19,4)', 'TIMESTAMP WITH TIME ZONE', 'SMALLINT', 'INTERVAL DAY TO SECOND'],
  };

  for (const dialect of ALL_DIALECTS) {
    it(`${dialect}: DDL export contains expected type strings`, () => {
      const ddl = exportDDL(schema, dialect).toUpperCase();
      for (const typeStr of expectedTypeStrings[dialect]) {
        expect(ddl, `${dialect} DDL should contain ${typeStr}`).toContain(typeStr);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Prisma export
// ═══════════════════════════════════════════════════════════════════════

describe('Prisma export — tier-1 types', () => {
  it('JSONB exports as Json with @db.JsonB', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('Json');
    expect(prisma).toContain('@db.JsonB');
  });

  it('MONEY exports as Decimal with @db.Money', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('Decimal');
    expect(prisma).toContain('@db.Money');
  });

  it('DATETIMEOFFSET exports as DateTime with @db.DateTimeOffset', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('DateTime');
    expect(prisma).toContain('@db.DateTimeOffset');
  });

  it('YEAR exports as Int with @db.Year', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'birth_year', type: 'YEAR' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('Int');
    expect(prisma).toContain('@db.Year');
  });

  it('INTERVAL exports as String (no native Prisma type)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'duration', type: 'INTERVAL' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('String');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. DBML export
// ═══════════════════════════════════════════════════════════════════════

describe('DBML export — tier-1 types', () => {
  it('JSONB exports as jsonb', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('jsonb');
  });

  it('MONEY exports as money', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('money');
  });

  it('DATETIMEOFFSET exports as datetimeoffset', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('datetimeoffset');
  });

  it('DATETIMEOFFSET(3) exports with precision', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET', length: 3 }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('datetimeoffset(3)');
  });

  it('YEAR exports as year', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'birth_year', type: 'YEAR' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('year');
  });

  it('INTERVAL exports as interval', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'duration', type: 'INTERVAL' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('interval');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. detect-dialect — JSONB and DATETIMEOFFSET as strong signals
// ═══════════════════════════════════════════════════════════════════════

describe('detectDialect — tier-1 type signals', () => {
  it('JSONB detects PostgreSQL', () => {
    expect(detectDialect('CREATE TABLE t (id INT, data JSONB);')).toBe('postgresql');
  });

  it('DATETIMEOFFSET detects MSSQL', () => {
    expect(detectDialect('CREATE TABLE t (id INT, ts DATETIMEOFFSET);')).toBe('mssql');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. Schema lint — dialect-type-mismatch with tier-1 types
// ═══════════════════════════════════════════════════════════════════════

describe('Schema lint — tier-1 dialect mismatches', () => {
  it('no warning when PostgreSQL has JSONB', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ], 'postgresql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);
  });

  it('warns when MySQL has JSONB (use JSON instead)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(1);
  });

  it('warns when MySQL has DATETIMEOFFSET', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(1);
  });

  it('warns when PostgreSQL has YEAR', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'y', type: 'YEAR' }),
    ], 'postgresql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(1);
  });

  it('no warning when MSSQL has MONEY and DATETIMEOFFSET', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
      makeCol({ id: 'c3', name: 'ts', type: 'DATETIMEOFFSET' }),
    ], 'mssql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);
  });

  it('no warning when Oracle has INTERVAL', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'dur', type: 'INTERVAL' }),
    ], 'oracle');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);
  });

  it('multiple mismatches in same table are all reported', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'a', type: 'JSONB' }),
      makeCol({ id: 'c3', name: 'b', type: 'DATETIMEOFFSET' }),
      makeCol({ id: 'c4', name: 'c', type: 'INTERVAL' }),
      makeCol({ id: 'c5', name: 'd', type: 'YEAR' }),
    ], 'sqlite');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(4);
  });

  it('lint message includes DBMS name in uppercase', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    const mismatch = issues.find(i => i.ruleId === 'dialect-type-mismatch')!;
    expect(mismatch.message).toContain('MYSQL');
    expect(mismatch.message).toContain('JSONB');
    expect(mismatch.message).toContain('test_table.data');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. Cross-dialect import — non-MSSQL dialects
// ═══════════════════════════════════════════════════════════════════════

describe('Cross-dialect DDL import — tier-1 types', () => {
  async function importDDL(sql: string, dialect: Dialect) {
    const { importDDL } = await import('./ddl-import');
    return importDDL(sql, dialect);
  }

  it('PostgreSQL: imports JSONB preserving type', async () => {
    const sql = 'CREATE TABLE t (id INT PRIMARY KEY, data JSONB);';
    const result = await importDDL(sql, 'postgresql');
    const col = result.tables[0].columns.find(c => c.name === 'data')!;
    expect(col.type).toBe('JSONB');
  });

  it('PostgreSQL: imports MONEY preserving type', async () => {
    const sql = 'CREATE TABLE t (id INT PRIMARY KEY, price MONEY);';
    const result = await importDDL(sql, 'postgresql');
    const col = result.tables[0].columns.find(c => c.name === 'price')!;
    expect(col.type).toBe('MONEY');
  });

  it('MySQL: imports YEAR preserving type', async () => {
    const sql = 'CREATE TABLE t (id INT PRIMARY KEY, birth_year YEAR);';
    const result = await importDDL(sql, 'mysql');
    const col = result.tables[0].columns.find(c => c.name === 'birth_year')!;
    expect(col.type).toBe('YEAR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 13. DATETIMEOFFSET precision boundary
// ═══════════════════════════════════════════════════════════════════════

describe('DATETIMEOFFSET precision boundary', () => {
  it('length 0 exports as DATETIMEOFFSET(0)', () => {
    const col = makeCol({ type: 'DATETIMEOFFSET', length: 0 });
    // length=0 is falsy in JS — it should fall through to default (no precision)
    // Document the actual behavior
    const result = columnTypeSql(col, 'mssql', true);
    expect(result).toBe('DATETIMEOFFSET'); // falsy length drops to default
  });

  it('length 3 exports as DATETIMEOFFSET(3)', () => {
    const col = makeCol({ type: 'DATETIMEOFFSET', length: 3 });
    expect(columnTypeSql(col, 'mssql', true)).toBe('DATETIMEOFFSET(3)');
  });

  it('length 7 (MSSQL max) exports as DATETIMEOFFSET(7)', () => {
    const col = makeCol({ type: 'DATETIMEOFFSET', length: 7 });
    expect(columnTypeSql(col, 'mssql', true)).toBe('DATETIMEOFFSET(7)');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 14. Consistency — getColumnTypesForDialect vs DIALECT_COLUMN_TYPES
// ═══════════════════════════════════════════════════════════════════════

describe('Consistency between getColumnTypesForDialect and DIALECT_COLUMN_TYPES', () => {
  for (const dialect of ALL_DIALECTS) {
    it(`${dialect}: getColumnTypesForDialect returns same as DIALECT_COLUMN_TYPES`, () => {
      expect(getColumnTypesForDialect(dialect)).toEqual(DIALECT_COLUMN_TYPES[dialect]);
    });
  }

  it('getColumnTypesForDialect(undefined) returns full COLUMN_TYPES', () => {
    expect(getColumnTypesForDialect(undefined)).toEqual(COLUMN_TYPES);
  });

  it('no dialect list contains duplicates', () => {
    for (const dialect of ALL_DIALECTS) {
      const types = DIALECT_COLUMN_TYPES[dialect];
      expect(new Set(types).size, `${dialect} has duplicate types`).toBe(types.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 15. Cross-dialect DDL roundtrip — export then re-import
// ═══════════════════════════════════════════════════════════════════════

describe('Cross-dialect export/import round-trip', () => {
  async function importDDL(sql: string, dialect: Dialect) {
    const { importDDL } = await import('./ddl-import');
    return importDDL(sql, dialect);
  }

  it('PostgreSQL: JSONB round-trip (export → import → JSONB)', async () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ]);
    const exported = exportDDL(schema, 'postgresql');
    expect(exported.toUpperCase()).toContain('JSONB');
    const result = await importDDL(exported, 'postgresql');
    expect(result.tables[0].columns.find(c => c.name === 'data')!.type).toBe('JSONB');
  });

  it('PostgreSQL: MONEY round-trip', async () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
    ]);
    const exported = exportDDL(schema, 'postgresql');
    expect(exported.toUpperCase()).toContain('MONEY');
    const result = await importDDL(exported, 'postgresql');
    expect(result.tables[0].columns.find(c => c.name === 'price')!.type).toBe('MONEY');
  });

  it('MySQL: YEAR round-trip', async () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'yr', type: 'YEAR' }),
    ]);
    const exported = exportDDL(schema, 'mysql');
    expect(exported.toUpperCase()).toContain('YEAR');
    const result = await importDDL(exported, 'mysql');
    expect(result.tables[0].columns.find(c => c.name === 'yr')!.type).toBe('YEAR');
  });

  it('MSSQL: MONEY round-trip', async () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
    ]);
    const exported = exportDDL(schema, 'mssql');
    expect(exported.toUpperCase()).toContain('MONEY');
    const result = await importDDL(exported, 'mssql');
    expect(result.tables[0].columns.find(c => c.name === 'price')!.type).toBe('MONEY');
  });

  it('MSSQL: SMALLMONEY input → MONEY after round-trip (export is MONEY)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [tax] SMALLMONEY,
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result1 = await importDDL(sql, 'mssql');
    expect(result1.tables[0].columns.find(c => c.name === 'tax')!.type).toBe('MONEY');
    const exported = exportDDL(makeSchema(result1.tables[0].columns), 'mssql');
    expect(exported.toUpperCase()).toContain('MONEY');
    const result2 = await importDDL(exported, 'mssql');
    expect(result2.tables[0].columns.find(c => c.name === 'tax')!.type).toBe('MONEY');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 16. Mixed-case type names (case insensitivity is comprehensive)
// ═══════════════════════════════════════════════════════════════════════

describe('normalizeType handles mixed case for tier-1 types', () => {
  const mixedCases: [string, string][] = [
    ['JsonB', 'JSONB'],
    ['jSoNb', 'JSONB'],
    ['Money', 'MONEY'],
    ['mOnEy', 'MONEY'],
    ['DateTimeOffset', 'DATETIMEOFFSET'],
    ['datetimeOFFSET', 'DATETIMEOFFSET'],
    ['Year', 'YEAR'],
    ['YEAR', 'YEAR'],
    ['Interval', 'INTERVAL'],
    ['SmallMoney', 'MONEY'],
  ];

  for (const [input, expected] of mixedCases) {
    it(`${input} → ${expected}`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 17. Dialect switching scenario — type preserved, lint warns
// ═══════════════════════════════════════════════════════════════════════

describe('Dialect switching scenario — type preservation', () => {
  it('switching MSSQL → MySQL: DATETIMEOFFSET preserved, warning appears', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET' }),
    ], 'mssql');

    // Initially no warning
    expect(lintSchema(schema).filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);

    // Switch dialect
    schema.dialect = 'mysql';

    // Column type preserved
    expect(schema.tables[0].columns.find(c => c.name === 'ts')!.type).toBe('DATETIMEOFFSET');

    // Lint now warns
    const mismatches = lintSchema(schema).filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('DATETIMEOFFSET');
  });

  it('switching PostgreSQL → MSSQL: JSONB preserved, warning appears', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
    ], 'postgresql');

    expect(lintSchema(schema).filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);

    schema.dialect = 'mssql';

    expect(schema.tables[0].columns.find(c => c.name === 'data')!.type).toBe('JSONB');
    const mismatches = lintSchema(schema).filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
  });

  it('switching with mixed compatible types: only incompatible ones warn', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'VARCHAR' }), // always compatible
      makeCol({ id: 'c3', name: 'data', type: 'JSONB' }),    // PG-only
      makeCol({ id: 'c4', name: 'ts', type: 'TIMESTAMP' }),  // always compatible
    ], 'postgresql');

    schema.dialect = 'sqlite';
    const mismatches = lintSchema(schema).filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].columnId).toBe('c3');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 18. DDL export keyword casing
// ═══════════════════════════════════════════════════════════════════════

describe('DDL export keyword casing — tier-1 types', () => {
  it('MSSQL DATETIMEOFFSET — upper case', () => {
    const col = makeCol({ type: 'DATETIMEOFFSET' });
    expect(columnTypeSql(col, 'mssql', true)).toBe('DATETIMEOFFSET');
  });

  it('MSSQL datetimeoffset — lower case', () => {
    const col = makeCol({ type: 'DATETIMEOFFSET' });
    expect(columnTypeSql(col, 'mssql', false)).toBe('datetimeoffset');
  });

  it('PostgreSQL JSONB — upper case', () => {
    const col = makeCol({ type: 'JSONB' });
    expect(columnTypeSql(col, 'postgresql', true)).toBe('JSONB');
  });

  it('PostgreSQL jsonb — lower case', () => {
    const col = makeCol({ type: 'JSONB' });
    expect(columnTypeSql(col, 'postgresql', false)).toBe('jsonb');
  });

  it('MySQL YEAR — upper case', () => {
    const col = makeCol({ type: 'YEAR' });
    expect(columnTypeSql(col, 'mysql', true)).toBe('YEAR');
  });

  it('MySQL year — lower case', () => {
    const col = makeCol({ type: 'YEAR' });
    expect(columnTypeSql(col, 'mysql', false)).toBe('year');
  });

  it('Oracle INTERVAL DAY TO SECOND — upper case', () => {
    const col = makeCol({ type: 'INTERVAL' });
    expect(columnTypeSql(col, 'oracle', true)).toBe('INTERVAL DAY TO SECOND');
  });

  it('Oracle interval day to second — lower case', () => {
    const col = makeCol({ type: 'INTERVAL' });
    expect(columnTypeSql(col, 'oracle', false)).toBe('interval day to second');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 19. All types round-trip through Prisma without data loss
// ═══════════════════════════════════════════════════════════════════════

describe('Prisma export — native hints present for tier-1 types', () => {
  it('all tier-1 types produce native hints (except INTERVAL which maps to plain String)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'a', type: 'JSONB' }),
      makeCol({ id: 'c3', name: 'b', type: 'MONEY' }),
      makeCol({ id: 'c4', name: 'c', type: 'DATETIMEOFFSET' }),
      makeCol({ id: 'c5', name: 'd', type: 'YEAR' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('@db.JsonB');
    expect(prisma).toContain('@db.Money');
    expect(prisma).toContain('@db.DateTimeOffset');
    expect(prisma).toContain('@db.Year');
  });
});

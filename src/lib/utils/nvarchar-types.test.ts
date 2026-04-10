import { describe, it, expect } from 'vitest';
import { normalizeType } from './ddl-import';
import { columnTypeSql, exportDDL } from './ddl-export';
import { generateDummyValue } from './dummy-data';
import { lintSchema } from './schema-lint';
import { exportPrisma } from './prisma-export';
import { exportDBML } from './dbml-export';
import type { Column, ERDSchema, Dialect } from '$lib/types/erd';
import { COLUMN_TYPES, DIALECT_COLUMN_TYPES, getColumnTypesForDialect } from '$lib/types/erd';
import { addColumnOp } from '$lib/store/ops/column-ops';

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
// 1. COLUMN_TYPES includes NVARCHAR/NCHAR/NTEXT
// ═══════════════════════════════════════════════════════════════════════

describe('COLUMN_TYPES includes NVARCHAR/NCHAR/NTEXT', () => {
  it('NVARCHAR is in COLUMN_TYPES', () => {
    expect(COLUMN_TYPES).toContain('NVARCHAR');
  });

  it('NCHAR is in COLUMN_TYPES', () => {
    expect(COLUMN_TYPES).toContain('NCHAR');
  });

  it('NTEXT is in COLUMN_TYPES', () => {
    expect(COLUMN_TYPES).toContain('NTEXT');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. normalizeType mapping (import)
// ═══════════════════════════════════════════════════════════════════════

describe('normalizeType for NVARCHAR/NCHAR/NTEXT', () => {
  const directMappings: [string, string][] = [
    ['NVARCHAR', 'NVARCHAR'],
    ['NCHAR', 'NCHAR'],
    ['NTEXT', 'NTEXT'],
  ];

  for (const [input, expected] of directMappings) {
    it(`preserves ${input} → ${expected}`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  }

  it('case-insensitive: nvarchar → NVARCHAR', () => {
    expect(normalizeType('nvarchar')).toBe('NVARCHAR');
  });

  it('case-insensitive: Nvarchar → NVARCHAR', () => {
    expect(normalizeType('Nvarchar')).toBe('NVARCHAR');
  });

  it('case-insensitive: nchar → NCHAR', () => {
    expect(normalizeType('nchar')).toBe('NCHAR');
  });

  it('case-insensitive: ntext → NTEXT', () => {
    expect(normalizeType('ntext')).toBe('NTEXT');
  });

  it('strips length: NVARCHAR(50) → NVARCHAR', () => {
    expect(normalizeType('NVARCHAR(50)')).toBe('NVARCHAR');
  });

  it('strips length: NVARCHAR(255) → NVARCHAR', () => {
    expect(normalizeType('NVARCHAR(255)')).toBe('NVARCHAR');
  });

  it('strips length: NCHAR(10) → NCHAR', () => {
    expect(normalizeType('NCHAR(10)')).toBe('NCHAR');
  });

  it('NVARCHAR(MAX) → NTEXT (not TEXT)', () => {
    expect(normalizeType('NVARCHAR(MAX)')).toBe('NTEXT');
  });

  it('nvarchar(max) case-insensitive → NTEXT', () => {
    expect(normalizeType('nvarchar(max)')).toBe('NTEXT');
  });

  it('NCHAR(MAX) → NTEXT', () => {
    expect(normalizeType('NCHAR(MAX)')).toBe('NTEXT');
  });

  // Oracle NVARCHAR2 stays VARCHAR (not NVARCHAR)
  it('NVARCHAR2 → VARCHAR (Oracle alias)', () => {
    expect(normalizeType('NVARCHAR2')).toBe('VARCHAR');
  });

  // VARCHAR(MAX) stays TEXT (not NTEXT)
  it('VARCHAR(MAX) → TEXT (not NTEXT)', () => {
    expect(normalizeType('VARCHAR(MAX)')).toBe('TEXT');
  });

  it('does not produce VARCHAR fallback for NVARCHAR types (no warning)', () => {
    for (const t of ['NVARCHAR', 'NCHAR', 'NTEXT']) {
      expect(normalizeType(t)).not.toBe('VARCHAR');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. DDL export — columnTypeSql per dialect
// ═══════════════════════════════════════════════════════════════════════

describe('columnTypeSql per dialect — NVARCHAR/NCHAR/NTEXT', () => {
  describe('NVARCHAR (no length)', () => {
    const col = makeCol({ type: 'NVARCHAR' });

    it('MSSQL → NVARCHAR(255)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('NVARCHAR(255)');
    });

    it('MySQL → VARCHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('VARCHAR(255)');
    });

    it('MariaDB → VARCHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('VARCHAR(255)');
    });

    it('PostgreSQL → VARCHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('VARCHAR(255)');
    });

    it('SQLite → TEXT', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
    });

    it('Oracle → VARCHAR2(255) (fallback)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('VARCHAR2(255)');
    });

    it('H2 → VARCHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('VARCHAR(255)');
    });
  });

  describe('NVARCHAR with length=100', () => {
    const col = makeCol({ type: 'NVARCHAR', length: 100 });

    it('MSSQL → NVARCHAR(100)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('NVARCHAR(100)');
    });

    it('MySQL → VARCHAR(100)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('VARCHAR(100)');
    });

    it('PostgreSQL → VARCHAR(100)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('VARCHAR(100)');
    });

    it('Oracle → VARCHAR2(100)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('VARCHAR2(100)');
    });

    it('H2 → VARCHAR(100)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('VARCHAR(100)');
    });
  });

  describe('NCHAR (no length)', () => {
    const col = makeCol({ type: 'NCHAR' });

    it('MSSQL → NCHAR(255)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('NCHAR(255)');
    });

    it('MySQL → CHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('CHAR(255)');
    });

    it('MariaDB → CHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('CHAR(255)');
    });

    it('PostgreSQL → CHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('CHAR(255)');
    });

    it('SQLite → TEXT', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
    });

    it('Oracle → CHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('CHAR(255)');
    });

    it('H2 → CHAR(255) (fallback)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('CHAR(255)');
    });
  });

  describe('NCHAR with length=20', () => {
    const col = makeCol({ type: 'NCHAR', length: 20 });

    it('MSSQL → NCHAR(20)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('NCHAR(20)');
    });

    it('MySQL → CHAR(20)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('CHAR(20)');
    });

    it('PostgreSQL → CHAR(20)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('CHAR(20)');
    });
  });

  describe('NTEXT', () => {
    const col = makeCol({ type: 'NTEXT' });

    it('MSSQL → NVARCHAR(MAX)', () => {
      expect(columnTypeSql(col, 'mssql', true)).toBe('NVARCHAR(MAX)');
    });

    it('MySQL → TEXT (fallback)', () => {
      expect(columnTypeSql(col, 'mysql', true)).toBe('TEXT');
    });

    it('MariaDB → TEXT (fallback)', () => {
      expect(columnTypeSql(col, 'mariadb', true)).toBe('TEXT');
    });

    it('PostgreSQL → TEXT (fallback)', () => {
      expect(columnTypeSql(col, 'postgresql', true)).toBe('TEXT');
    });

    it('SQLite → TEXT', () => {
      expect(columnTypeSql(col, 'sqlite', true)).toBe('TEXT');
    });

    it('Oracle → CLOB (fallback)', () => {
      expect(columnTypeSql(col, 'oracle', true)).toBe('CLOB');
    });

    it('H2 → CLOB (fallback)', () => {
      expect(columnTypeSql(col, 'h2', true)).toBe('CLOB');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. DDL import round-trip
// ═══════════════════════════════════════════════════════════════════════

describe('DDL import round-trip — NVARCHAR/NCHAR/NTEXT', () => {
  async function importDDL(sql: string, dialect: Dialect) {
    const { importDDL } = await import('./ddl-import');
    return importDDL(sql, dialect);
  }

  it('MSSQL: imports NVARCHAR(100) and preserves type + length', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(100) NOT NULL,
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'name')!;
    expect(col.type).toBe('NVARCHAR');
    expect(col.length).toBe(100);
  });

  it('MSSQL: imports NCHAR(10)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [code] NCHAR(10),
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'code')!;
    expect(col.type).toBe('NCHAR');
    expect(col.length).toBe(10);
  });

  it('MSSQL: imports NVARCHAR(MAX) as NVARCHAR (preprocessor converts MAX→4000)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [bio] NVARCHAR(MAX),
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'bio')!;
    // cleanMSSQLSyntax converts nvarchar(max) → nvarchar(4000)
    expect(col.type).toBe('NVARCHAR');
  });

  it('MSSQL: imports mixed NVARCHAR, NCHAR, VARCHAR in one table', async () => {
    const sql = `
      CREATE TABLE [dbo].[mixed] (
        [id] INT NOT NULL,
        [nv_col] NVARCHAR(200),
        [nc_col] NCHAR(50),
        [v_col] VARCHAR(100),
        CONSTRAINT [PK_mixed] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'nv_col')!.type).toBe('NVARCHAR');
    expect(cols.find(c => c.name === 'nc_col')!.type).toBe('NCHAR');
    expect(cols.find(c => c.name === 'v_col')!.type).toBe('VARCHAR');
  });

  it('MSSQL: NVARCHAR round-trip (import → export MSSQL → re-import)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [name] NVARCHAR(200) NOT NULL,
        [code] NCHAR(10),
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result1 = await importDDL(sql, 'mssql');
    const exported = exportDDL(makeSchema(result1.tables[0].columns), 'mssql');
    // Re-import the exported DDL
    const result2 = await importDDL(exported, 'mssql');
    const cols = result2.tables[0].columns;
    expect(cols.find(c => c.name === 'name')!.type).toBe('NVARCHAR');
    expect(cols.find(c => c.name === 'code')!.type).toBe('NCHAR');
  });

  it('MSSQL: sysname imports as NVARCHAR (sysname→nvarchar(128) preprocessor)', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [name] sysname NOT NULL,
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const col = result.tables[0].columns.find(c => c.name === 'name')!;
    expect(col.type).toBe('NVARCHAR');
    expect(col.length).toBe(128);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Dummy data generation
// ═══════════════════════════════════════════════════════════════════════

describe('generateDummyValue for NVARCHAR/NCHAR/NTEXT', () => {
  it('NVARCHAR returns col_name string', () => {
    const val = generateDummyValue(makeCol({ name: 'title', type: 'NVARCHAR' }), 0);
    expect(typeof val).toBe('string');
    expect(val).toBe('title_1');
  });

  it('NCHAR returns col_name string', () => {
    const val = generateDummyValue(makeCol({ name: 'code', type: 'NCHAR' }), 0);
    expect(typeof val).toBe('string');
    expect(val).toBe('code_1');
  });

  it('NTEXT returns col_name string', () => {
    const val = generateDummyValue(makeCol({ name: 'bio', type: 'NTEXT' }), 0);
    expect(typeof val).toBe('string');
    expect(val).toBe('bio_1');
  });

  it('NVARCHAR values increase with rowIndex', () => {
    const v1 = generateDummyValue(makeCol({ name: 'x', type: 'NVARCHAR' }), 0);
    const v2 = generateDummyValue(makeCol({ name: 'x', type: 'NVARCHAR' }), 1);
    expect(v1).toBe('x_1');
    expect(v2).toBe('x_2');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Full DDL export integration
// ═══════════════════════════════════════════════════════════════════════

describe('Full DDL export with NVARCHAR/NCHAR/NTEXT', () => {
  const columns: Column[] = [
    makeCol({ id: 'c1', name: 'nv_col', type: 'NVARCHAR', length: 200 }),
    makeCol({ id: 'c2', name: 'nc_col', type: 'NCHAR', length: 10 }),
    makeCol({ id: 'c3', name: 'nt_col', type: 'NTEXT' }),
  ];
  const schema = makeSchema(columns);

  const expectedTypeStrings: Record<Dialect, string[]> = {
    mysql: ['VARCHAR(200)', 'CHAR(10)', 'TEXT'],
    mariadb: ['VARCHAR(200)', 'CHAR(10)', 'TEXT'],
    postgresql: ['VARCHAR(200)', 'CHAR(10)', 'TEXT'],
    sqlite: ['TEXT', 'TEXT', 'TEXT'],
    mssql: ['NVARCHAR(200)', 'NCHAR(10)', 'NVARCHAR(MAX)'],
    oracle: ['VARCHAR2(200)', 'CHAR(10)', 'CLOB'],
    h2: ['VARCHAR(200)', 'CHAR(10)', 'CLOB'],
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

// ═══════════════════════════════════════════════════════════════════════
// 7. getColumnTypesForDialect
// ═══════════════════════════════════════════════════════════════════════

describe('getColumnTypesForDialect', () => {
  it('returns all COLUMN_TYPES when no dialect specified', () => {
    expect(getColumnTypesForDialect()).toEqual(COLUMN_TYPES);
  });

  it('returns all COLUMN_TYPES when dialect is undefined', () => {
    expect(getColumnTypesForDialect(undefined)).toEqual(COLUMN_TYPES);
  });

  it('MSSQL includes NVARCHAR, NCHAR, NTEXT', () => {
    const types = getColumnTypesForDialect('mssql');
    expect(types).toContain('NVARCHAR');
    expect(types).toContain('NCHAR');
    expect(types).toContain('NTEXT');
  });

  it('MSSQL includes BIT but not BOOLEAN', () => {
    const types = getColumnTypesForDialect('mssql');
    expect(types).toContain('BIT');
    expect(types).not.toContain('BOOLEAN');
  });

  it('MySQL does NOT include NVARCHAR, NCHAR, NTEXT', () => {
    const types = getColumnTypesForDialect('mysql');
    expect(types).not.toContain('NVARCHAR');
    expect(types).not.toContain('NCHAR');
    expect(types).not.toContain('NTEXT');
  });

  it('MySQL includes BOOLEAN but not BIT', () => {
    const types = getColumnTypesForDialect('mysql');
    expect(types).toContain('BOOLEAN');
    expect(types).not.toContain('BIT');
  });

  it('PostgreSQL does NOT include NVARCHAR, NCHAR, NTEXT', () => {
    const types = getColumnTypesForDialect('postgresql');
    expect(types).not.toContain('NVARCHAR');
    expect(types).not.toContain('NCHAR');
    expect(types).not.toContain('NTEXT');
  });

  it('PostgreSQL includes UUID and ENUM', () => {
    const types = getColumnTypesForDialect('postgresql');
    expect(types).toContain('UUID');
    expect(types).toContain('ENUM');
  });

  it('SQLite has a minimal type set (no BINARY, no BIT, no ENUM)', () => {
    const types = getColumnTypesForDialect('sqlite');
    expect(types).not.toContain('BINARY');
    expect(types).not.toContain('VARBINARY');
    expect(types).not.toContain('BIT');
    expect(types).not.toContain('ENUM');
    expect(types).not.toContain('UUID');
  });

  it('all dialects include core types: INT, VARCHAR, TEXT, DATE', () => {
    for (const dialect of ALL_DIALECTS) {
      const types = getColumnTypesForDialect(dialect);
      expect(types, `${dialect} should have INT`).toContain('INT');
      expect(types, `${dialect} should have VARCHAR`).toContain('VARCHAR');
      expect(types, `${dialect} should have TEXT`).toContain('TEXT');
      expect(types, `${dialect} should have DATE`).toContain('DATE');
    }
  });

  it('each dialect returns a non-empty array', () => {
    for (const dialect of ALL_DIALECTS) {
      const types = getColumnTypesForDialect(dialect);
      expect(types.length, `${dialect} should have types`).toBeGreaterThan(0);
    }
  });

  it('DIALECT_COLUMN_TYPES covers all 7 dialects', () => {
    expect(Object.keys(DIALECT_COLUMN_TYPES)).toHaveLength(7);
    for (const dialect of ALL_DIALECTS) {
      expect(DIALECT_COLUMN_TYPES[dialect]).toBeDefined();
    }
  });

  it('each dialect type list only contains valid ColumnTypes', () => {
    for (const dialect of ALL_DIALECTS) {
      const types = DIALECT_COLUMN_TYPES[dialect];
      for (const t of types) {
        expect(COLUMN_TYPES, `${t} in ${dialect} should be a valid ColumnType`).toContain(t);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Schema lint — dialect-type-mismatch
// ═══════════════════════════════════════════════════════════════════════

describe('Schema lint: dialect-type-mismatch', () => {
  it('no warnings when dialect is not set', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
    ]);
    // dialect is undefined
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);
  });

  it('no warnings when MSSQL dialect has NVARCHAR columns', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
      makeCol({ id: 'c3', name: 'code', type: 'NCHAR' }),
      makeCol({ id: 'c4', name: 'bio', type: 'NTEXT' }),
    ], 'mssql');
    const issues = lintSchema(schema);
    expect(issues.filter(i => i.ruleId === 'dialect-type-mismatch')).toHaveLength(0);
  });

  it('warns when MySQL dialect has NVARCHAR columns', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('NVARCHAR');
    expect(mismatches[0].message).toContain('MYSQL');
    expect(mismatches[0].columnId).toBe('c2');
  });

  it('warns when PostgreSQL dialect has NVARCHAR, NCHAR, NTEXT columns', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'a', type: 'NVARCHAR' }),
      makeCol({ id: 'c3', name: 'b', type: 'NCHAR' }),
      makeCol({ id: 'c4', name: 'c', type: 'NTEXT' }),
    ], 'postgresql');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(3);
  });

  it('warns when MSSQL dialect has BOOLEAN column', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'active', type: 'BOOLEAN' }),
    ], 'mssql');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('BOOLEAN');
  });

  it('warns when MySQL dialect has BIT column (should use BOOLEAN)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'flag', type: 'BIT' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('BIT');
  });

  it('warns when SQLite dialect has ENUM column', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'status', type: 'ENUM' }),
    ], 'sqlite');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches).toHaveLength(1);
  });

  it('severity is warning (not error)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    const mismatches = issues.filter(i => i.ruleId === 'dialect-type-mismatch');
    expect(mismatches[0].severity).toBe('warning');
  });

  it('includes tableId and columnId in the issue', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
    ], 'mysql');
    const issues = lintSchema(schema);
    const mismatch = issues.find(i => i.ruleId === 'dialect-type-mismatch')!;
    expect(mismatch.tableId).toBe('t1');
    expect(mismatch.columnId).toBe('c2');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Schema lint compatibility — no crash with dialect set
// ═══════════════════════════════════════════════════════════════════════

describe('Schema lint compatibility with dialect set', () => {
  it('lintSchema does not crash with all NVARCHAR types and mssql dialect', () => {
    const columns: Column[] = [
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'nv', type: 'NVARCHAR' }),
      makeCol({ id: 'c3', name: 'nc', type: 'NCHAR' }),
      makeCol({ id: 'c4', name: 'nt', type: 'NTEXT' }),
    ];
    expect(() => lintSchema(makeSchema(columns, 'mssql'))).not.toThrow();
  });

  for (const dialect of ALL_DIALECTS) {
    it(`lintSchema returns array for ${dialect} dialect`, () => {
      const schema = makeSchema([
        makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      ], dialect);
      const issues = lintSchema(schema);
      expect(Array.isArray(issues)).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 10. ERDSchema.dialect field
// ═══════════════════════════════════════════════════════════════════════

describe('ERDSchema.dialect field', () => {
  it('schema without dialect is valid', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })]);
    expect(schema.dialect).toBeUndefined();
  });

  it('schema with dialect persists through JSON round-trip', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })], 'mssql');
    const json = JSON.stringify(schema);
    const parsed = JSON.parse(json) as ERDSchema;
    expect(parsed.dialect).toBe('mssql');
  });

  it('schema with undefined dialect omits field in JSON', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })]);
    const json = JSON.stringify(schema);
    const parsed = JSON.parse(json);
    expect('dialect' in parsed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. Default column type respects dialect
// ═══════════════════════════════════════════════════════════════════════

describe('addColumnOp default type respects dialect', () => {
  it('defaults to VARCHAR when no dialect set', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })]);
    const col = addColumnOp(schema, 't1');
    expect(col!.type).toBe('VARCHAR');
    expect(col!.length).toBe(255);
  });

  it('defaults to NVARCHAR when dialect is mssql', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })], 'mssql');
    const col = addColumnOp(schema, 't1');
    expect(col!.type).toBe('NVARCHAR');
    expect(col!.length).toBe(255);
  });

  it('defaults to VARCHAR when dialect is mysql', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })], 'mysql');
    const col = addColumnOp(schema, 't1');
    expect(col!.type).toBe('VARCHAR');
  });

  it('defaults to VARCHAR when dialect is postgresql', () => {
    const schema = makeSchema([makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })], 'postgresql');
    const col = addColumnOp(schema, 't1');
    expect(col!.type).toBe('VARCHAR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. Prisma export — NVARCHAR/NCHAR/NTEXT mapping
// ═══════════════════════════════════════════════════════════════════════

describe('Prisma export — NVARCHAR/NCHAR/NTEXT', () => {
  it('NVARCHAR(200) exports with @db.NVarChar(200) hint', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR', length: 200 }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('@db.NVarChar(200)');
  });

  it('NVARCHAR(255) exports with @db.NVarChar(255)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR', length: 255 }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('@db.NVarChar(255)');
  });

  it('NCHAR(10) exports with @db.NChar(10) hint', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'code', type: 'NCHAR', length: 10 }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('@db.NChar(10)');
  });

  it('NTEXT exports with @db.NText hint', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'bio', type: 'NTEXT' }),
    ]);
    const prisma = exportPrisma(schema);
    expect(prisma).toContain('@db.NText');
  });

  it('all NVARCHAR types map to Prisma String', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'a', type: 'NVARCHAR' }),
      makeCol({ id: 'c3', name: 'b', type: 'NCHAR' }),
      makeCol({ id: 'c4', name: 'c', type: 'NTEXT' }),
    ]);
    const prisma = exportPrisma(schema);
    // All should be String type (3 String fields + 1 Int)
    const stringCount = (prisma.match(/String/g) || []).length;
    expect(stringCount).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 13. DBML export — NVARCHAR/NCHAR/NTEXT mapping
// ═══════════════════════════════════════════════════════════════════════

describe('DBML export — NVARCHAR/NCHAR/NTEXT', () => {
  it('NVARCHAR(200) exports as nvarchar(200)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR', length: 200 }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('nvarchar(200)');
  });

  it('NVARCHAR without length exports as nvarchar', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('nvarchar');
  });

  it('NCHAR(10) exports as nchar(10)', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'code', type: 'NCHAR', length: 10 }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('nchar(10)');
  });

  it('NTEXT exports as ntext', () => {
    const schema = makeSchema([
      makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
      makeCol({ id: 'c2', name: 'bio', type: 'NTEXT' }),
    ]);
    const dbml = exportDBML(schema);
    expect(dbml).toContain('ntext');
  });
});

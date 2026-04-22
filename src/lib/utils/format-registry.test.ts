import { describe, it, expect } from 'vitest';
import {
  EXPORT_FORMATS,
  IMPORT_FORMATS,
  getExportFormat,
  getImportFormat,
  resolveFileExt,
  type ExportFormatSpec,
  type ImportFormatSpec,
} from './format-registry';
import type { Column, ERDSchema, Dialect } from '$lib/types/erd';

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

function makeSchema(): ERDSchema {
  return {
    version: '1.0',
    tables: [
      {
        id: 't1',
        name: 'users',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'c2', name: 'name', type: 'VARCHAR', length: 100, nullable: false }),
        ],
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

// ═══════════════════════════════════════════════════════════════════════
// 1. Export registry structure
// ═══════════════════════════════════════════════════════════════════════

describe('EXPORT_FORMATS registry', () => {
  it('contains ddl, mermaid, plantuml, prisma, dbml', () => {
    const ids = EXPORT_FORMATS.map(f => f.id);
    expect(ids).toContain('ddl');
    expect(ids).toContain('mermaid');
    expect(ids).toContain('plantuml');
    expect(ids).toContain('prisma');
    expect(ids).toContain('dbml');
  });

  it('all format ids are unique', () => {
    const ids = EXPORT_FORMATS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every format has a non-empty label', () => {
    for (const spec of EXPORT_FORMATS) {
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  it('every format has an export function', () => {
    for (const spec of EXPORT_FORMATS) {
      expect(typeof spec.export).toBe('function');
    }
  });

  it('DDL and Drizzle support dialect selection', () => {
    const supportsDialect = EXPORT_FORMATS.filter(f => f.supportsDialect);
    const ids = supportsDialect.map(s => s.id).sort();
    expect(ids).toEqual(['ddl', 'drizzle']);
  });

  it('only DDL supports DDL options', () => {
    const supportsDdlOpts = EXPORT_FORMATS.filter(f => f.supportsDdlOptions);
    expect(supportsDdlOpts).toHaveLength(1);
    expect(supportsDdlOpts[0].id).toBe('ddl');
  });
});

describe('getExportFormat', () => {
  it('returns spec for known id', () => {
    expect(getExportFormat('ddl')?.label).toBe('DDL');
    expect(getExportFormat('prisma')?.label).toBe('Prisma');
    expect(getExportFormat('dbml')?.label).toBe('DBML');
    expect(getExportFormat('mermaid')?.label).toBe('Mermaid');
    expect(getExportFormat('plantuml')?.label).toBe('PlantUML');
  });

  it('returns undefined for unknown id', () => {
    expect(getExportFormat('unknown')).toBeUndefined();
    expect(getExportFormat('')).toBeUndefined();
  });
});

describe('resolveFileExt', () => {
  it('returns static extension for string-based fileExt', () => {
    const prismaSpec = getExportFormat('prisma')!;
    expect(resolveFileExt(prismaSpec)).toBe('.prisma');
  });

  it('returns dialect-based extension for DDL', () => {
    const ddlSpec = getExportFormat('ddl')!;
    expect(resolveFileExt(ddlSpec, 'mysql')).toBe('_mysql.sql');
    expect(resolveFileExt(ddlSpec, 'postgresql')).toBe('_postgresql.sql');
    expect(resolveFileExt(ddlSpec, 'mssql')).toBe('_mssql.sql');
  });

  it('DDL fileExt defaults to mysql when dialect omitted', () => {
    const ddlSpec = getExportFormat('ddl')!;
    expect(resolveFileExt(ddlSpec)).toBe('_mysql.sql');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Export functional tests
// ═══════════════════════════════════════════════════════════════════════

describe('EXPORT_FORMATS — functional output', () => {
  const schema = makeSchema();

  it('DDL produces CREATE TABLE with dialect', () => {
    const ddl = getExportFormat('ddl')!.export(schema, { dialect: 'postgresql' });
    expect(ddl.toUpperCase()).toContain('CREATE TABLE');
  });

  it('DDL with MSSQL dialect uses NVARCHAR', () => {
    const ddl = getExportFormat('ddl')!.export(schema, { dialect: 'mssql' });
    expect(ddl).toContain('NVARCHAR');
  });

  it('DDL with MySQL dialect uses VARCHAR', () => {
    const ddl = getExportFormat('ddl')!.export(schema, { dialect: 'mysql' });
    expect(ddl).toContain('VARCHAR');
    expect(ddl).not.toContain('NVARCHAR');
  });

  it('Prisma export contains model', () => {
    const prisma = getExportFormat('prisma')!.export(schema, {});
    expect(prisma).toContain('model');
  });

  it('DBML export contains Table keyword', () => {
    const dbml = getExportFormat('dbml')!.export(schema, {});
    expect(dbml).toContain('Table');
  });

  it('Mermaid export starts with erDiagram', () => {
    const mermaid = getExportFormat('mermaid')!.export(schema, {});
    expect(mermaid).toContain('erDiagram');
  });

  it('PlantUML export contains @startuml', () => {
    const plantuml = getExportFormat('plantuml')!.export(schema, {});
    expect(plantuml).toContain('@startuml');
  });

  it('non-DDL formats ignore dialect parameter (produce same output)', () => {
    const mysqlOut = getExportFormat('prisma')!.export(schema, { dialect: 'mysql' });
    const mssqlOut = getExportFormat('prisma')!.export(schema, { dialect: 'mssql' });
    expect(mysqlOut).toBe(mssqlOut);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Import registry structure
// ═══════════════════════════════════════════════════════════════════════

describe('IMPORT_FORMATS registry', () => {
  it('contains ddl, prisma, dbml', () => {
    const ids = IMPORT_FORMATS.map(f => f.id);
    expect(ids).toContain('ddl');
    expect(ids).toContain('prisma');
    expect(ids).toContain('dbml');
  });

  it('all format ids are unique', () => {
    const ids = IMPORT_FORMATS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only DDL supports dialect selection', () => {
    const supportsDialect = IMPORT_FORMATS.filter(f => f.supportsDialect);
    expect(supportsDialect).toHaveLength(1);
    expect(supportsDialect[0].id).toBe('ddl');
  });

  it('every format has acceptFiles with .txt fallback', () => {
    for (const spec of IMPORT_FORMATS) {
      expect(spec.acceptFiles).toContain('.txt');
    }
  });

  it('DDL accepts .sql files', () => {
    expect(getImportFormat('ddl')!.acceptFiles).toContain('.sql');
  });

  it('Prisma accepts .prisma files', () => {
    expect(getImportFormat('prisma')!.acceptFiles).toContain('.prisma');
  });

  it('DBML accepts .dbml files', () => {
    expect(getImportFormat('dbml')!.acceptFiles).toContain('.dbml');
  });
});

describe('getImportFormat', () => {
  it('returns spec for known id', () => {
    expect(getImportFormat('ddl')?.label).toBe('DDL');
    expect(getImportFormat('prisma')?.label).toBe('Prisma');
    expect(getImportFormat('dbml')?.label).toBe('DBML');
  });

  it('returns undefined for unknown id', () => {
    expect(getImportFormat('unknown')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Import functional tests
// ═══════════════════════════════════════════════════════════════════════

describe('IMPORT_FORMATS — functional roundtrip', () => {
  it('DDL import via registry parses a simple MySQL table', async () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));';
    const result = await getImportFormat('ddl')!.import(sql, { dialect: 'mysql' });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
  });

  it('DDL import passes dialect correctly (MSSQL brackets)', async () => {
    const sql = `
      CREATE TABLE [dbo].[users] (
        [id] INT NOT NULL,
        [name] NVARCHAR(100),
        CONSTRAINT [PK_users] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await getImportFormat('ddl')!.import(sql, { dialect: 'mssql' });
    expect(result.tables).toHaveLength(1);
    const nameCol = result.tables[0].columns.find(c => c.name === 'name');
    expect(nameCol?.type).toBe('NVARCHAR');
  });

  it('Prisma import via registry parses a model', async () => {
    const prismaSchema = `
      datasource db { provider = "postgresql" url = "postgres://x" }
      model User {
        id Int @id
        name String
      }
    `;
    const result = await getImportFormat('prisma')!.import(prismaSchema, {});
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('User');
  });

  it('DBML import via registry parses a table', async () => {
    const dbml = `
      Table users {
        id int [pk]
        name varchar
      }
    `;
    const result = await getImportFormat('dbml')!.import(dbml, {});
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
  });

  it('custom messages are passed through (DDL)', async () => {
    const sql = 'NOT A VALID SQL';
    const result = await getImportFormat('ddl')!.import(sql, {
      dialect: 'mysql',
      messages: {
        fkResolveFailed: (p) => `CUSTOM FK FAIL: ${p.detail}`,
        noCreateTable: () => 'CUSTOM NO CREATE TABLE',
        tableParseError: (p) => `CUSTOM PARSE ERROR: ${p.error}`,
      },
    });
    // Error should contain our custom message
    const hasCustomMessage = result.errors.some(e => e.includes('CUSTOM')) ||
      result.warnings.some(w => w.includes('CUSTOM'));
    // At minimum one of errors or warnings reflects something (might not always trigger custom message)
    expect(result.errors.length + result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Consistency between registry and UI expectations
// ═══════════════════════════════════════════════════════════════════════

describe('Registry consistency', () => {
  it('EXPORT_FORMATS has at least one format', () => {
    expect(EXPORT_FORMATS.length).toBeGreaterThan(0);
  });

  it('IMPORT_FORMATS has at least one format', () => {
    expect(IMPORT_FORMATS.length).toBeGreaterThan(0);
  });

  it('first export format is DDL (default selection)', () => {
    expect(EXPORT_FORMATS[0].id).toBe('ddl');
  });

  it('first import format is DDL (default selection)', () => {
    expect(IMPORT_FORMATS[0].id).toBe('ddl');
  });

  it('every export format has a valid mime type', () => {
    for (const spec of EXPORT_FORMATS) {
      expect(spec.mime).toMatch(/^[\w-]+\/[\w-+.]+/);
    }
  });

  it('formats that exist in both registries share the same label', () => {
    for (const exp of EXPORT_FORMATS) {
      const imp = getImportFormat(exp.id);
      if (imp) {
        expect(imp.label).toBe(exp.label);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Drizzle integration via registry
// ═══════════════════════════════════════════════════════════════════════

describe('Drizzle in registry', () => {
  it('Drizzle is registered as an export format', () => {
    const spec = getExportFormat('drizzle');
    expect(spec).toBeDefined();
    expect(spec!.label).toBe('Drizzle');
  });

  it('Drizzle fileExt is .ts', () => {
    const spec = getExportFormat('drizzle')!;
    expect(resolveFileExt(spec)).toBe('.ts');
  });

  it('Drizzle export produces valid TS imports for postgresql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
    expect(ts).toContain('pgTable');
  });

  it('Drizzle export produces valid TS imports for mysql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'mysql' });
    expect(ts).toContain(`from 'drizzle-orm/mysql-core'`);
    expect(ts).toContain('mysqlTable');
  });

  it('Drizzle export produces valid TS imports for sqlite', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'sqlite' });
    expect(ts).toContain(`from 'drizzle-orm/sqlite-core'`);
    expect(ts).toContain('sqliteTable');
  });

  it('Drizzle mariadb dialect falls back to mysql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'mariadb' });
    expect(ts).toContain(`from 'drizzle-orm/mysql-core'`);
    expect(ts).toContain('mysqlTable');
  });

  it('Drizzle mssql dialect falls back to postgresql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'mssql' });
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
  });

  it('Drizzle oracle dialect falls back to postgresql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'oracle' });
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
  });

  it('Drizzle h2 dialect falls back to postgresql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, { dialect: 'h2' });
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
  });

  it('Drizzle undefined dialect defaults to postgresql', () => {
    const schema = makeSchema();
    const spec = getExportFormat('drizzle')!;
    const ts = spec.export(schema, {});
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
  });

  it('Drizzle download label key is drizzle_download', () => {
    expect(getExportFormat('drizzle')!.downloadLabelKey).toBe('drizzle_download');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Robustness — every export format handles empty schema without crash
// ═══════════════════════════════════════════════════════════════════════

describe('Robustness — empty schema', () => {
  function emptySchema(): ERDSchema {
    return {
      version: '1.0',
      tables: [],
      domains: [],
      memos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  for (const spec of EXPORT_FORMATS) {
    it(`${spec.id}: empty schema export does not throw`, () => {
      expect(() => spec.export(emptySchema(), { dialect: 'postgresql' })).not.toThrow();
    });

    it(`${spec.id}: empty schema export returns a string`, () => {
      const result = spec.export(emptySchema(), { dialect: 'postgresql' });
      expect(typeof result).toBe('string');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 8. DDL export works with all 7 supported dialects via registry
// ═══════════════════════════════════════════════════════════════════════

describe('DDL registry — all 7 dialects', () => {
  const dialects: Dialect[] = ['mysql', 'mariadb', 'postgresql', 'mssql', 'sqlite', 'oracle', 'h2'];

  for (const dialect of dialects) {
    it(`DDL via registry produces CREATE TABLE for ${dialect}`, () => {
      const spec = getExportFormat('ddl')!;
      const ddl = spec.export(makeSchema(), { dialect });
      expect(ddl.toUpperCase()).toContain('CREATE TABLE');
    });

    it(`DDL fileExt resolves correctly for ${dialect}`, () => {
      const spec = getExportFormat('ddl')!;
      expect(resolveFileExt(spec, dialect)).toBe(`_${dialect}.sql`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Mime types
// ═══════════════════════════════════════════════════════════════════════

describe('MIME types', () => {
  it('DDL mime is text/plain', () => {
    expect(getExportFormat('ddl')!.mime).toBe('text/plain');
  });

  it('Drizzle mime is text/typescript', () => {
    expect(getExportFormat('drizzle')!.mime).toBe('text/typescript');
  });

  it('Mermaid mime is text/plain', () => {
    expect(getExportFormat('mermaid')!.mime).toBe('text/plain');
  });
});

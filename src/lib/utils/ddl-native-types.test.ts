import { describe, expect, it } from 'vitest';
import { protectNativeBinaryTypes } from './ddl-native-types';
import { importDDL } from './ddl-import';

describe('native SQL types', () => {
  it('retains MSSQL TIME zero and six precision through preprocessing', async () => {
    const result = await importDDL('CREATE TABLE e (a TIME(0) NOT NULL, b TIME(6));', 'mssql');
    expect(result.errors).toEqual([]);
    expect(result.tables[0].columns.map(c => ({ type: c.type, length: c.length }))).toEqual([{ type: 'TIME', length: 0 }, { type: 'TIME', length: 6 }]);
  });

  for (const dialect of ['mysql', 'mariadb', 'h2', 'postgresql'] as const) it(`${dialect} preserves ordered inline enum values without treating commas as separators`, async () => {
    const result = await importDDL("CREATE TABLE e (state ENUM('pending', 'O''Brien', 'comma,value', '완료', ''));", dialect);
    expect(result.errors).toEqual([]);
    expect(result.tables[0].columns[0]).toMatchObject({ type: 'ENUM', enumValues: ['pending', "O'Brien", 'comma,value', '완료', ''] });
  });
  it('resolves a PostgreSQL enum declaration reused by multiple columns', async () => {
    const result = await importDDL("CREATE TYPE status_enum AS ENUM ('O''Brien', ''); CREATE TABLE e (a status_enum NOT NULL, b status_enum);", 'postgresql');
    expect(result.errors).toEqual([]); expect(result.warnings).toEqual([]);
    expect(result.tables[0].columns.map(c => ({ type: c.type, values: c.enumValues, nullable: c.nullable }))).toEqual([
      { type: 'ENUM', values: ["O'Brien", ''], nullable: false }, { type: 'ENUM', values: ["O'Brien", ''], nullable: true },
    ]);
  });
  for (const dialect of ['oracle', 'h2'] as const) it(`${dialect} preserves binary types and dimensions while retaining defaults that contain type-like text`, async () => {
    const type = dialect === 'oracle' ? 'RAW' : 'BINARY';
    const result = await importDDL(`CREATE TABLE e (a ${type}(1), b ${dialect === 'oracle' ? 'RAW' : 'VARBINARY'}(2000), note VARCHAR(100) DEFAULT 'RAW(32) BINARY(16)');`, dialect);
    expect(result.errors).toEqual([]); expect(result.warnings).toEqual([]);
    expect(result.tables[0].columns.map(c => ({ type: c.type, length: c.length }))).toEqual([
      { type: dialect === 'oracle' ? 'VARBINARY' : 'BINARY', length: 1 }, { type: 'VARBINARY', length: 2000 }, { type: 'VARCHAR', length: 100 },
    ]);
    expect(result.tables[0].columns[2].defaultValue).toBe("'RAW(32) BINARY(16)'");
  });
  it('handles standard SQL strings ending in backslashes and nested comments', () => {
    const sql = String.raw`CREATE TABLE e (note VARCHAR(10) DEFAULT 'C:\', data RAW(16)); /* nested /* RAW(8) */ BINARY(4) */`;
    const result = protectNativeBinaryTypes(sql);
    expect([...result.types.values()]).toEqual([{ type: 'VARBINARY', length: 16 }]);
    expect(result.sql).toContain(String.raw`'C:\'`);
    expect(result.sql).toContain('/* nested /* RAW(8) */ BINARY(4) */');
  });
  it('protects quoted identifiers, strings, comments, dollar quotes and marker collisions', () => {
    const sql = `-- RAW(4)\nCREATE TABLE "BINARY(8)" ("c" RAW(16), note VARCHAR(1900000000) DEFAULT 'RAW(32)'); /* BINARY(7) */ SELECT $$RAW(64)$$;`;
    const result = protectNativeBinaryTypes(sql);
    expect([...result.types.values()]).toEqual([{ type: 'VARBINARY', length: 16 }]);
    expect(result.sql).toContain('"BINARY(8)"'); expect(result.sql).toContain("'RAW(32)'");
    expect(result.sql).toContain('/* BINARY(7) */'); expect(result.sql).toContain('$$RAW(64)$$');
    expect(result.sql).toContain('VARCHAR(1900000000)'); expect(result.sql).toContain('VARCHAR(1899999999)');
  });
});

for (const dialect of ['oracle', 'h2', 'postgresql'] as const) {
  it(`${dialect} retains explicit timestamp precision and with-time-zone semantics`, async () => {
    const result = await importDDL('CREATE TABLE t (a TIMESTAMP(0) WITH TIME ZONE, b TIMESTAMP(6), c TIMESTAMP WITHOUT TIME ZONE);', dialect);
    expect(result.errors).toEqual([]);
    expect(result.tables[0].columns.map(c => ({ type: c.type, length: c.length }))).toEqual([
      { type: 'DATETIMEOFFSET', length: 0 }, { type: 'TIMESTAMP', length: 6 }, { type: 'TIMESTAMP', length: undefined },
    ]);
  });
}

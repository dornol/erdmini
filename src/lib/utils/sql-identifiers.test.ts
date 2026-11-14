import { describe, expect, it } from 'vitest';
import { protectEscapedSqlIdentifiers } from './sql-identifiers';

describe('escaped SQL identifier protection', () => {
  for (const [dialect, quoted, name] of [
    ['mysql', '`a``b`', 'a`b'],
    ['postgresql', '"a""b"', 'a"b'],
    ['mssql', '[a]]b]', 'a]b'],
  ] as const) {
    it(`${dialect} reuses an alias for references and restores names and SQL separately`, () => {
      const result = protectEscapedSqlIdentifiers(`CREATE TABLE ${quoted} (${quoted} INT CHECK (${quoted} > 0));`, dialect);
      expect(result.sql).not.toContain(quoted);
      const alias = result.sql.match(/CREATE TABLE (\w+)/)![1];
      expect(result.sql).toBe(`CREATE TABLE ${alias} (${alias} INT CHECK (${alias} > 0));`);
      expect(result.restoreName(alias)).toBe(name);
      expect(result.restoreSql(`${alias} > 0`)).toBe(`${quoted} > 0`);
    });
  }

  it('preserves string literals, nested comments, dollar strings and ordinary quoted names', () => {
    const sql = `-- "a""b"\n/* outer /* "a""b" */ "a""b" */
      CREATE TABLE "ordinary name" (id TEXT DEFAULT 'O''Brien "a""b"', body TEXT DEFAULT $tag$"a""b"$tag$);`;
    expect(protectEscapedSqlIdentifiers(sql, 'postgresql').sql).toBe(sql);
  });

  it('preserves MySQL double-quoted strings, escaped string delimiters and hash comments', () => {
    const sql = '# `a``b`\nCREATE TABLE test (a TEXT DEFAULT "`a``b`", b TEXT DEFAULT \'O\\\'Brien `a``b`\');';
    expect(protectEscapedSqlIdentifiers(sql, 'mysql').sql).toBe(sql);
  });

  it('chooses aliases that cannot collide with an original name or literal', () => {
    const sql = 'CREATE TABLE "a""b" ("__erdmini_identifier_0_end" TEXT DEFAULT \'__erdmini_identifier__0_end\');';
    const result = protectEscapedSqlIdentifiers(sql, 'sqlite');
    const alias = result.sql.match(/CREATE TABLE (\w+)/)![1];
    expect(alias).not.toBe('__erdmini_identifier_0_end');
    expect(alias).not.toBe('__erdmini_identifier__0_end');
    expect(result.restoreName('__erdmini_identifier_0_end')).toBe('__erdmini_identifier_0_end');
    expect(result.restoreSql(result.sql)).toBe(sql);
  });
});

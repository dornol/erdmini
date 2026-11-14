import type { Dialect } from '$lib/types/erd';

/** Protect doubled identifier delimiters that node-sql-parser cannot decode. */
export function protectEscapedSqlIdentifiers(sql: string, dialect: Dialect) {
  let prefix = '__erdmini_identifier_';
  while (sql.includes(prefix)) prefix += '_';
  const aliases = new Map<string, { name: string; quoted: string }>();
  const byName = new Map<string, string>();
  let protectedSql = '';
  let offset = 0;
  const mysql = dialect === 'mysql' || dialect === 'mariadb';
  while (offset < sql.length) {
    const start = offset;
    const char = sql[offset];
    if (sql.startsWith('--', offset) || (mysql && char === '#')) {
      const end = sql.indexOf('\n', offset);
      offset = end < 0 ? sql.length : end;
    } else if (sql.startsWith('/*', offset)) {
      let depth = 1;
      offset += 2;
      while (offset < sql.length && depth) {
        if (sql.startsWith('/*', offset)) { depth++; offset += 2; }
        else if (sql.startsWith('*/', offset)) { depth--; offset += 2; }
        else offset++;
      }
    } else if (char === "'" || (char === '"' && mysql)) {
      const backslashEscape = mysql || (dialect === 'postgresql' && /(?:^|\W)E$/i.test(sql.slice(0, offset)));
      offset++;
      while (offset < sql.length) {
        if (backslashEscape && sql[offset] === '\\') { offset += 2; continue; }
        if (sql[offset++] !== char) continue;
        if (sql[offset] !== char) break;
        offset++;
      }
    } else if (char === '$' && dialect === 'postgresql' && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(offset))) {
      const tag = sql.slice(offset).match(/^\$(?:[A-Za-z_]\w*)?\$/)![0];
      const end = sql.indexOf(tag, offset + tag.length);
      offset = end < 0 ? sql.length : end + tag.length;
    } else if (char === '`' || (char === '"' && !mysql) || (char === '[' && dialect === 'mssql')) {
      const close = char === '[' ? ']' : char;
      let name = '', escaped = false, closed = false;
      offset++;
      while (offset < sql.length) {
        const next = sql[offset++];
        if (next !== close) { name += next; continue; }
        if (sql[offset] === close) { name += close; offset++; escaped = true; }
        else { closed = true; break; }
      }
      if (closed && escaped) {
        let alias = byName.get(name);
        if (!alias) {
          alias = `${prefix}${aliases.size}_end`;
          aliases.set(alias, { name, quoted: sql.slice(start, offset) });
          byName.set(name, alias);
        }
        protectedSql += alias;
        continue;
      }
    } else {
      offset++;
    }
    protectedSql += sql.slice(start, offset);
  }
  const pattern = new RegExp(`${prefix}\\d+_end`, 'g');
  const restore = (value: string, quoted: boolean) => value.replace(
    pattern,
    alias => (quoted ? aliases.get(alias)?.quoted : aliases.get(alias)?.name) ?? alias,
  );
  return {
    sql: protectedSql,
    restoreName: (value: string) => restore(value, false),
    restoreSql: (value: string) => restore(value, true),
  };
}

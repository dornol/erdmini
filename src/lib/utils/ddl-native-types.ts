import type { ColumnType } from '$lib/types/erd';

/** Adapt dimensioned binary types unsupported by the PostgreSQL parser without
 * losing their type/length or touching quoted SQL, comments and identifiers. */
export function protectNativeBinaryTypes(sql: string) {
  const types = new Map<number, { type: ColumnType; length: number }>();
  let marker = 1900000000;
  while (sql.includes(String(marker))) marker--;
  const protectedPart = /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|--[^\n]*|\/\*|\$(?:[A-Za-z_]\w*)?\$/g;
  let output = '', offset = 0;
  const code = (value: string) => value.replace(/\b(BINARY|VARBINARY|RAW)\s*\(\s*(\d+)\s*\)/gi, (_, raw: string, size: string) => {
    while (sql.includes(String(marker))) marker--;
    const id = marker--;
    types.set(id, { type: raw.toUpperCase() === 'RAW' ? 'VARBINARY' : raw.toUpperCase() as ColumnType, length: Number(size) });
    return `VARCHAR(${id})`;
  });
  let match: RegExpExecArray | null;
  while ((match = protectedPart.exec(sql))) {
    output += code(sql.slice(offset, match.index));
    let end = protectedPart.lastIndex;
    if (match[0] === '/*') {
      let depth = 1;
      while (end < sql.length && depth) {
        if (sql.startsWith('/*', end)) { depth++; end += 2; }
        else if (sql.startsWith('*/', end)) { depth--; end += 2; }
        else end++;
      }
      protectedPart.lastIndex = end;
    } else if (match[0].startsWith('$')) {
      const close = sql.indexOf(match[0], end);
      end = close < 0 ? sql.length : close + match[0].length;
      protectedPart.lastIndex = end;
    }
    output += sql.slice(match.index, end); offset = end;
  }
  output += code(sql.slice(offset));
  return { sql: output, types };
}

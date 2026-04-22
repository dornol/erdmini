/**
 * Drizzle ORM schema export.
 *
 * Supports the 3 dialects Drizzle supports natively:
 * - PostgreSQL (drizzle-orm/pg-core)
 * - MySQL (drizzle-orm/mysql-core)
 * - SQLite (drizzle-orm/sqlite-core)
 *
 * Generates TypeScript code defining tables with types, indexes, FKs,
 * and a separate `relations` block for each table.
 */
import type { Column, ERDSchema, ForeignKey, Table, TableIndex, UniqueKey } from '$lib/types/erd';

export type DrizzleDialect = 'postgresql' | 'mysql' | 'sqlite';

export interface DrizzleExportOptions {
  dialect: DrizzleDialect;
  includeRelations: boolean;
}

const DEFAULT_OPTIONS: DrizzleExportOptions = {
  dialect: 'postgresql',
  includeRelations: true,
};

// ─── Naming helpers ──────────────────────────────────────────────────

function toPascalCase(name: string): string {
  return name
    .replace(/[_-]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Valid TS identifier, falls back to `col_N` if name is unusable */
function safeIdent(name: string): string {
  // If already a valid camelCase identifier, leave it alone
  if (/^[a-z][a-zA-Z0-9_]*$/.test(name)) return name;
  // Otherwise camelCase it
  const camel = toCamelCase(name);
  if (/^[a-z_][a-zA-Z0-9_]*$/.test(camel)) return camel;
  return '_' + camel.replace(/[^a-zA-Z0-9_]/g, '');
}

// ─── Drizzle helper-function names per dialect ───────────────────────

interface DrizzleFnInfo {
  /** Drizzle column helper function name (e.g. "integer", "varchar") */
  fn: string;
  /** Arguments passed to the helper after the column name: e.g. `, { length: 100 }` */
  args?: string;
  /** Extra chain methods: e.g. ".primaryKey()" */
  modifiers?: string[];
}

function mapColumnType(col: Column, dialect: DrizzleDialect): DrizzleFnInfo {
  const t = col.type;

  if (dialect === 'postgresql') {
    switch (t) {
      case 'INT': case 'MEDIUMINT': return { fn: 'integer' };
      case 'BIGINT': return { fn: 'bigint', args: `{ mode: 'number' }` };
      case 'SMALLINT': return { fn: 'smallint' };
      case 'TINYINT': return { fn: 'smallint' };
      case 'YEAR': return { fn: 'smallint' };
      case 'BOOLEAN': case 'BIT': return { fn: 'boolean' };
      case 'VARCHAR': case 'NVARCHAR':
        return { fn: 'varchar', args: col.length ? `{ length: ${col.length} }` : undefined };
      case 'CHAR': case 'NCHAR':
        return { fn: 'char', args: col.length ? `{ length: ${col.length} }` : undefined };
      case 'TEXT': case 'NTEXT': return { fn: 'text' };
      case 'DATE': return { fn: 'date' };
      case 'TIME': return { fn: 'time' };
      case 'DATETIME': case 'TIMESTAMP':
        return { fn: 'timestamp', args: `{ mode: 'date' }` };
      case 'DATETIMEOFFSET':
        return { fn: 'timestamp', args: `{ mode: 'date', withTimezone: true }` };
      case 'INTERVAL': return { fn: 'interval' };
      case 'DECIMAL': case 'NUMERIC': {
        const p = col.length ?? 10;
        const s = col.scale ?? 2;
        return { fn: 'numeric', args: `{ precision: ${p}, scale: ${s} }` };
      }
      case 'MONEY': return { fn: 'numeric', args: `{ precision: 19, scale: 4 }` };
      case 'FLOAT': case 'REAL': return { fn: 'real' };
      case 'DOUBLE': return { fn: 'doublePrecision' };
      case 'JSON': return { fn: 'json' };
      case 'JSONB': return { fn: 'jsonb' };
      case 'UUID': return { fn: 'uuid' };
      case 'ENUM': {
        // Drizzle PG enums are defined separately; fall back to varchar here
        return { fn: 'varchar', args: `{ length: 255 }` };
      }
      case 'BINARY': case 'VARBINARY': case 'BLOB':
        return { fn: 'bytea' };
      default: return { fn: 'text' };
    }
  }

  if (dialect === 'mysql') {
    switch (t) {
      case 'INT': case 'MEDIUMINT': return { fn: 'int' };
      case 'BIGINT': return { fn: 'bigint', args: `{ mode: 'number' }` };
      case 'SMALLINT': return { fn: 'smallint' };
      case 'TINYINT': return { fn: 'tinyint' };
      case 'YEAR': return { fn: 'year' };
      case 'BOOLEAN': return { fn: 'boolean' };
      case 'BIT': return { fn: 'tinyint' };
      case 'VARCHAR': case 'NVARCHAR':
        return { fn: 'varchar', args: `{ length: ${col.length ?? 255} }` };
      case 'CHAR': case 'NCHAR':
        return { fn: 'char', args: `{ length: ${col.length ?? 255} }` };
      case 'TEXT': case 'NTEXT': return { fn: 'text' };
      case 'DATE': return { fn: 'date' };
      case 'TIME': return { fn: 'time' };
      case 'DATETIME': return { fn: 'datetime', args: `{ mode: 'date' }` };
      case 'TIMESTAMP': return { fn: 'timestamp', args: `{ mode: 'date' }` };
      case 'DATETIMEOFFSET': return { fn: 'timestamp', args: `{ mode: 'date' }` };
      case 'INTERVAL': return { fn: 'varchar', args: `{ length: 64 }` };
      case 'DECIMAL': case 'NUMERIC': {
        const p = col.length ?? 10;
        const s = col.scale ?? 2;
        return { fn: 'decimal', args: `{ precision: ${p}, scale: ${s} }` };
      }
      case 'MONEY': return { fn: 'decimal', args: `{ precision: 19, scale: 4 }` };
      case 'FLOAT': return { fn: 'float' };
      case 'DOUBLE': return { fn: 'double' };
      case 'REAL': return { fn: 'float' };
      case 'JSON': case 'JSONB': return { fn: 'json' };
      case 'UUID': return { fn: 'varchar', args: `{ length: 36 }` };
      case 'ENUM':
        if (col.enumValues?.length) {
          const values = col.enumValues.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(', ');
          return { fn: 'mysqlEnum', args: `[${values}]` };
        }
        return { fn: 'varchar', args: `{ length: 255 }` };
      case 'BINARY':
        return { fn: 'binary', args: `{ length: ${col.length ?? 255} }` };
      case 'VARBINARY':
        return { fn: 'varbinary', args: `{ length: ${col.length ?? 255} }` };
      case 'BLOB': return { fn: 'longblob' };
      default: return { fn: 'text' };
    }
  }

  // sqlite
  switch (t) {
    case 'INT': case 'BIGINT': case 'SMALLINT': case 'TINYINT': case 'MEDIUMINT':
    case 'YEAR': case 'BOOLEAN': case 'BIT':
      return { fn: 'integer', args: t === 'BOOLEAN' || t === 'BIT' ? `{ mode: 'boolean' }` : undefined };
    case 'VARCHAR': case 'NVARCHAR': case 'CHAR': case 'NCHAR': case 'TEXT': case 'NTEXT':
    case 'UUID': case 'INTERVAL': case 'JSON': case 'JSONB':
      return { fn: 'text' };
    case 'DATE': case 'TIME': case 'DATETIME': case 'TIMESTAMP': case 'DATETIMEOFFSET':
      return { fn: 'integer', args: `{ mode: 'timestamp' }` };
    case 'DECIMAL': case 'NUMERIC': case 'FLOAT': case 'DOUBLE': case 'REAL': case 'MONEY':
      return { fn: 'real' };
    case 'BINARY': case 'VARBINARY': case 'BLOB':
      return { fn: 'blob' };
    case 'ENUM':
      return { fn: 'text' };
    default: return { fn: 'text' };
  }
}

// ─── Default values ──────────────────────────────────────────────────

function buildDefaultCall(col: Column, dialect: DrizzleDialect): string | undefined {
  if (col.autoIncrement) {
    if (dialect === 'sqlite') return undefined; // SQLite uses .primaryKey({ autoIncrement: true })
    return '.generatedAlwaysAsIdentity()'; // PG/MySQL — simpler default for BIGINT/INT PK
  }

  if (col.defaultValue == null) return undefined;
  const dv = col.defaultValue.trim();
  const upper = dv.toUpperCase();

  if (upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') return '.defaultNow()';
  if (upper === 'UUID()' || upper === 'GEN_RANDOM_UUID()') {
    return dialect === 'postgresql' ? '.defaultRandom()' : undefined;
  }

  // Boolean literals
  if (col.type === 'BOOLEAN' || col.type === 'BIT') {
    if (upper === 'TRUE' || upper === '1') return '.default(true)';
    if (upper === 'FALSE' || upper === '0') return '.default(false)';
  }

  // Numeric literals
  if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT', 'FLOAT', 'DOUBLE', 'REAL', 'YEAR'].includes(col.type)) {
    const num = Number(dv);
    if (!isNaN(num)) return `.default(${num})`;
  }

  // String / everything else — wrap as string literal (strip quotes)
  const unquoted = dv.replace(/^['"]|['"]$/g, '');
  return `.default('${unquoted.replace(/'/g, "\\'")}')`;
}

// ─── Column line ─────────────────────────────────────────────────────

function columnLine(col: Column, dialect: DrizzleDialect, tableMap: Map<string, Table>): string {
  const info = mapColumnType(col, dialect);
  const key = safeIdent(col.name);
  const argList = info.args ? `, ${info.args}` : '';
  let line = `${key}: ${info.fn}('${col.name.replace(/'/g, "\\'")}'${argList})`;

  // primaryKey — handled differently in sqlite (autoIncrement)
  if (col.primaryKey) {
    if (col.autoIncrement && dialect === 'sqlite') {
      line += '.primaryKey({ autoIncrement: true })';
    } else {
      line += '.primaryKey()';
    }
  }

  if (!col.nullable && !col.primaryKey) {
    line += '.notNull()';
  }

  if (col.unique && !col.primaryKey) {
    line += '.unique()';
  }

  const defaultCall = buildDefaultCall(col, dialect);
  if (defaultCall) line += defaultCall;

  return line;
}

// ─── Table generation ────────────────────────────────────────────────

function tableFn(dialect: DrizzleDialect): string {
  if (dialect === 'postgresql') return 'pgTable';
  if (dialect === 'mysql') return 'mysqlTable';
  return 'sqliteTable';
}

function modulePath(dialect: DrizzleDialect): string {
  if (dialect === 'postgresql') return 'drizzle-orm/pg-core';
  if (dialect === 'mysql') return 'drizzle-orm/mysql-core';
  return 'drizzle-orm/sqlite-core';
}

function collectImports(schema: ERDSchema, dialect: DrizzleDialect): string[] {
  const imports = new Set<string>();
  imports.add(tableFn(dialect));
  for (const table of schema.tables) {
    for (const col of table.columns) {
      imports.add(mapColumnType(col, dialect).fn);
    }
  }
  return Array.from(imports).sort();
}

function buildTableBlock(
  table: Table,
  dialect: DrizzleDialect,
  tableMap: Map<string, Table>,
  colMap: Map<string, Column>,
): string {
  const lines: string[] = [];
  const fn = tableFn(dialect);
  const varName = toCamelCase(table.name);

  lines.push(`export const ${varName} = ${fn}('${table.name.replace(/'/g, "\\'")}', {`);
  for (const col of table.columns) {
    lines.push(`  ${columnLine(col, dialect, tableMap)},`);
  }

  // Table-level constraints: unique keys, indexes, composite PK, FKs
  const hasTableBlock =
    (table.foreignKeys?.length ?? 0) > 0 ||
    (table.uniqueKeys?.length ?? 0) > 0 ||
    (table.indexes?.length ?? 0) > 0 ||
    table.columns.filter((c) => c.primaryKey).length > 1;

  if (hasTableBlock) {
    lines.push('}, (t) => ({');

    // Composite PK
    const pkCols = table.columns.filter((c) => c.primaryKey);
    if (pkCols.length > 1) {
      const pkList = pkCols.map((c) => `t.${safeIdent(c.name)}`).join(', ');
      lines.push(`  pk: primaryKey({ columns: [${pkList}] }),`);
    }

    // Unique keys
    for (const uk of table.uniqueKeys ?? []) {
      const cols = uk.columnIds
        .map((id) => colMap.get(id))
        .filter((c): c is Column => !!c)
        .map((c) => `t.${safeIdent(c.name)}`)
        .join(', ');
      if (!cols) continue;
      const name = uk.name ? `'${uk.name}'` : `'${table.name}_${uk.columnIds.join('_')}_unique'`;
      lines.push(`  ${safeIdent(uk.name || `uk_${uk.columnIds[0]}`)}: unique(${name}).on(${cols}),`);
    }

    // Indexes
    for (const idx of table.indexes ?? []) {
      const cols = idx.columnIds
        .map((id) => colMap.get(id))
        .filter((c): c is Column => !!c)
        .map((c) => `t.${safeIdent(c.name)}`)
        .join(', ');
      if (!cols) continue;
      const name = idx.name ? `'${idx.name}'` : `'${table.name}_idx_${idx.columnIds.join('_')}'`;
      lines.push(`  ${safeIdent(idx.name || `idx_${idx.columnIds[0]}`)}: index(${name}).on(${cols}),`);
    }

    lines.push('}));');
  } else {
    lines.push('});');
  }

  return lines.join('\n');
}

function buildRelationsBlock(
  table: Table,
  tableMap: Map<string, Table>,
): string | null {
  const outgoingFks = table.foreignKeys ?? [];
  if (outgoingFks.length === 0) return null;

  const varName = toCamelCase(table.name);
  const lines: string[] = [];
  lines.push(`export const ${varName}Relations = relations(${varName}, ({ one }) => ({`);
  for (const fk of outgoingFks) {
    const parent = tableMap.get(fk.referencedTableId);
    if (!parent) continue;
    const parentVar = toCamelCase(parent.name);
    const fieldName = safeIdent(parent.name.toLowerCase());
    const fieldCols = fk.columnIds.map((id) => `${varName}.${safeIdent(table.columns.find((c) => c.id === id)?.name ?? id)}`).join(', ');
    const refCols = fk.referencedColumnIds.map((id) => `${parentVar}.${safeIdent(parent.columns.find((c) => c.id === id)?.name ?? id)}`).join(', ');
    lines.push(`  ${fieldName}: one(${parentVar}, { fields: [${fieldCols}], references: [${refCols}] }),`);
  }
  lines.push('}));');
  return lines.join('\n');
}

// ─── Main export ─────────────────────────────────────────────────────

export function exportDrizzle(schema: ERDSchema, options?: Partial<DrizzleExportOptions>): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { dialect } = opts;

  if (schema.tables.length === 0) {
    return `// Empty schema\nimport { ${tableFn(dialect)} } from '${modulePath(dialect)}';\n`;
  }

  const tableMap = new Map<string, Table>();
  const colMap = new Map<string, Column>();
  for (const table of schema.tables) {
    tableMap.set(table.id, table);
    for (const col of table.columns) {
      colMap.set(col.id, col);
    }
  }

  const lines: string[] = [];

  // Imports — include helpers needed by tables + relations helpers if needed
  const helperImports = collectImports(schema, dialect);

  // Check if we need index, unique, primaryKey helpers
  let needsIndex = false;
  let needsUnique = false;
  let needsPrimaryKey = false;
  for (const table of schema.tables) {
    if ((table.indexes?.length ?? 0) > 0) needsIndex = true;
    if ((table.uniqueKeys?.length ?? 0) > 0) needsUnique = true;
    if (table.columns.filter((c) => c.primaryKey).length > 1) needsPrimaryKey = true;
  }
  if (needsIndex) helperImports.push('index');
  if (needsUnique) helperImports.push('unique');
  if (needsPrimaryKey) helperImports.push('primaryKey');

  const dedupedImports = Array.from(new Set(helperImports)).sort();
  lines.push(`import { ${dedupedImports.join(', ')} } from '${modulePath(dialect)}';`);

  // Relations import
  const hasAnyFk = schema.tables.some((t) => (t.foreignKeys?.length ?? 0) > 0);
  if (hasAnyFk && opts.includeRelations) {
    lines.push(`import { relations } from 'drizzle-orm';`);
  }
  lines.push('');

  // Tables
  for (const table of schema.tables) {
    lines.push(buildTableBlock(table, dialect, tableMap, colMap));
    lines.push('');
  }

  // Relations
  if (opts.includeRelations && hasAnyFk) {
    for (const table of schema.tables) {
      const block = buildRelationsBlock(table, tableMap);
      if (block) {
        lines.push(block);
        lines.push('');
      }
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

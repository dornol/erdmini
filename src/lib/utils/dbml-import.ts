import type { Column, ColumnType, ReferentialAction, Table, UniqueKey, TableIndex } from '$lib/types/erd';
import type { ImportResult } from '$lib/utils/ddl-import-types';
import { generateId } from '$lib/utils/common';
import { IMPORT_GRID_COLS, IMPORT_GRID_GAP_X, IMPORT_GRID_GAP_Y, IMPORT_GRID_OFFSET } from '$lib/constants/layout';

export interface DBMLImportMessages {
  noTables: () => string;
  noPkWarning: (params: { table: string }) => string;
  fkResolveFailed: (params: { detail: string }) => string;
}

const DEFAULT_MESSAGES: DBMLImportMessages = {
  noTables: () => 'No table definitions found.',
  noPkWarning: ({ table }) => `Table ${table} has no primary key.`,
  fkResolveFailed: ({ detail }) => `FK resolve failed: ${detail}`,
};

// DBML type → ERD ColumnType
const DBML_TYPE_MAP: Record<string, ColumnType> = {
  int: 'INT',
  integer: 'INT',
  bigint: 'BIGINT',
  smallint: 'SMALLINT',
  tinyint: 'SMALLINT',
  varchar: 'VARCHAR',
  char: 'CHAR',
  text: 'TEXT',
  bool: 'BOOLEAN',
  boolean: 'BOOLEAN',
  date: 'DATE',
  datetime: 'DATETIME',
  timestamp: 'TIMESTAMP',
  timestamptz: 'TIMESTAMP',
  decimal: 'DECIMAL',
  numeric: 'DECIMAL',
  float: 'FLOAT',
  real: 'FLOAT',
  double: 'DOUBLE',
  json: 'JSON',
  jsonb: 'JSON',
  uuid: 'UUID',
  enum: 'ENUM',
  serial: 'INT',
  bigserial: 'BIGINT',
};

function normalizeType(raw: string): { type: ColumnType; length?: number; scale?: number } {
  // Handle type(length) or type(precision,scale)
  const match = raw.match(/^(\w+)\s*(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/);
  if (!match) return { type: 'VARCHAR' };

  const typeName = match[1].toLowerCase();
  const length = match[2] ? parseInt(match[2]) : undefined;
  const scale = match[3] ? parseInt(match[3]) : undefined;

  const mapped = DBML_TYPE_MAP[typeName] ?? 'VARCHAR';

  // serial/bigserial imply auto-increment (handled in column parsing)
  return { type: mapped, length, scale };
}

interface ParsedRef {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

interface TableAlias {
  name: string;
  alias: string;
}

/**
 * Import DBML source into ERD tables.
 *
 * Supports:
 * - Table definitions with schema prefix
 * - Column settings [pk, not null, unique, increment, default, note, ref]
 * - Enum blocks
 * - Ref statements (standalone and inline)
 * - Indexes blocks
 * - Table aliases
 * - Single-line comments (//)
 * - Table groups (Table ... [headercolor: ...])
 */
export function importDBML(
  source: string,
  messages?: Partial<DBMLImportMessages>,
): ImportResult {
  const msg: DBMLImportMessages = { ...DEFAULT_MESSAGES, ...messages };
  const errors: string[] = [];
  const warnings: string[] = [];

  // Strip single-line comments and multi-line comments
  const cleaned = source
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Collect enums: Enum name { val1\n val2 }
  const enums = new Map<string, string[]>();
  const enumRegex = /Enum\s+([\w.]+)\s*\{([^}]*)\}/gi;
  let enumMatch;
  while ((enumMatch = enumRegex.exec(cleaned)) !== null) {
    const enumName = enumMatch[1];
    const body = enumMatch[2];
    const values: string[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Value can be: val [note: 'text']
      const valMatch = trimmed.match(/^([\w]+)/);
      if (valMatch) values.push(valMatch[1]);
    }
    enums.set(enumName, values);
    enums.set(enumName.toLowerCase(), values);
  }

  // Collect table aliases
  const aliases: TableAlias[] = [];

  // Parse tables
  const tables: Table[] = [];
  const tableByName = new Map<string, Table>();
  const pendingRefs: ParsedRef[] = [];

  // Match Table blocks: Table schema.name as alias { ... }
  // Use a manual approach for nested braces
  const tableStarts: { fullName: string; alias?: string; bodyStart: number }[] = [];
  const tableRegex = /Table\s+([\w.]+)(?:\s+as\s+(\w+))?\s*\{/gi;
  let tMatch;
  while ((tMatch = tableRegex.exec(cleaned)) !== null) {
    tableStarts.push({
      fullName: tMatch[1],
      alias: tMatch[2],
      bodyStart: tMatch.index + tMatch[0].length,
    });
  }

  for (const ts of tableStarts) {
    const body = extractBlock(cleaned, ts.bodyStart);
    if (body === null) {
      errors.push(`Failed to parse table block for ${ts.fullName}`);
      continue;
    }

    // Parse schema.name
    let schema: string | undefined;
    let tableName: string;
    if (ts.fullName.includes('.')) {
      const parts = ts.fullName.split('.');
      schema = parts[0];
      tableName = parts.slice(1).join('.');
    } else {
      tableName = ts.fullName;
    }

    if (ts.alias) {
      aliases.push({ name: tableName, alias: ts.alias });
    }

    const tableId = generateId();
    const columns: Column[] = [];
    const uniqueKeys: UniqueKey[] = [];
    const indexes: TableIndex[] = [];
    let tableNote: string | undefined;

    // Split body into sections: columns before Indexes/Note blocks
    const sections = splitTableBody(body);

    // Parse columns
    const serialColIds: string[] = [];
    for (const line of sections.columnLines) {
      const parsed = parseColumnLine(line, enums, tableId, tableName, pendingRefs, warnings);
      if (parsed) {
        columns.push(parsed.column);
        if (parsed.isSerial) serialColIds.push(parsed.column.id);
      }
    }

    // Parse indexes block
    if (sections.indexesBody) {
      parseIndexesBlock(sections.indexesBody, columns, uniqueKeys, indexes);
    }

    // Parse note
    if (sections.noteBody) {
      tableNote = sections.noteBody;
    }

    // Serial columns: auto-promote to PK if no explicit PK exists
    if (serialColIds.length > 0 && !columns.some((c) => c.primaryKey)) {
      for (const col of columns) {
        if (serialColIds.includes(col.id)) {
          col.primaryKey = true;
          col.nullable = false;
        }
      }
    }

    if (!columns.some((c) => c.primaryKey) && columns.length > 0) {
      warnings.push(msg.noPkWarning({ table: tableName }));
    }

    const idx = tables.length;
    const table: Table = {
      id: tableId,
      name: tableName,
      columns,
      foreignKeys: [],
      uniqueKeys,
      indexes,
      position: {
        x: (idx % IMPORT_GRID_COLS) * IMPORT_GRID_GAP_X + IMPORT_GRID_OFFSET,
        y: Math.floor(idx / IMPORT_GRID_COLS) * IMPORT_GRID_GAP_Y + IMPORT_GRID_OFFSET,
      },
      ...(schema ? { schema } : {}),
      ...(tableNote ? { comment: tableNote } : {}),
    };

    tables.push(table);
    tableByName.set(tableName.toLowerCase(), table);
    if (ts.alias) {
      tableByName.set(ts.alias.toLowerCase(), table);
    }
    if (schema) {
      tableByName.set(`${schema}.${tableName}`.toLowerCase(), table);
    }
  }

  // Parse standalone Ref statements
  const refRegex = /Ref(?:\s+\w+)?\s*:\s*([^\n{]+?)(?:\s*\[([^\]]*)\])?\s*(?:\n|$)/gi;
  let rMatch;
  while ((rMatch = refRegex.exec(cleaned)) !== null) {
    const refBody = rMatch[1].trim();
    const settings = rMatch[2] || '';
    const parsed = parseRefExpression(refBody, settings);
    if (parsed) {
      pendingRefs.push(parsed);
    }
  }

  // Resolve FKs
  for (const ref of pendingRefs) {
    const fromTable = resolveTable(ref.fromTable, tableByName, aliases);
    const toTable = resolveTable(ref.toTable, tableByName, aliases);

    if (!fromTable || !toTable) {
      warnings.push(
        msg.fkResolveFailed({
          detail: `${ref.fromTable}.${ref.fromColumns.join(',')} → ${ref.toTable}.${ref.toColumns.join(',')}`,
        }),
      );
      continue;
    }

    const fromColIds: string[] = [];
    const toColIds: string[] = [];
    let resolved = true;

    for (const colName of ref.fromColumns) {
      const col = fromTable.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      if (!col) {
        resolved = false;
        break;
      }
      fromColIds.push(col.id);
    }

    for (const colName of ref.toColumns) {
      const col = toTable.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      if (!col) {
        resolved = false;
        break;
      }
      toColIds.push(col.id);
    }

    if (!resolved) {
      warnings.push(
        msg.fkResolveFailed({
          detail: `${ref.fromTable}.${ref.fromColumns.join(',')} → ${ref.toTable}.${ref.toColumns.join(',')}`,
        }),
      );
      continue;
    }

    fromTable.foreignKeys.push({
      id: generateId(),
      columnIds: fromColIds,
      referencedTableId: toTable.id,
      referencedColumnIds: toColIds,
      onDelete: ref.onDelete,
      onUpdate: ref.onUpdate,
    });
  }

  if (tables.length === 0) {
    errors.push(msg.noTables());
  }

  return { tables, errors, warnings };
}

function resolveTable(
  name: string,
  tableByName: Map<string, Table>,
  aliases: TableAlias[],
): Table | undefined {
  const lower = name.toLowerCase();
  if (tableByName.has(lower)) return tableByName.get(lower);

  // Try alias
  const alias = aliases.find((a) => a.alias.toLowerCase() === lower);
  if (alias) return tableByName.get(alias.name.toLowerCase());

  return undefined;
}

/** Extract a brace-delimited block starting after the opening brace. */
function extractBlock(source: string, start: number): string | null {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

interface TableBodySections {
  columnLines: string[];
  indexesBody?: string;
  noteBody?: string;
}

function splitTableBody(body: string): TableBodySections {
  const columnLines: string[] = [];
  let indexesBody: string | undefined;
  let noteBody: string | undefined;

  // Find Indexes { ... } block
  const indexesMatch = body.match(/Indexes\s*\{/i);
  let indexesStart = -1;
  let indexesEnd = -1;
  if (indexesMatch && indexesMatch.index !== undefined) {
    indexesStart = indexesMatch.index;
    const blockStart = indexesStart + indexesMatch[0].length;
    const block = extractBlock(body, blockStart);
    if (block !== null) {
      indexesBody = block;
      indexesEnd = blockStart + block.length + 1; // +1 for closing brace
    }
  }

  // Find Note: 'text' or Note { 'text' }
  const noteMatch = body.match(/Note\s*:\s*'([^']*)'/i) || body.match(/Note\s*:\s*"([^"]*)"/i);
  if (noteMatch) {
    noteBody = noteMatch[1];
  }

  // Extract column lines (everything outside Indexes/Note blocks)
  const lines = body.split('\n');
  let inIndexes = false;
  let indexDepth = 0;
  let inNote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip Note lines
    if (/^Note\s*[:{\s]/i.test(trimmed)) {
      inNote = true;
      if (!trimmed.includes('{')) inNote = false;
      continue;
    }
    if (inNote) {
      if (trimmed.includes('}')) inNote = false;
      continue;
    }

    // Skip Indexes block lines
    if (/^Indexes\s*\{/i.test(trimmed)) {
      inIndexes = true;
      indexDepth = 1;
      continue;
    }
    if (inIndexes) {
      for (const ch of trimmed) {
        if (ch === '{') indexDepth++;
        else if (ch === '}') indexDepth--;
      }
      if (indexDepth <= 0) inIndexes = false;
      continue;
    }

    columnLines.push(trimmed);
  }

  return { columnLines, indexesBody, noteBody };
}

interface ParsedColumn {
  column: Column;
  isSerial: boolean;
}

function parseColumnLine(
  line: string,
  enums: Map<string, string[]>,
  tableId: string,
  tableName: string,
  pendingRefs: ParsedRef[],
  warnings: string[],
): ParsedColumn | null {
  // Column format: name type [settings]
  // Also handle: name type(length) [settings]

  const settingsMatch = line.match(/\[([^\]]*)\]\s*$/);
  const settings = settingsMatch ? settingsMatch[1] : '';
  const beforeSettings = settingsMatch ? line.slice(0, settingsMatch.index).trim() : line.trim();

  // Split name and type — first token is name, rest is type
  const tokens = beforeSettings.match(/^(\w+)\s+(.+)$/);
  if (!tokens) return null;

  const colName = tokens[1];
  const rawType = tokens[2].trim();

  // Check if this is an enum reference
  let enumValues: string[] | undefined;
  let typeInfo: { type: ColumnType; length?: number; scale?: number };

  const enumVals = enums.get(rawType) || enums.get(rawType.toLowerCase());
  if (enumVals) {
    typeInfo = { type: 'ENUM' };
    enumValues = enumVals;
  } else {
    typeInfo = normalizeType(rawType);
  }

  const isSerial = rawType.toLowerCase() === 'serial' || rawType.toLowerCase() === 'bigserial';

  // Parse settings
  let pk = false;
  let nullable = true;
  let unique = false;
  let autoIncrement = isSerial;
  let defaultValue: string | undefined;
  let comment: string | undefined;

  if (settings) {
    const settingParts = splitSettings(settings);
    for (const part of settingParts) {
      const trimmed = part.trim();
      const lower = trimmed.toLowerCase();

      if (lower === 'pk' || lower === 'primary key') {
        pk = true;
        nullable = false;
      } else if (lower === 'not null') {
        nullable = false;
      } else if (lower === 'null') {
        nullable = true;
      } else if (lower === 'unique') {
        unique = true;
      } else if (lower === 'increment') {
        autoIncrement = true;
      } else if (lower.startsWith('default:')) {
        defaultValue = trimmed.slice('default:'.length).trim().replace(/^['"`]|['"`]$/g, '');
      } else if (lower.startsWith('note:')) {
        comment = trimmed.slice('note:'.length).trim().replace(/^['"`]|['"`]$/g, '');
      } else if (lower.startsWith('ref:')) {
        const refExpr = trimmed.slice('ref:'.length).trim();
        parseInlineRef(refExpr, tableName, colName, pendingRefs);
      }
    }
  }

  if (pk) nullable = false;

  return {
    column: {
      id: generateId(),
      name: colName,
      type: typeInfo.type,
      ...(typeInfo.length !== undefined ? { length: typeInfo.length } : {}),
      ...(typeInfo.scale !== undefined ? { scale: typeInfo.scale } : {}),
      nullable,
      primaryKey: pk,
      unique,
      autoIncrement,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(comment ? { comment } : {}),
      ...(enumValues ? { enumValues } : {}),
    },
    isSerial: isSerial && !pk,
  };
}

/**
 * Split settings string by commas, respecting quoted strings and nested content.
 */
function splitSettings(settings: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let depth = 0;

  for (let i = 0; i < settings.length; i++) {
    const ch = settings[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
    } else if (ch === "'" || ch === '"') {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseInlineRef(
  expr: string,
  fromTable: string,
  fromColumn: string,
  pendingRefs: ParsedRef[],
) {
  // Format: > table.col or < table.col or - table.col
  const match = expr.match(/^([><\-])\s*([\w.]+)\.([\w.]+)$/);
  if (!match) return;

  const direction = match[1];
  const targetTable = match[2];
  const targetCol = match[3];

  if (direction === '>') {
    // many-to-one: fromTable.fromColumn > targetTable.targetCol
    pendingRefs.push({
      fromTable,
      fromColumns: [fromColumn],
      toTable: targetTable,
      toColumns: [targetCol],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  } else if (direction === '<') {
    // one-to-many: reversed
    pendingRefs.push({
      fromTable: targetTable,
      fromColumns: [targetCol],
      toTable: fromTable,
      toColumns: [fromColumn],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  } else {
    // one-to-one: same as >
    pendingRefs.push({
      fromTable,
      fromColumns: [fromColumn],
      toTable: targetTable,
      toColumns: [targetCol],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  }
}

function parseRefExpression(expr: string, settings: string): ParsedRef | null {
  // Format: table1.col1 > table2.col2
  // Or: table1.(col1, col2) > table2.(col1, col2)
  const match = expr.match(
    /^([\w.]+)\.([\w]+|\([^)]+\))\s*([><\-])\s*([\w.]+)\.([\w]+|\([^)]+\))$/,
  );
  if (!match) return null;

  const leftTable = match[1];
  const leftCols = parseColumnList(match[2]);
  const direction = match[3];
  const rightTable = match[4];
  const rightCols = parseColumnList(match[5]);

  // Parse settings [delete: cascade, update: no action]
  let onDelete: ReferentialAction = 'NO ACTION';
  let onUpdate: ReferentialAction = 'NO ACTION';

  if (settings) {
    const deleteMatch = settings.match(/delete\s*:\s*([\w\s]+?)(?:,|$)/i);
    if (deleteMatch) onDelete = parseRefAction(deleteMatch[1].trim());

    const updateMatch = settings.match(/update\s*:\s*([\w\s]+?)(?:,|$)/i);
    if (updateMatch) onUpdate = parseRefAction(updateMatch[1].trim());
  }

  if (direction === '>') {
    return { fromTable: leftTable, fromColumns: leftCols, toTable: rightTable, toColumns: rightCols, onDelete, onUpdate };
  } else if (direction === '<') {
    return { fromTable: rightTable, fromColumns: rightCols, toTable: leftTable, toColumns: leftCols, onDelete, onUpdate };
  } else {
    // one-to-one
    return { fromTable: leftTable, fromColumns: leftCols, toTable: rightTable, toColumns: rightCols, onDelete, onUpdate };
  }
}

function parseColumnList(raw: string): string[] {
  if (raw.startsWith('(') && raw.endsWith(')')) {
    return raw.slice(1, -1).split(',').map((s) => s.trim());
  }
  return [raw];
}

function parseRefAction(raw: string): ReferentialAction {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ');
  switch (lower) {
    case 'cascade': return 'CASCADE';
    case 'set null': return 'SET NULL';
    case 'restrict': return 'RESTRICT';
    case 'no action': return 'NO ACTION';
    default: return 'NO ACTION';
  }
}

function parseIndexesBlock(
  body: string,
  columns: Column[],
  uniqueKeys: UniqueKey[],
  indexes: TableIndex[],
) {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse: col [unique, name: 'idx_name']
    // Or: (col1, col2) [unique, name: 'idx_name']
    const settingsMatch = trimmed.match(/\[([^\]]*)\]\s*$/);
    const settings = settingsMatch ? settingsMatch[1] : '';
    const beforeSettings = settingsMatch ? trimmed.slice(0, settingsMatch.index).trim() : trimmed;

    const colNames = parseColumnList(beforeSettings.trim());

    // Resolve column IDs
    const colIds: string[] = [];
    for (const name of colNames) {
      const col = columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (col) colIds.push(col.id);
    }

    if (colIds.length === 0) continue;

    let isUnique = false;
    let idxName: string | undefined;

    if (settings) {
      for (const part of splitSettings(settings)) {
        const t = part.trim().toLowerCase();
        if (t === 'unique') {
          isUnique = true;
        } else if (t === 'pk' || t === 'primary key') {
          // Mark columns as PK
          for (const id of colIds) {
            const col = columns.find((c) => c.id === id);
            if (col) {
              col.primaryKey = true;
              col.nullable = false;
            }
          }
          continue;
        }
        const nameMatch = part.trim().match(/^name\s*:\s*['"]?([^'"]+)['"]?$/i);
        if (nameMatch) idxName = nameMatch[1];
      }
    }

    if (isUnique) {
      uniqueKeys.push({
        id: generateId(),
        columnIds: colIds,
        ...(idxName ? { name: idxName } : {}),
      });
    } else {
      indexes.push({
        id: generateId(),
        columnIds: colIds,
        unique: false,
        ...(idxName ? { name: idxName } : {}),
      });
    }
  }
}

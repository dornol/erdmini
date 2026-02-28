import type { Column, ColumnType, ForeignKey, ReferentialAction, Table } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Strip schema prefix: "acquisition.SPRING_SESSION" → "SPRING_SESSION"
function stripSchemaPrefix(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : name;
}

function normalizeType(raw: string): ColumnType {
  const upper = raw.toUpperCase().trim();
  // Strip length params: VARCHAR(255) → VARCHAR, DECIMAL(5, 4) → DECIMAL
  const base = upper.replace(/\s*\([^)]*\)/, '').trim();

  if (base === 'SERIAL') return 'INT';
  if (base === 'BIGSERIAL') return 'BIGINT';
  if (base === 'INTEGER') return 'INT';
  if (base === 'TINYINT') return 'SMALLINT';
  if (base === 'MEDIUMINT') return 'INT';
  if (base === 'TINYTEXT' || base === 'MEDIUMTEXT' || base === 'LONGTEXT') return 'TEXT';
  if (base === 'TINYBLOB' || base === 'BLOB' || base === 'MEDIUMBLOB' || base === 'LONGBLOB') return 'TEXT';
  if (base === 'BOOL' || base === 'BIT') return 'BOOLEAN';
  if (base === 'DATETIME' || base === 'TIMESTAMP' || base === 'TIMESTAMPTZ') return 'TIMESTAMP';
  if (base === 'NUMERIC' || base === 'REAL' || base === 'MONEY') return 'DECIMAL';
  if (base === 'CHARACTER VARYING') return 'VARCHAR';
  if (base === 'CHARACTER') return 'CHAR';

  if ((COLUMN_TYPES as readonly string[]).includes(base)) return base as ColumnType;
  return 'VARCHAR';
}

function extractLength(raw: string): number | undefined {
  const m = raw.match(/\(\s*(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseReferentialAction(raw: string): ReferentialAction {
  const u = raw.trim().toUpperCase();
  if (u === 'CASCADE') return 'CASCADE';
  if (u === 'SET NULL') return 'SET NULL';
  if (u === 'RESTRICT') return 'RESTRICT';
  return 'NO ACTION';
}

function stripQuotes(name: string): string {
  return name.replace(/^[`"'\[]+|[`"'\]]+$/g, '').trim();
}

interface ParsedFK {
  columnName: string;
  refTableName: string;
  refColumnName: string;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

interface ParsedTable {
  name: string;
  comment?: string;
  columns: Column[];
  primaryKeys: string[];
  uniqueColumns: string[];
  foreignKeys: ParsedFK[];
}

/**
 * Finds all CREATE TABLE blocks using paren-counting.
 * This handles any suffix between the closing ')' and ';'
 * (e.g., "ENGINE=InnoDB", "comment '...'", etc.)
 */
function extractCreateTableBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const normalized = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Regex that matches up to and including the opening '(' of the table body
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`[^`]+`|"[^"]+"|[\w$.]+)\s*\(/gi;

  let m: RegExpExecArray | null;
  while ((m = createRe.exec(normalized)) !== null) {
    const blockStart = m.index;
    // m[0] ends with '(', so parenOpenIdx is the last char of m[0]
    const parenOpenIdx = m.index + m[0].length - 1;

    // Count matching parens
    let depth = 1;
    let i = parenOpenIdx + 1;
    for (; i < normalized.length && depth > 0; i++) {
      if (normalized[i] === '(') depth++;
      else if (normalized[i] === ')') depth--;
    }
    // i is now right after the matching ')'

    // Find the next ';' after the closing paren
    const semiIdx = normalized.indexOf(';', i - 1);
    if (semiIdx >= 0) {
      blocks.push(normalized.slice(blockStart, semiIdx + 1));
      createRe.lastIndex = semiIdx + 1;
    } else {
      createRe.lastIndex = i;
    }
  }

  return blocks;
}

function parseCreateTable(block: string): ParsedTable | null {
  const tableNameMatch = block.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(`[^`]+`|"[^"]+"|[\w$.]+)\s*\(/i,
  );
  if (!tableNameMatch) return null;
  // Strip schema prefix (e.g., "acquisition.SPRING_SESSION" → "SPRING_SESSION")
  const tableName = stripSchemaPrefix(stripQuotes(tableNameMatch[1]));

  // Extract inner body between first ( and matching )
  const firstParen = block.indexOf('(');
  if (firstParen < 0) return null;
  let depth = 0;
  let bodyEnd = firstParen;
  for (let i = firstParen; i < block.length; i++) {
    if (block[i] === '(') depth++;
    else if (block[i] === ')') {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  const body = block.slice(firstParen + 1, bodyEnd);

  // Split by top-level commas
  const parts: string[] = [];
  let current = '';
  let d = 0;
  for (const ch of body) {
    if (ch === '(') d++;
    else if (ch === ')') d--;
    if (ch === ',' && d === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const columns: Column[] = [];
  const primaryKeys: string[] = [];
  const uniqueColumns: string[] = [];
  const foreignKeys: ParsedFK[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();

    // Table-level PRIMARY KEY
    if (upper.startsWith('PRIMARY KEY')) {
      const pkM = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkM) {
        pkM[1].split(',').forEach((col) => primaryKeys.push(stripQuotes(col.trim())));
      }
      continue;
    }

    // Table-level UNIQUE KEY / UNIQUE INDEX / UNIQUE
    if (upper.startsWith('UNIQUE')) {
      const uqM = trimmed.match(/UNIQUE(?:\s+(?:KEY|INDEX)\s+\S+)?\s*\(([^)]+)\)/i);
      if (uqM) {
        uqM[1].split(',').forEach((col) => uniqueColumns.push(stripQuotes(col.trim())));
      }
      continue;
    }

    // Table-level FOREIGN KEY (including CONSTRAINT ... FOREIGN KEY)
    if (upper.startsWith('FOREIGN KEY') || upper.startsWith('CONSTRAINT')) {
      const fkM = trimmed.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(`[^`]+`|"[^"]+"|[\w$.]+)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?(?:\s+ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i,
      );
      if (fkM) {
        foreignKeys.push({
          columnName: stripQuotes(fkM[1].trim()),
          // Strip schema prefix from referenced table name
          refTableName: stripSchemaPrefix(stripQuotes(fkM[2])),
          refColumnName: stripQuotes(fkM[3].trim()),
          onDelete: parseReferentialAction(fkM[4] ?? 'RESTRICT'),
          onUpdate: parseReferentialAction(fkM[5] ?? 'RESTRICT'),
        });
      }
      continue;
    }

    // Skip KEY / INDEX lines
    if (upper.startsWith('KEY ') || upper.startsWith('INDEX ')) continue;

    // Column definition
    // Use [\w$]+ for type name (handles word chars only, no spaces)
    // (?:\s*\([^)]*\))? handles optional (length) or (precision, scale) including spaces
    const colMatch = trimmed.match(
      /^(`[^`]+`|"[^"]+"|[\w$]+)\s+([\w$]+(?:\s*\([^)]*\))?)(.*)/is,
    );
    if (!colMatch) continue;

    const colName = stripQuotes(colMatch[1]);
    const rawType = colMatch[2].trim();
    const restOrig = colMatch[3];          // preserve original case for comment extraction
    const rest = restOrig.toUpperCase();

    const type = normalizeType(rawType);
    const length = extractLength(rawType);
    const nullable = !rest.includes('NOT NULL');
    const primaryKey = rest.includes('PRIMARY KEY');
    const unique = rest.includes('UNIQUE');
    const autoIncrement =
      rest.includes('AUTO_INCREMENT') ||
      rawType.toUpperCase().startsWith('SERIAL') ||
      rawType.toUpperCase().startsWith('BIGSERIAL');
    const defaultMatch = trimmed.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|\S+)/i);
    const defaultValue = defaultMatch ? defaultMatch[1].replace(/^'|'$/g, '') : undefined;
    // Extract inline COMMENT '...' (MySQL style)
    const colCommentMatch = restOrig.match(/\bCOMMENT\s+'((?:[^'\\]|\\.)*)'/i);
    const colComment = colCommentMatch ? colCommentMatch[1].replace(/\\'/g, "'") : undefined;

    if (primaryKey) primaryKeys.push(colName);

    const col: Column = {
      id: generateId(),
      name: colName,
      type,
      nullable,
      primaryKey,
      unique,
      autoIncrement,
    };
    if (length !== undefined) col.length = length;
    if (defaultValue !== undefined) col.defaultValue = defaultValue;
    if (colComment) col.comment = colComment;

    columns.push(col);
  }

  // Apply table-level PRIMARY KEY / UNIQUE to columns
  for (const col of columns) {
    if (primaryKeys.includes(col.name)) col.primaryKey = true;
    if (uniqueColumns.includes(col.name)) col.unique = true;
  }

  // Parse table-level COMMENT from the suffix after the closing paren (MySQL: COMMENT='...')
  const suffix = block.slice(bodyEnd + 1);
  const tableCommentMatch = suffix.match(/\bCOMMENT\s*=?\s*'((?:[^'\\]|\\.)*)'/i);
  const tableComment = tableCommentMatch ? tableCommentMatch[1].replace(/\\'/g, "'") : undefined;

  return { name: tableName, comment: tableComment, columns, primaryKeys, uniqueColumns, foreignKeys };
}

function getUniqueName(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name;
  let i = 1;
  while (existing.includes(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}

export interface ImportResult {
  tables: Table[];
  errors: string[];
}

export function importDDL(sql: string): ImportResult {
  const errors: string[] = [];
  const tables: Table[] = [];
  const existingNames: string[] = [];

  // Parse ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY statements
  const alterFKMap: Map<string, ParsedFK[]> = new Map();
  const alterRe =
    /ALTER\s+TABLE\s+(`[^`]+`|"[^"]+"|[\w$.]+)\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(`[^`]+`|"[^"]+"|[\w$.]+)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?(?:\s+ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/gi;
  let altM: RegExpExecArray | null;
  while ((altM = alterRe.exec(sql)) !== null) {
    const tName = stripSchemaPrefix(stripQuotes(altM[1]));
    const existing = alterFKMap.get(tName) ?? [];
    existing.push({
      columnName: stripQuotes(altM[2].trim()),
      refTableName: stripSchemaPrefix(stripQuotes(altM[3])),
      refColumnName: stripQuotes(altM[4].trim()),
      onDelete: parseReferentialAction(altM[5] ?? 'RESTRICT'),
      onUpdate: parseReferentialAction(altM[6] ?? 'RESTRICT'),
    });
    alterFKMap.set(tName, existing);
  }

  const blocks = extractCreateTableBlocks(sql);
  if (blocks.length === 0) {
    errors.push('CREATE TABLE 구문을 찾을 수 없습니다.');
    return { tables, errors };
  }

  const GRID_COLS = 4;
  const GRID_GAP_X = 300;
  const GRID_GAP_Y = 220;

  // First pass: create all tables (store parsed data alongside for FK resolution)
  const parsedPairs: { table: Table; parsed: ParsedTable }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    try {
      const parsed = parseCreateTable(blocks[i]);
      if (!parsed) {
        errors.push(`블록 ${i + 1} 파싱 실패`);
        continue;
      }

      const uniqueName = getUniqueName(parsed.name, existingNames);
      existingNames.push(uniqueName);

      const col = parsedPairs.length % GRID_COLS;
      const row = Math.floor(parsedPairs.length / GRID_COLS);
      const position = { x: 40 + col * GRID_GAP_X, y: 40 + row * GRID_GAP_Y };

      const table: Table = {
        id: generateId(),
        name: uniqueName,
        columns: parsed.columns,
        foreignKeys: [],
        position,
        comment: parsed.comment,
      };
      parsedPairs.push({ table, parsed: { ...parsed, name: uniqueName } });
      tables.push(table);
    } catch (e) {
      errors.push(`블록 ${i + 1} 오류: ${e}`);
    }
  }

  // Second pass: resolve foreign keys using stored parsed data
  for (const { table, parsed } of parsedPairs) {
    const fkDefs = [
      ...parsed.foreignKeys,
      ...(alterFKMap.get(table.name) ?? []),
    ];
    for (const fkDef of fkDefs) {
      const srcCol = table.columns.find((c) => c.name === fkDef.columnName);
      const refTable = tables.find((t) => t.name === fkDef.refTableName);
      const refCol = refTable?.columns.find((c) => c.name === fkDef.refColumnName);
      if (!srcCol || !refTable || !refCol) {
        errors.push(
          `FK 해결 실패: ${table.name}.${fkDef.columnName} → ${fkDef.refTableName}.${fkDef.refColumnName}`,
        );
        continue;
      }
      const fk: ForeignKey = {
        id: generateId(),
        columnId: srcCol.id,
        referencedTableId: refTable.id,
        referencedColumnId: refCol.id,
        onDelete: fkDef.onDelete,
        onUpdate: fkDef.onUpdate,
      };
      table.foreignKeys.push(fk);
    }
  }

  // Parse PostgreSQL COMMENT ON TABLE / COMMENT ON COLUMN statements
  const commentOnTableRe =
    /COMMENT\s+ON\s+TABLE\s+(`[^`]+`|"[^"]+"|[\w$.]+)\s+IS\s+'((?:[^'\\]|\\.)*)'\s*;/gi;
  let cotM: RegExpExecArray | null;
  while ((cotM = commentOnTableRe.exec(sql)) !== null) {
    const tName = stripSchemaPrefix(stripQuotes(cotM[1]));
    const tComment = cotM[2].replace(/\\'/g, "'");
    const t = tables.find((tb) => tb.name === tName);
    if (t) t.comment = tComment;
  }

  const commentOnColRe =
    /COMMENT\s+ON\s+COLUMN\s+(`[^`]+`|"[^"]+"|[\w$.]+)\.(`[^`]+`|"[^"]+"|[\w$.]+)\s+IS\s+'((?:[^'\\]|\\.)*)'\s*;/gi;
  let cocM: RegExpExecArray | null;
  while ((cocM = commentOnColRe.exec(sql)) !== null) {
    const tName = stripSchemaPrefix(stripQuotes(cocM[1]));
    const cName = stripQuotes(cocM[2]);
    const cComment = cocM[3].replace(/\\'/g, "'");
    const t = tables.find((tb) => tb.name === tName);
    const c = t?.columns.find((col) => col.name === cName);
    if (c) c.comment = cComment;
  }

  return { tables, errors };
}

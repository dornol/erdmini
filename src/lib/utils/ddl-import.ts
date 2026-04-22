import type { Column, ColumnType, Dialect, ForeignKey, ReferentialAction, Table, TableIndex, UniqueKey } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';
import { generateId } from '$lib/utils/common';
import { DEFAULT_MESSAGES, parseRefAction } from './ddl-import-types';
import type { DDLImportMessages, ImportResult } from './ddl-import-types';
import type { MSSQLAlterFK, MSSQLAlterUQ } from './ddl-import-mssql';
import { preprocessMSSQL, cleanMSSQLStatement } from './ddl-import-mssql';
import { preprocessOracle, preprocessH2 } from './ddl-import-oracle';
import { IMPORT_GRID_COLS, IMPORT_GRID_GAP_X, IMPORT_GRID_GAP_Y, IMPORT_GRID_OFFSET } from '$lib/constants/layout';

// Re-export public types for external consumers
export type { DDLImportMessages, ImportResult, ParsedFK, ParsedIndex } from './ddl-import-types';

// ─── Type normalization ──────────────────────────────────────────────

export function normalizeType(raw: string): ColumnType {
  return normalizeTypeInternal(raw).type;
}

function normalizeTypeInternal(raw: string): { type: ColumnType; warning?: { original: string; normalized: string } } {
  const upper = raw.toUpperCase().trim();

  // MSSQL (MAX) types
  if (upper.includes('(MAX)')) {
    if (upper.startsWith('NVARCHAR') || upper.startsWith('NCHAR')) return { type: 'NTEXT' };
    return { type: 'TEXT' };
  }

  const base = upper.replace(/\s*\([^)]*\)/, '').trim();

  if (base === 'SERIAL') return { type: 'INT' };
  if (base === 'BIGSERIAL') return { type: 'BIGINT' };
  if (base === 'SMALLSERIAL') return { type: 'SMALLINT' };
  if (base === 'INTEGER') return { type: 'INT' };
  if (base === 'TINYTEXT' || base === 'MEDIUMTEXT' || base === 'LONGTEXT') return { type: 'TEXT' };
  if (base === 'TINYBLOB' || base === 'MEDIUMBLOB' || base === 'LONGBLOB') return { type: 'BLOB' };
  if (base === 'BOOL') return { type: 'BOOLEAN' };
  if (base === 'DATETIME') return { type: 'DATETIME' };
  if (base === 'TIMESTAMP' || base === 'TIMESTAMPTZ' || base === 'DATETIME2') return { type: 'TIMESTAMP' };
  if (base === 'DATETIMEOFFSET') return { type: 'DATETIMEOFFSET' };
  if (base === 'YEAR') return { type: 'YEAR' };
  if (base === 'INTERVAL' || base.startsWith('INTERVAL ')) return { type: 'INTERVAL' };
  if (base === 'MONEY' || base === 'SMALLMONEY') return { type: 'MONEY' };
  if (base === 'DOUBLE PRECISION') return { type: 'DOUBLE' };
  if (base === 'JSONB') return { type: 'JSONB' };
  if (base === 'IMAGE') return { type: 'BLOB' };
  if (base === 'CHARACTER VARYING' || base === 'NVARCHAR2') return { type: 'VARCHAR' };
  if (base === 'VARCHAR2') return { type: 'VARCHAR' };
  if (base === 'NVARCHAR') return { type: 'NVARCHAR' };
  if (base === 'NCHAR') return { type: 'NCHAR' };
  if (base === 'NTEXT') return { type: 'NTEXT' };
  if (base === 'CHARACTER') return { type: 'CHAR' };
  if (base === 'UNIQUEIDENTIFIER') return { type: 'UUID' };
  if (base === 'NUMBER') return { type: 'DECIMAL' };
  if (base === 'CLOB' || base === 'NCLOB' || base === 'LONG') return { type: 'TEXT' };
  if (base === 'RAW') return { type: 'VARBINARY' };
  if (base === 'BINARY_DOUBLE') return { type: 'DOUBLE' };
  if (base === 'BINARY_FLOAT') return { type: 'FLOAT' };
  if (base === 'ENUM') return { type: 'ENUM' };

  if ((COLUMN_TYPES as readonly string[]).includes(base)) return { type: base as ColumnType };
  return { type: 'VARCHAR', warning: { original: raw.trim(), normalized: 'VARCHAR' } };
}

// ─── Reserved-word column name quoting ───────────────────────────────

/**
 * Words that node-sql-parser rejects as bare column names.
 * We quote them in CREATE TABLE bodies before parsing.
 */
const PARSER_RESERVED = new Set([
  'explain','show','key','call','read','write','end','insert','update','delete',
  'drop','table','create','alter','into','set','truncate','desc','asc','order',
  'group','by','from','where','join','add','rename','values','limit','between',
  'in','exists','not','null','is','cross','outer','pivot','unpivot','else',
  'case','when','then','session','left','json','select','like','grant','revoke',
  'lock','use','open','close','return','begin','if','replace',
  // MySQL-specific
  'get','right','option','rank','row','rows','range','over','partition',
  'cursor','fetch','function','procedure','trigger','database','schema',
  'default','references','signal','condition','loop','repeat','leave',
  'iterate','declare','continue',
  // PostgreSQL-specific
  'offset',
  // shared — also constraint keywords (skip-list prevents false quoting)
  'primary','unique','foreign','constraint','check',
]);

/**
 * Quote reserved-word column names inside CREATE TABLE bodies so the parser
 * can handle them.  Works by finding each CREATE TABLE (...) body, splitting
 * by top-level commas, and quoting the first identifier of each column def
 * if it is a reserved word and not already quoted.
 */
function quoteReservedColumnNames(sql: string, dialect: Dialect): string {
  const q = (dialect === 'mysql' || dialect === 'mariadb') ? '`' : '"';
  // Match CREATE TABLE ... ( with paren depth
  const headerRe = /create\s+table\s+(?:(?:if\s+not\s+exists)\s+)?(?:[\w."'`[\]]+\.)?[\w"'`[\]]+\s*\(/gi;
  let result = '';
  let lastEnd = 0;
  let hm: RegExpExecArray | null;

  while ((hm = headerRe.exec(sql)) !== null) {
    const bodyStart = hm.index + hm[0].length;
    // Find matching closing paren
    let depth = 1, i = bodyStart;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      if (depth > 0) i++;
    }
    if (depth !== 0) continue;
    const bodyEnd = i; // index of closing ')'

    // Append everything before the body
    result += sql.slice(lastEnd, bodyStart);

    // Process body: split by top-level commas
    const body = sql.slice(bodyStart, bodyEnd);
    const parts: string[] = [];
    let d = 0, s = 0;
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '(') d++;
      else if (body[j] === ')') d--;
      else if (body[j] === ',' && d === 0) {
        parts.push(body.slice(s, j));
        s = j + 1;
      }
    }
    parts.push(body.slice(s));

    const quotedParts = parts.map(part => {
      // Match leading whitespace + first bare identifier
      const m = part.match(/^(\s*)([\w]+)(.*)/s);
      if (!m) return part;
      const [, ws, word, rest] = m;
      // Skip table-level constraints
      if (/^(constraint|primary|foreign|unique|check|index|key)$/i.test(word)) return part;
      // Quote if reserved
      if (PARSER_RESERVED.has(word.toLowerCase())) {
        return `${ws}${q}${word}${q}${rest}`;
      }
      return part;
    });

    result += quotedParts.join(',');
    lastEnd = bodyEnd;
    headerRe.lastIndex = bodyEnd;
  }

  result += sql.slice(lastEnd);
  return result;
}

// ─── AST helpers ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractColumnName(col: any): string {
  if (typeof col === 'string') return col;
  if (col?.expr?.value) return col.expr.value;
  if (col?.value) return col.value;
  return String(col);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDefaultValue(def: any): string | undefined {
  if (!def) return undefined;
  const val = def.value;
  if (!val) return undefined;
  if (val.type === 'number') return String(val.value);
  if (val.type === 'single_quote_string') return `'${val.value}'`;
  if (val.type === 'null') return 'NULL';
  if (val.type === 'bool') return val.value ? 'TRUE' : 'FALSE';
  if (val.type === 'function') {
    // e.g. getdate(), CURRENT_TIMESTAMP(), NOW()
    const funcName = val.name?.name?.[0]?.value ?? val.name?.value ?? 'UNKNOWN';
    const args = val.args?.value;
    if (args && args.length > 0) {
      return `${funcName}(${args.map((a: any) => a.value ?? a).join(', ')})`;
    }
    return `${funcName}()`;
  }
  if (typeof val.value === 'string') return val.value;
  if (typeof val.value === 'number') return String(val.value);
  // Fallback: avoid [object Object]
  if (val.value !== undefined && val.value !== null) return String(val.value);
  return undefined;
}

function getUniqueName(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name;
  let i = 1;
  while (existing.includes(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}

interface ParsedFK {
  columnNames: string[];
  refTableName: string;
  refColumnNames: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFKFromRefDef(refDef: any, fkColumns: any[]): ParsedFK | null {
  if (!refDef) return null;
  // Skip ON UPDATE CURRENT_TIMESTAMP() — parser puts it in reference_definition
  // but without a table reference, it's not a real FK
  if (!refDef.table?.[0]?.table) return null;
  const refTable = refDef.table[0].table;
  const refCols = refDef.definition ?? [];
  let onDelete: ReferentialAction = 'RESTRICT';
  let onUpdate: ReferentialAction = 'RESTRICT';
  if (refDef.on_action) {
    for (const act of refDef.on_action) {
      const val = act.value?.value ?? '';
      if (act.type === 'on delete') onDelete = parseRefAction(val);
      if (act.type === 'on update') onUpdate = parseRefAction(val);
    }
  }
  const columnNames: string[] = [];
  const refColumnNames: string[] = [];
  for (let i = 0; i < fkColumns.length; i++) {
    columnNames.push(extractColumnName(fkColumns[i]?.column ?? fkColumns[i]));
    refColumnNames.push(extractColumnName(refCols[i]?.column ?? refCols[i]));
  }
  return { columnNames, refTableName: refTable, refColumnNames, onDelete, onUpdate };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveParser(mod: any): any {
  const Parser = mod.Parser ?? mod.default?.Parser;
  if (!Parser) throw new Error('Parser not found in module');
  return new Parser();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getParser(dialect: Dialect): Promise<any> {
  switch (dialect) {
    case 'mysql':
      return resolveParser(await import('node-sql-parser/build/mysql'));
    case 'mariadb':
      return resolveParser(await import('node-sql-parser/build/mariadb'));
    case 'postgresql':
      return resolveParser(await import('node-sql-parser/build/postgresql'));
    case 'mssql':
      return resolveParser(await import('node-sql-parser/build/transactsql'));
    case 'sqlite':
      return resolveParser(await import('node-sql-parser/build/sqlite'));
    case 'oracle':
    case 'h2':
      return resolveParser(await import('node-sql-parser/build/postgresql'));
  }
}

// ─── Raw SQL extraction ──────────────────────────────────────────────

/**
 * Extract inline column-level CHECK constraints from raw SQL.
 * Returns Map<tableName, Map<columnName, checkExpression>>
 */
function extractCheckConstraints(sql: string): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  const headerRe = /create\s+table\s+(?:\[?\w+\]?\.)?[\[`"]?(\w+)[\]`"]?\s*\(/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = headerRe.exec(sql)) !== null) {
    const tableName = tMatch[1];
    // Use paren depth tracking to find the matching closing ')'
    let depth = 1, i = tMatch.index + tMatch[0].length;
    const start = i;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    if (depth !== 0) continue;
    const body = sql.slice(start, i - 1);
    const colDefs: string[] = [];
    let d2 = 0, s2 = 0;
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '(') d2++;
      else if (body[j] === ')') d2--;
      else if (body[j] === ',' && d2 === 0) {
        colDefs.push(body.slice(s2, j));
        s2 = j + 1;
      }
    }
    colDefs.push(body.slice(s2));

    for (const colDef of colDefs) {
      const trimmed = colDef.trim();
      if (/^(constraint|primary|foreign|unique|check|index|key)\b/i.test(trimmed)) continue;
      const colNameMatch = trimmed.match(/^[\[`"]?(\w+)[\]`"]?\s+/);
      if (!colNameMatch) continue;
      const colName = colNameMatch[1];
      const checkMatch = trimmed.match(/\bcheck\s*\(/i);
      if (!checkMatch) continue;
      const checkStart = checkMatch.index! + checkMatch[0].length - 1;
      let d = 1, ci = checkStart + 1;
      while (ci < trimmed.length && d > 0) {
        if (trimmed[ci] === '(') d++;
        else if (trimmed[ci] === ')') d--;
        ci++;
      }
      if (d === 0) {
        const expr = trimmed.slice(checkStart + 1, ci - 1).trim();
        if (!result.has(tableName)) result.set(tableName, new Map());
        result.get(tableName)!.set(colName, expr);
      }
    }
  }
  return result;
}

interface ParsedIndex {
  tableName: string;
  columnNames: string[];
  name?: string;
  unique: boolean;
}

/**
 * Extract CREATE [UNIQUE] INDEX statements from raw SQL via regex.
 */
function extractIndexStatements(sql: string): ParsedIndex[] {
  const results: ParsedIndex[] = [];
  const pattern = /create\s+(unique\s+)?(?:nonclustered\s+)?index\s+(?:if\s+not\s+exists\s+)?(?:\[?(\w+)\]?)\s+on\s+(?:\[?\w+\]?\.)?[\[`"]?(\w+)[\]`"]?\s*\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sql)) !== null) {
    const unique = !!m[1];
    const name = m[2];
    const tableName = m[3];
    const cols = m[4].split(',').map((s) => s.replace(/[\[\]`"]/g, '').replace(/\s+(ASC|DESC)/gi, '').trim()).filter(Boolean);
    results.push({ tableName, columnNames: cols, name, unique });
  }
  return results;
}

// ─── Step 1: Preprocess SQL and parse to AST ─────────────────────────

interface PreprocessedData {
  mssqlComments: { tableComments: Map<string, string>; colComments: Map<string, Map<string, string>> } | null;
  mssqlAlterFKs: MSSQLAlterFK[];
  mssqlAlterUQs: MSSQLAlterUQ[];
  mssqlDt2Precisions: Map<string, Map<string, number>>;
  mssqlDatetimeoffsetCols: Map<string, Map<string, number | undefined>>;
  mssqlMoneyCols: Map<string, Set<string>>;
  preprocessedComments: { tableComments: Map<string, string>; colComments: Map<string, Map<string, string>> } | null;
  preprocessedIdentity: Map<string, Set<string>> | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseSqlToAst(sql: string, dialect: Dialect, errors: string[]): Promise<{ stmts: any[]; preprocessed: PreprocessedData } | null> {
  let parser;
  try {
    parser = await getParser(dialect);
  } catch (e) {
    errors.push(`Parser load failed: ${e}`);
    return null;
  }

  const preprocessed: PreprocessedData = {
    mssqlComments: null,
    mssqlAlterFKs: [],
    mssqlAlterUQs: [],
    mssqlDt2Precisions: new Map(),
    mssqlDatetimeoffsetCols: new Map(),
    mssqlMoneyCols: new Map(),
    preprocessedComments: null,
    preprocessedIdentity: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stmts: any[];

  if (dialect === 'mssql') {
    const result = preprocessMSSQL(sql);
    preprocessed.mssqlComments = { tableComments: result.tableComments, colComments: result.colComments };
    preprocessed.mssqlAlterFKs = result.alterFKs;
    preprocessed.mssqlAlterUQs = result.alterUQs;
    preprocessed.mssqlDt2Precisions = result.dt2Precisions;
    preprocessed.mssqlDatetimeoffsetCols = result.datetimeoffsetCols;
    preprocessed.mssqlMoneyCols = result.moneyCols;
    stmts = [];
    for (const stmtSql of result.statements) {
      const quoted = quoteReservedColumnNames(stmtSql, dialect);
      try {
        const parsed = parser.astify(quoted);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        stmts.push(...arr);
      } catch {
        try {
          const cleaned = quoteReservedColumnNames(cleanMSSQLStatement(stmtSql), dialect);
          const parsed = parser.astify(cleaned);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          stmts.push(...arr);
        } catch (e) {
          const tMatch = stmtSql.match(/(?:create|alter)\s+table\s+(\w+)/i);
          errors.push(`Parse failed (${tMatch?.[1] ?? 'unknown'}): ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } else if (dialect === 'oracle') {
    const result = preprocessOracle(sql);
    preprocessed.preprocessedComments = { tableComments: result.tableComments, colComments: result.colComments };
    preprocessed.preprocessedIdentity = result.identityColumns;
    sql = result.cleanedSql;
    stmts = [];
    const rawStmts = sql.split(/;\s*/).filter((s) => s.trim());
    for (const rawStmt of rawStmts) {
      const trimmed = rawStmt.trim();
      if (!trimmed) continue;
      if (!/^\s*(create\s+table|alter\s+table)\b/i.test(trimmed)) continue;
      try {
        const quoted = quoteReservedColumnNames(trimmed, dialect);
        const parsed = parser.astify(quoted);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        stmts.push(...arr);
      } catch (e) {
        const tMatch = trimmed.match(/(?:create|alter)\s+table\s+(?:"\w+"\.)?"?(\w+)"?/i);
        errors.push(`Parse failed (${tMatch?.[1] ?? 'unknown'}): ${e instanceof Error ? e.message : e}`);
      }
    }
  } else if (dialect === 'h2') {
    const result = preprocessH2(sql);
    preprocessed.preprocessedComments = { tableComments: result.tableComments, colComments: result.colComments };
    preprocessed.preprocessedIdentity = result.identityColumns;
    sql = result.cleanedSql;
    stmts = [];
    const rawStmts = sql.split(/;\s*/).filter((s) => s.trim());
    for (const rawStmt of rawStmts) {
      const trimmed = rawStmt.trim();
      if (!trimmed) continue;
      try {
        const quoted = quoteReservedColumnNames(trimmed, dialect);
        const parsed = parser.astify(quoted);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        stmts.push(...arr);
      } catch (e) {
        const tMatch = trimmed.match(/(?:create|alter)\s+table\s+(?:"\w+"\.)?"?(\w+)"?/i);
        if (tMatch) {
          errors.push(`Parse failed (${tMatch[1]}): ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } else {
    try {
      const quoted = quoteReservedColumnNames(sql, dialect);
      const parsed = parser.astify(quoted);
      stmts = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      stmts = [];
      const rawStmts = sql.split(/;\s*/).filter((s) => s.trim());
      for (const rawStmt of rawStmts) {
        const trimmed = rawStmt.trim();
        if (!trimmed) continue;
        try {
          const quoted = quoteReservedColumnNames(trimmed, dialect);
          const parsed = parser.astify(quoted);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          stmts.push(...arr);
        } catch (e) {
          const tMatch = trimmed.match(/(?:create|alter)\s+table\s+(\w+)/i);
          if (tMatch) {
            errors.push(`Parse failed (${tMatch[1]}): ${e instanceof Error ? e.message : e}`);
          }
        }
      }
    }
  }

  return { stmts, preprocessed };
}

// ─── Step 2: Collect ALTER TABLE FK/UQ and COMMENT ON ────────────────

interface AlterConstraints {
  alterFKMap: Map<string, ParsedFK[]>;
  alterUQMap: Map<string, { columns: string[]; name?: string }[]>;
  tableComments: Map<string, string>;
  colComments: Map<string, Map<string, string>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectAlterConstraints(stmts: any[]): AlterConstraints {
  const alterFKMap = new Map<string, ParsedFK[]>();
  const alterUQMap = new Map<string, { columns: string[]; name?: string }[]>();
  const tableComments = new Map<string, string>();
  const colComments = new Map<string, Map<string, string>>();

  for (const stmt of stmts) {
    // ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY / UNIQUE
    if (stmt.type === 'alter' && (stmt.keyword === 'table' || stmt.table)) {
      const tName = stmt.table?.[0]?.table ?? '';
      if (stmt.expr) {
        for (const expr of stmt.expr) {
          const ct = expr.create_definitions?.constraint_type?.toUpperCase() ?? '';
          if (expr.action === 'add' && ct === 'FOREIGN KEY') {
            const fkDefs = expr.create_definitions.definition ?? [];
            const fk = extractFKFromRefDef(expr.create_definitions.reference_definition, fkDefs);
            if (fk) {
              const existing = alterFKMap.get(tName) ?? [];
              existing.push(fk);
              alterFKMap.set(tName, existing);
            }
          } else if (expr.action === 'add' && ct.includes('UNIQUE')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uqCols = (expr.create_definitions.definition ?? []).map((d: any) => extractColumnName(d.column));
            const uqName = expr.create_definitions.constraint?.length > 0 ? expr.create_definitions.constraint : undefined;
            if (uqCols.length >= 2) {
              const existing = alterUQMap.get(tName) ?? [];
              existing.push({ columns: uqCols, name: uqName });
              alterUQMap.set(tName, existing);
            }
          }
        }
      }
    }

    // COMMENT ON TABLE / COMMENT ON COLUMN (PostgreSQL)
    if (stmt.type === 'comment') {
      const target = stmt.target;
      const commentVal = stmt.expr?.expr?.value ?? '';
      if (target?.type === 'table') {
        const tName = target.name?.table ?? '';
        if (tName) tableComments.set(tName, commentVal);
      } else if (target?.type === 'column') {
        const tName = target.name?.table ?? '';
        const cName = extractColumnName(target.name?.column);
        if (tName && cName) {
          if (!colComments.has(tName)) colComments.set(tName, new Map());
          colComments.get(tName)!.set(cName, commentVal);
        }
      }
    }
  }

  return { alterFKMap, alterUQMap, tableComments, colComments };
}

// ─── Step 3: Build Table from CREATE TABLE AST ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTableFromCreateStmt(
  stmt: any,
  dialect: Dialect,
  tableIdx: number,
  existingNames: string[],
  alterConstraints: AlterConstraints,
  checkConstraints: Map<string, Map<string, string>>,
  warnings: string[],
): Table & { _parsedFKs?: ParsedFK[] } {
  const rawTableName = stmt.table?.[0]?.table ?? 'unknown';
  let rawSchemaName: string | undefined = stmt.table?.[0]?.db || undefined;
  if (dialect === 'sqlite' && rawSchemaName === 'main') rawSchemaName = undefined;
  const tableName = getUniqueName(rawTableName, existingNames);
  existingNames.push(tableName);

  const columns: Column[] = [];
  const primaryKeys: string[] = [];
  const uniqueColumns: string[] = [];
  const compositeUniqueGroups: { columns: string[]; name?: string }[] = [];
  const foreignKeys: ParsedFK[] = [];
  const defs = stmt.create_definitions ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const def of defs) {
    if (def.resource === 'column') {
      const colName = extractColumnName(def.column?.column);
      if (/^(unique|primary|foreign|constraint|check|index|references)$/i.test(colName)) continue;
      // 'key' without a real data type is a MySQL KEY index — skip it
      if (/^key$/i.test(colName) && !def.definition?.dataType) continue;
      const rawType = def.definition?.dataType ?? 'VARCHAR';
      const length = def.definition?.length ?? undefined;
      const scale = def.definition?.scale ?? undefined;
      const { type, warning } = normalizeTypeInternal(rawType);
      if (warning) {
        warnings.push(`Type: ${warning.original} → ${warning.normalized} (${tableName}.${colName})`);
      }
      const nullable = def.nullable?.type !== 'not null';
      const isPK = !!def.primary_key;
      const isUnique = !!def.unique;
      const autoInc = !!def.auto_increment || !!def.identity ||
        rawType.toUpperCase() === 'SERIAL' ||
        rawType.toUpperCase() === 'BIGSERIAL' ||
        rawType.toUpperCase() === 'SMALLSERIAL';
      const defaultValue = extractDefaultValue(def.default_val);

      let comment: string | undefined;
      if (def.comment?.value?.value) {
        comment = def.comment.value.value;
      }

      if (isPK) primaryKeys.push(colName);

      const col: Column = {
        id: generateId(),
        name: colName,
        type,
        nullable: isPK ? false : nullable,
        primaryKey: isPK,
        unique: isUnique,
        autoIncrement: autoInc,
      };
      if (length !== undefined) col.length = length;
      if (scale !== undefined) col.scale = scale;
      if (defaultValue !== undefined) col.defaultValue = defaultValue;
      if (comment) col.comment = comment;

      columns.push(col);

      // Inline REFERENCES (SQLite)
      if (def.reference_definition) {
        const fk = extractFKFromRefDef(def.reference_definition, [{ column: colName }]);
        if (fk) foreignKeys.push(fk);
      }
    } else if (def.resource === 'constraint') {
      const ct = def.constraint_type?.toUpperCase() ?? '';
      if (ct === 'PRIMARY KEY') {
        for (const d of def.definition ?? []) {
          primaryKeys.push(extractColumnName(d.column));
        }
      } else if (ct.includes('UNIQUE')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uqCols = (def.definition ?? []).map((d: any) => extractColumnName(d.column));
        const uqName = def.constraint?.length > 0 ? def.constraint : undefined;
        if (uqCols.length >= 2) {
          compositeUniqueGroups.push({ columns: uqCols, name: uqName });
        } else {
          for (const c of uqCols) {
            uniqueColumns.push(c);
          }
        }
      } else if (ct === 'FOREIGN KEY') {
        const fkCols = def.definition ?? [];
        const fk = extractFKFromRefDef(def.reference_definition, fkCols);
        if (fk) foreignKeys.push(fk);
      }
    }
  }

  // Apply table-level PK/UNIQUE to columns
  for (const col of columns) {
    if (primaryKeys.includes(col.name)) {
      col.primaryKey = true;
      col.nullable = false;
    }
    if (uniqueColumns.includes(col.name)) col.unique = true;
  }

  // Table comment from table_options (MySQL/MariaDB)
  let tableComment: string | undefined;
  if (stmt.table_options) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const opt of stmt.table_options) {
      if (opt.keyword === 'comment' && opt.value) {
        tableComment = opt.value.replace(/^'|'$/g, '');
      }
    }
  }

  // PostgreSQL COMMENT ON TABLE override
  if (alterConstraints.tableComments.has(rawTableName)) {
    tableComment = alterConstraints.tableComments.get(rawTableName);
  }

  // PostgreSQL COMMENT ON COLUMN
  const colCmts = alterConstraints.colComments.get(rawTableName);
  if (colCmts) {
    for (const col of columns) {
      const c = colCmts.get(col.name);
      if (c) col.comment = c;
    }
  }

  // Apply CHECK constraints extracted from raw SQL
  const colChecks = checkConstraints.get(rawTableName);
  if (colChecks) {
    for (const col of columns) {
      const check = colChecks.get(col.name);
      if (check) col.check = check;
    }
  }

  // Merge ALTER TABLE FKs
  const alterFKs = alterConstraints.alterFKMap.get(rawTableName) ?? [];
  foreignKeys.push(...alterFKs);

  // Merge ALTER TABLE UQs
  const alterUQs = alterConstraints.alterUQMap.get(rawTableName) ?? [];
  compositeUniqueGroups.push(...alterUQs);

  const gridCol = tableIdx % IMPORT_GRID_COLS;
  const gridRow = Math.floor(tableIdx / IMPORT_GRID_COLS);

  // Resolve composite unique keys (deduplicate by sorted column set)
  const uniqueKeys: UniqueKey[] = [];
  const seenUQColSets = new Set<string>();
  for (const group of compositeUniqueGroups) {
    const colIds = group.columns
      .map((name) => columns.find((c) => c.name === name)?.id)
      .filter((id): id is string => !!id);
    if (colIds.length >= 2) {
      const key = [...colIds].sort().join(',');
      if (seenUQColSets.has(key)) continue;
      seenUQColSets.add(key);
      uniqueKeys.push({
        id: generateId(),
        columnIds: colIds,
        name: group.name,
      });
    }
  }

  return {
    id: generateId(),
    name: tableName,
    columns,
    foreignKeys: [],
    uniqueKeys,
    indexes: [],
    position: { x: IMPORT_GRID_OFFSET + gridCol * IMPORT_GRID_GAP_X, y: IMPORT_GRID_OFFSET + gridRow * IMPORT_GRID_GAP_Y },
    comment: tableComment,
    ...(rawSchemaName ? { schema: rawSchemaName } : {}),
    _parsedFKs: foreignKeys,
  };
}

// ─── Step 4: Resolve foreign keys (second pass) ─────────────────────

function resolveParsedForeignKeys(tables: (Table & { _parsedFKs?: ParsedFK[] })[], errors: string[], msg: DDLImportMessages): void {
  for (const table of tables) {
    const parsedFKs = table._parsedFKs ?? [];
    delete table._parsedFKs;

    for (const fkDef of parsedFKs) {
      const refTable = tables.find((t) => t.name === fkDef.refTableName);
      if (!refTable) {
        errors.push(msg.fkResolveFailed({ detail: `${table.name}.(${fkDef.columnNames.join(', ')}) → ${fkDef.refTableName}` }));
        continue;
      }
      const columnIds: string[] = [];
      const referencedColumnIds: string[] = [];
      let valid = true;
      for (let i = 0; i < fkDef.columnNames.length; i++) {
        const srcCol = table.columns.find((c) => c.name === fkDef.columnNames[i]);
        const refCol = refTable.columns.find((c) => c.name === fkDef.refColumnNames[i]);
        if (!srcCol || !refCol) {
          errors.push(msg.fkResolveFailed({ detail: `${table.name}.${fkDef.columnNames[i]} → ${fkDef.refTableName}.${fkDef.refColumnNames[i]}` }));
          valid = false;
          break;
        }
        columnIds.push(srcCol.id);
        referencedColumnIds.push(refCol.id);
      }
      if (!valid) continue;
      const fk: ForeignKey = {
        id: generateId(),
        columnIds,
        referencedTableId: refTable.id,
        referencedColumnIds,
        onDelete: fkDef.onDelete,
        onUpdate: fkDef.onUpdate,
      };
      table.foreignKeys.push(fk);
    }
  }
}

// ─── Step 5: Apply external constraints (MSSQL FKs/UQs, indexes, comments) ──

function applyMssqlAlterFKs(tables: Table[], mssqlAlterFKs: MSSQLAlterFK[]): void {
  const seenFKs = new Set<string>();
  for (const afk of mssqlAlterFKs) {
    const srcTable = tables.find((t) => t.name === afk.tableName);
    const refTable = tables.find((t) => t.name === afk.refTable);
    if (!srcTable || !refTable) continue;

    if (afk.refColumns.length === 0) {
      const pkCol = refTable.columns.find(c => c.primaryKey);
      if (pkCol) afk.refColumns = [pkCol.name];
      else continue;
    }

    const fkKey = `${afk.tableName}.${afk.columns.join(',')}→${afk.refTable}.${afk.refColumns.join(',')}`;
    if (seenFKs.has(fkKey)) continue;
    seenFKs.add(fkKey);

    const columnIds: string[] = [];
    const referencedColumnIds: string[] = [];
    let valid = true;
    for (let i = 0; i < afk.columns.length; i++) {
      const srcCol = srcTable.columns.find((c) => c.name === afk.columns[i]);
      const refCol = refTable.columns.find((c) => c.name === afk.refColumns[i]);
      if (!srcCol || !refCol) { valid = false; break; }
      columnIds.push(srcCol.id);
      referencedColumnIds.push(refCol.id);
    }
    if (!valid) continue;
    srcTable.foreignKeys.push({
      id: generateId(),
      columnIds,
      referencedTableId: refTable.id,
      referencedColumnIds,
      onDelete: afk.onDelete ?? 'RESTRICT',
      onUpdate: afk.onUpdate ?? 'RESTRICT',
    });
  }
}

function applyMssqlAlterUQs(tables: Table[], mssqlAlterUQs: MSSQLAlterUQ[]): void {
  for (const auq of mssqlAlterUQs) {
    const srcTable = tables.find((t) => t.name === auq.tableName);
    if (!srcTable) continue;
    const colIds = auq.columns
      .map((name) => srcTable.columns.find((c) => c.name === name)?.id)
      .filter((id): id is string => !!id);
    if (colIds.length >= 2) {
      const key = [...colIds].sort().join(',');
      const alreadyExists = srcTable.uniqueKeys.some(
        (uk) => [...uk.columnIds].sort().join(',') === key,
      );
      if (!alreadyExists) {
        srcTable.uniqueKeys.push({
          id: generateId(),
          columnIds: colIds,
          name: auq.name,
        });
      }
    } else if (colIds.length === 1) {
      const col = srcTable.columns.find((c) => c.id === colIds[0]);
      if (col && !col.unique) col.unique = true;
    }
  }
}

function applyIndexStatements(tables: Table[], parsedIndexes: ParsedIndex[]): void {
  for (const pidx of parsedIndexes) {
    const srcTable = tables.find((t) => t.name === pidx.tableName);
    if (!srcTable) continue;
    const colIds = pidx.columnNames
      .map((name) => srcTable.columns.find((c) => c.name === name)?.id)
      .filter((id): id is string => !!id);
    if (colIds.length === 0) continue;
    if (pidx.unique && colIds.length === 1) {
      const col = srcTable.columns.find((c) => c.id === colIds[0]);
      if (col && !col.unique) col.unique = true;
    }
    const idx: TableIndex = {
      id: generateId(),
      columnIds: colIds,
      unique: pidx.unique,
      name: pidx.name,
    };
    srcTable.indexes.push(idx);
  }
}

function applyPreprocessedComments(
  tables: Table[],
  comments: { tableComments: Map<string, string>; colComments: Map<string, Map<string, string>> } | null,
  identity: Map<string, Set<string>> | null,
): void {
  if (comments) {
    for (const table of tables) {
      const tComment = comments.tableComments.get(table.name);
      if (tComment) table.comment = tComment;
      const colCmts = comments.colComments.get(table.name);
      if (colCmts) {
        for (const col of table.columns) {
          const c = colCmts.get(col.name);
          if (c) col.comment = c;
        }
      }
    }
  }
  if (identity) {
    for (const table of tables) {
      const identityCols = identity.get(table.name);
      if (identityCols) {
        for (const col of table.columns) {
          if (identityCols.has(col.name)) col.autoIncrement = true;
        }
      }
    }
  }
}

// ─── SQLite type normalization ───────────────────────────────────────

const SQLITE_KNOWN_TYPES = new Set([
  'integer','int','bigint','smallint','tinyint','mediumint','text','real','blob',
  'numeric','decimal','float','double','boolean','date','datetime','timestamp',
  'varchar','char','nvarchar','nchar','character','mediumtext','longtext',
  'bit','binary','varbinary','json',
]);

function normalizeSqliteTypes(sql: string): string {
  // Replace unknown column types inside CREATE TABLE definitions.
  // Match column defs that start after '(' or ',' at the beginning of a logical column line.
  return sql.replace(
    /([,(]\s*)([\[`"]?\w+[\]`"]?)\s+([A-Za-z]\w*)/g,
    (m, prefix: string, colName: string, type: string) => {
      const name = colName.replace(/[\[`"]/g, '').toLowerCase();
      // Skip table-level constraints
      if (/^(constraint|primary|unique|check|foreign|key|index|references)$/i.test(name)) return m;
      if (SQLITE_KNOWN_TYPES.has(type.toLowerCase())) return m;
      return prefix + colName + ' TEXT /* ' + type + ' */';
    },
  );
}

// ─── Main entry point ────────────────────────────────────────────────

export async function importDDL(sql: string, dialect: Dialect = 'mysql', messages?: DDLImportMessages): Promise<ImportResult> {
  const msg = messages ?? DEFAULT_MESSAGES;
  const errors: string[] = [];
  const warnings: string[] = [];
  const tables: Table[] = [];
  const existingNames: string[] = [];

  // Strip bracket identifiers (MSSQL preprocessor handles this separately)
  if (dialect !== 'mssql') {
    sql = sql.replace(/\[([^\]]+)\]/g, '$1');
  }

  // MySQL/MariaDB: convert `charset` shorthand to `CHARACTER SET` (parser only accepts full form)
  if (dialect === 'mysql' || dialect === 'mariadb') {
    sql = sql.replace(/\bcharset\s+/gi, 'CHARACTER SET ');
  }

  // SQLite: strip "main." default database prefix + fix inline REFERENCES without column list
  if (dialect === 'sqlite') {
    sql = sql.replace(/\bmain\./gi, '');
    sql = sql.replace(/\breferences\s+(\w+)\b(?!\s*\()/gi, 'references $1(id)');
    // SQLite allows any type name — normalize ones the parser doesn't recognize
    sql = normalizeSqliteTypes(sql);
    // Skip sqlite system tables
    sql = sql.replace(/create\s+table\s+(?:main\.)?sqlite_\w+\s*\([^)]*\)\s*;/gi, '');
  }

  // Extract raw SQL patterns before AST parsing
  const checkConstraints = extractCheckConstraints(sql);
  const parsedIndexes = extractIndexStatements(sql);

  // Step 1: Parse SQL to AST
  const parseResult = await parseSqlToAst(sql, dialect, errors);
  if (!parseResult) {
    return { tables, errors, warnings };
  }
  const { stmts, preprocessed } = parseResult;

  if (stmts.length === 0 && errors.length === 0) {
    errors.push(msg.noCreateTable());
    return { tables, errors, warnings };
  }

  // Step 2: Collect ALTER TABLE FK/UQ and COMMENT ON
  const alterConstraints = collectAlterConstraints(stmts);

  // Step 3: Process CREATE TABLE statements
  let tableIdx = 0;
  for (const stmt of stmts) {
    if (stmt.type !== 'create' || stmt.keyword !== 'table') continue;
    try {
      const table = buildTableFromCreateStmt(stmt, dialect, tableIdx, existingNames, alterConstraints, checkConstraints, warnings);
      tables.push(table);
      tableIdx++;
    } catch (e) {
      errors.push(msg.tableParseError({ error: e instanceof Error ? e.message : String(e) }));
    }
  }

  if (tables.length === 0) {
    errors.push(msg.noCreateTable());
    return { tables, errors, warnings };
  }

  // Step 4: Resolve foreign keys (second pass)
  resolveParsedForeignKeys(tables, errors, msg);

  // Step 5: Apply external constraints
  applyMssqlAlterFKs(tables, preprocessed.mssqlAlterFKs);
  applyMssqlAlterUQs(tables, preprocessed.mssqlAlterUQs);
  applyIndexStatements(tables, parsedIndexes);

  // Apply MSSQL datetime2(N) precision to column length
  for (const [tableName, colMap] of preprocessed.mssqlDt2Precisions) {
    const table = tables.find((t) => t.name === tableName);
    if (!table) continue;
    for (const [colName, precision] of colMap) {
      const col = table.columns.find((c) => c.name.toLowerCase() === colName);
      if (col && (col.type === 'DATETIME' || col.type === 'TIMESTAMP')) {
        col.length = precision;
      }
    }
  }

  // Apply MSSQL DATETIMEOFFSET — restore original type (preprocessor mapped to DATETIME)
  for (const [tableName, colMap] of preprocessed.mssqlDatetimeoffsetCols) {
    const table = tables.find((t) => t.name === tableName);
    if (!table) continue;
    for (const [colName, precision] of colMap) {
      const col = table.columns.find((c) => c.name.toLowerCase() === colName);
      if (col) {
        col.type = 'DATETIMEOFFSET';
        if (precision !== undefined) col.length = precision;
        else col.length = undefined;
      }
    }
  }

  // Apply MSSQL MONEY/SMALLMONEY — restore original type (preprocessor mapped to DECIMAL)
  for (const [tableName, colSet] of preprocessed.mssqlMoneyCols) {
    const table = tables.find((t) => t.name === tableName);
    if (!table) continue;
    for (const colName of colSet) {
      const col = table.columns.find((c) => c.name.toLowerCase() === colName);
      if (col) {
        col.type = 'MONEY';
        col.length = undefined;
        col.scale = undefined;
      }
    }
  }

  // Apply MSSQL sp_addextendedproperty comments
  applyPreprocessedComments(tables, preprocessed.mssqlComments, null);

  // Apply Oracle/H2 preprocessed comments and identity columns
  applyPreprocessedComments(tables, preprocessed.preprocessedComments, preprocessed.preprocessedIdentity);

  return { tables, errors, warnings };
}

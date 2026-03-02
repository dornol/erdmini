import type { Column, ColumnType, Dialect, ForeignKey, ReferentialAction, Table, TableIndex, UniqueKey } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';
import { generateId } from '$lib/utils/common';

export interface DDLImportMessages {
  noCreateTable: () => string;
  tableParseError: (params: { error: string }) => string;
  fkResolveFailed: (params: { detail: string }) => string;
}

const DEFAULT_MESSAGES: DDLImportMessages = {
  noCreateTable: () => 'No CREATE TABLE statements found.',
  tableParseError: ({ error }) => `Table parse error: ${error}`,
  fkResolveFailed: ({ detail }) => `FK resolve failed: ${detail}`,
};

/** Track type normalizations (original → normalized) */
let _typeWarnings: { original: string; normalized: string }[] = [];

export function normalizeType(raw: string): ColumnType {
  const upper = raw.toUpperCase().trim();

  // MSSQL (MAX) types → TEXT
  if (upper.includes('(MAX)')) return 'TEXT';

  const base = upper.replace(/\s*\([^)]*\)/, '').trim();

  if (base === 'SERIAL') return 'INT';
  if (base === 'BIGSERIAL') return 'BIGINT';
  if (base === 'INTEGER') return 'INT';
  if (base === 'TINYINT' || base === 'MEDIUMINT') return base === 'TINYINT' ? 'SMALLINT' : 'INT';
  if (base === 'TINYTEXT' || base === 'MEDIUMTEXT' || base === 'LONGTEXT') return 'TEXT';
  if (base === 'TINYBLOB' || base === 'BLOB' || base === 'MEDIUMBLOB' || base === 'LONGBLOB') return 'TEXT';
  if (base === 'BOOL' || base === 'BIT') return 'BOOLEAN';
  if (base === 'DATETIME' || base === 'TIMESTAMP' || base === 'TIMESTAMPTZ' || base === 'DATETIME2') return 'TIMESTAMP';
  if (base === 'NUMERIC' || base === 'REAL' || base === 'MONEY' || base === 'DOUBLE PRECISION') return 'DECIMAL';
  if (base === 'VARBINARY' || base === 'IMAGE') return 'TEXT';
  if (base === 'CHARACTER VARYING' || base === 'NVARCHAR') return 'VARCHAR';
  if (base === 'CHARACTER' || base === 'NCHAR') return 'CHAR';
  if (base === 'UNIQUEIDENTIFIER') return 'UUID';
  if (base === 'NVARCHAR(MAX)') return 'TEXT';
  if (base === 'ENUM') return 'ENUM';

  if ((COLUMN_TYPES as readonly string[]).includes(base)) return base as ColumnType;
  _typeWarnings.push({ original: raw.trim(), normalized: 'VARCHAR' });
  return 'VARCHAR';
}

function parseRefAction(raw: string | undefined): ReferentialAction {
  if (!raw) return 'RESTRICT';
  const u = raw.trim().toUpperCase();
  if (u === 'CASCADE') return 'CASCADE';
  if (u === 'SET NULL') return 'SET NULL';
  if (u === 'RESTRICT') return 'RESTRICT';
  return 'NO ACTION';
}

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
  if (typeof val.value === 'string') return val.value;
  return String(val.value ?? val);
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
  const refTable = refDef.table?.[0]?.table ?? '';
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

interface MSSQLAlterFK {
  tableName: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
}

interface MSSQLAlterUQ {
  tableName: string;
  columns: string[];
  name?: string;
}

interface MSSQLPreprocessResult {
  statements: string[];
  tableComments: Map<string, string>;
  colComments: Map<string, Map<string, string>>;
  alterFKs: MSSQLAlterFK[];
  alterUQs: MSSQLAlterUQ[];
}

/** Unwrap MSSQL default parens: DEFAULT ((0)) → DEFAULT 0, DEFAULT (getdate()) → DEFAULT getdate() */
function unwrapDefaultParens(sql: string): string {
  const pattern = /\bDEFAULT\s+\(/gi;
  let result = '';
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(sql)) !== null) {
    // Find matching closing paren
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    if (depth !== 0) continue;

    let inner = sql.slice(m.index + m[0].length, i - 1).trim();
    // Recursively unwrap nested parens: ((0)) → (0) → 0
    while (inner.startsWith('(') && inner.endsWith(')')) {
      const unwrapped = inner.slice(1, -1).trim();
      let d = 0;
      let balanced = true;
      for (const ch of unwrapped) {
        if (ch === '(') d++;
        else if (ch === ')') d--;
        if (d < 0) { balanced = false; break; }
      }
      if (balanced && d === 0) inner = unwrapped;
      else break;
    }

    result += sql.slice(lastIdx, m.index) + 'DEFAULT ' + inner;
    lastIdx = i;
    pattern.lastIndex = i;
  }

  return result + sql.slice(lastIdx);
}

/** Remove balanced parenthesized block starting at given index. Returns end index. */
function findClosingParen(sql: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  while (i < sql.length && depth > 0) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') depth--;
    i++;
  }
  return depth === 0 ? i : -1;
}

/** Strip all balanced (...) blocks following a keyword (e.g. CHECK, WITH, INCLUDE) */
function stripKeywordWithParens(sql: string, keyword: RegExp): string {
  let result = '';
  let lastIdx = 0;
  const pattern = new RegExp(`(?:,\\s*)?\\b${keyword.source}\\s*\\(`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sql)) !== null) {
    // The match already includes the opening '(' at the end
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findClosingParen(sql, openIdx);
    if (closeIdx === -1) continue;
    result += sql.slice(lastIdx, m.index);
    lastIdx = closeIdx;
    pattern.lastIndex = closeIdx;
  }
  return result + sql.slice(lastIdx);
}

/** Clean MSSQL-specific syntax that node-sql-parser can't handle */
function cleanMSSQLSyntax(sql: string): string {
  // Strip SQL single-line comments (they contain keywords that confuse cleanup regexes)
  sql = sql.replace(/--.*$/gm, '');

  // Strip block comments
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  // Strip [bracket] identifiers → bare names
  sql = sql.replace(/\[([^\]]+)\]/g, '$1');

  // Strip schema prefixes: dbo. / schema.
  sql = sql.replace(/\bdbo\./gi, '');

  // Strip N'...' Unicode string prefix → regular '...'
  sql = sql.replace(/\bN'/gi, "'");

  // Strip named constraint prefixes: "constraint PK_NAME primary key" → "primary key"
  sql = sql.replace(/\bconstraint\s+\S+\s+/gi, '');

  // Strip bare "references <table>" without column list (\b prevents backtracking inside table name)
  sql = sql.replace(/\breferences\s+\w+\b(?!\s*\()/gi, '');

  // IDENTITY(1,1) or IDENTITY (1, 1) → identity
  sql = sql.replace(/\bidentity\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'identity');

  // NOT FOR REPLICATION (used with identity/FK)
  sql = sql.replace(/\bNOT\s+FOR\s+REPLICATION\b/gi, '');

  // MSSQL (max) types: nvarchar(max) → nvarchar(4000), varchar(max) → varchar(8000), varbinary(max) → varbinary(8000)
  sql = sql.replace(/\bnvarchar\s*\(\s*max\s*\)/gi, 'nvarchar(4000)');
  sql = sql.replace(/\bvarchar\s*\(\s*max\s*\)/gi, 'varchar(8000)');
  sql = sql.replace(/\bvarbinary\s*\(\s*max\s*\)/gi, 'varbinary(8000)');

  // MSSQL-specific types the parser doesn't understand → standard equivalents
  sql = sql.replace(/\bdatetime2\s*\(\s*\d+\s*\)/gi, 'datetime');
  sql = sql.replace(/\bdatetimeoffset\s*\(\s*\d+\s*\)/gi, 'datetime');
  sql = sql.replace(/\btime\s*\(\s*\d+\s*\)/gi, 'time');
  sql = sql.replace(/\bdatetime2\b/gi, 'datetime');
  sql = sql.replace(/\bdatetimeoffset\b/gi, 'datetime');
  sql = sql.replace(/\bsmalldatetime\b/gi, 'datetime');
  sql = sql.replace(/\bhierarchyid\b/gi, 'varchar(900)');
  sql = sql.replace(/\bsql_variant\b/gi, 'varchar(8000)');
  sql = sql.replace(/\bsysname\b/gi, 'nvarchar(128)');
  sql = sql.replace(/\browversion\b/gi, 'binary(8)');
  sql = sql.replace(/\btimestamp\b/gi, 'binary(8)');
  sql = sql.replace(/\bntext\b/gi, 'text');
  sql = sql.replace(/\bimage\b/gi, 'varbinary(8000)');
  sql = sql.replace(/\bxml\b/gi, 'text');
  sql = sql.replace(/\bgeography\b/gi, 'text');
  sql = sql.replace(/\bgeometry\b/gi, 'text');
  sql = sql.replace(/\buniqueidentifier\b/gi, 'char(36)');
  sql = sql.replace(/\bsmallmoney\b/gi, 'decimal(10,4)');
  sql = sql.replace(/\bmoney\b/gi, 'decimal(19,4)');

  // Strip CHECK constraints (balanced paren matching for nested expressions)
  sql = stripKeywordWithParens(sql, /check/);

  // Strip computed columns with parens: <name> AS (...)
  sql = stripKeywordWithParens(sql, /\w+\s+as/);

  // Strip computed columns without parens: "col_name as expr" (up to comma/closing paren/newline)
  sql = sql.replace(/,?\s*\b\w+\s+as\s+(?!\s*\()[^,)\n]+/gi, '');

  // Unwrap DEFAULT (expr) → DEFAULT expr
  sql = unwrapDefaultParens(sql);

  // Strip NONCLUSTERED / CLUSTERED keywords
  sql = sql.replace(/\b(NON)?CLUSTERED\b/gi, '');

  // Strip INCLUDE (...) clause (MSSQL index included columns)
  sql = stripKeywordWithParens(sql, /include/);

  // Strip WITH (...) options (balanced)
  sql = stripKeywordWithParens(sql, /with/);

  // Strip WHERE (...) filter predicates on indexes
  sql = stripKeywordWithParens(sql, /where/);

  // Strip ON [filegroup] clauses
  sql = sql.replace(/\bON\s+\[?\w+\]?(?=\s*$|\s*,|\s*\))/gim, '');

  // Strip ASC/DESC after column in PK/index definitions
  sql = sql.replace(/\b(ASC|DESC)\b/gi, '');

  // Strip TEXTIMAGE_ON [filegroup]
  sql = sql.replace(/\bTEXTIMAGE_ON\s+\[?\w+\]?/gi, '');

  // Strip MSSQL-specific column/constraint keywords
  sql = sql.replace(/\bROWGUIDCOL\b/gi, '');
  sql = sql.replace(/\bSPARSE\b/gi, '');
  sql = sql.replace(/\bPERSISTED\b/gi, '');
  sql = sql.replace(/\bFILESTREAM\b/gi, '');
  sql = sql.replace(/\bMASKED\b/gi, '');

  // Strip MASKED WITH (FUNCTION = '...') — Dynamic Data Masking
  sql = sql.replace(/\bMASKED\s+WITH\s*\([^)]*\)/gi, '');

  // Fix trailing comma before closing paren (from removed lines)
  sql = sql.replace(/,(\s*\n?\s*\))/g, '$1');
  // Fix double/triple commas
  sql = sql.replace(/,(\s*,)+/g, ',');
  // Fix leading comma after opening paren
  sql = sql.replace(/\(\s*,/g, '(');
  // Remove empty lines
  sql = sql.replace(/^\s*\n/gm, '');

  return sql;
}

function preprocessMSSQL(sql: string): MSSQLPreprocessResult {
  const tableComments = new Map<string, string>();
  const colComments = new Map<string, Map<string, string>>();
  const alterFKs: MSSQLAlterFK[] = [];
  const alterUQs: MSSQLAlterUQ[] = [];
  const statements: string[] = [];
  const seenStmts = new Set<string>();

  // Split by 'go' batch separator (case-insensitive, standalone line)
  const batches = sql.split(/^\s*go\s*$/gim);

  for (const batch of batches) {
    const trimmed = batch.trim();
    if (!trimmed) continue;

    // Extract comments from exec sp_addextendedproperty
    const extPropMatch = trimmed.match(
      /sp_addextendedproperty\s+'MS_Description'\s*,\s*N?'([^']*)'\s*,\s*'SCHEMA'\s*,\s*'[^']*'\s*,\s*'TABLE'\s*,\s*'([^']*)'/i,
    );
    if (extPropMatch) {
      const comment = extPropMatch[1];
      const tableName = extPropMatch[2];
      const colMatch = trimmed.match(/'COLUMN'\s*,\s*\n?\s*'([^']*)'/i);
      const isConstraint = /'CONSTRAINT'/i.test(trimmed);
      if (colMatch && !isConstraint) {
        if (!colComments.has(tableName)) colComments.set(tableName, new Map());
        colComments.get(tableName)!.set(colMatch[1], comment);
      } else if (!isConstraint) {
        tableComments.set(tableName, comment);
      }
      continue;
    }

    // Skip other exec statements
    if (/^\s*exec\b/i.test(trimmed)) continue;

    // Skip create index / alter index
    if (/^\s*(create|alter)\s+(unique\s+)?(nonclustered\s+)?index\b/i.test(trimmed)) continue;

    // Extract ALTER TABLE FK via regex (parser struggles with MSSQL ALTER TABLE syntax)
    const alterFKMatch = trimmed.match(
      /alter\s+table\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s+add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]+)\)\s*references\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s*\(([^)]+)\)/i,
    );
    if (alterFKMatch) {
      alterFKs.push({
        tableName: alterFKMatch[1],
        columns: alterFKMatch[2].split(',').map((s: string) => s.replace(/[\[\]]/g, '').trim()),
        refTable: alterFKMatch[3],
        refColumns: alterFKMatch[4].split(',').map((s: string) => s.replace(/[\[\]]/g, '').trim()),
      });
      continue;
    }

    // Extract ALTER TABLE UNIQUE via regex
    const alterUQMatch = trimmed.match(
      /alter\s+table\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s+add\s+(?:constraint\s+(\S+)\s+)?unique\s*(?:nonclustered\s*)?\(([^)]+)\)/i,
    );
    if (alterUQMatch) {
      const cols = alterUQMatch[3].split(',').map((s: string) => s.replace(/[\[\]]/g, '').trim());
      if (cols.length >= 2) {
        alterUQs.push({
          tableName: alterUQMatch[1],
          columns: cols,
          name: alterUQMatch[2]?.replace(/[\[\]]/g, ''),
        });
      }
      continue;
    }

    // Extract inline FK references from raw DDL BEFORE cleanup strips them
    const tblNameRaw = trimmed.match(/create\s+table\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?/i)?.[1];
    if (tblNameRaw && /^\s*create\s+table\b/i.test(trimmed)) {
      // Find table body between first ( and last )
      const bodyStart = trimmed.indexOf('(');
      const bodyEnd = trimmed.lastIndexOf(')');
      if (bodyStart !== -1 && bodyEnd !== -1) {
        const body = trimmed.slice(bodyStart + 1, bodyEnd);
        // Split by top-level commas (tracking paren depth)
        const colDefs: string[] = [];
        let depth = 0, start = 0;
        for (let ci = 0; ci < body.length; ci++) {
          if (body[ci] === '(') depth++;
          else if (body[ci] === ')') depth--;
          else if (body[ci] === ',' && depth === 0) {
            colDefs.push(body.slice(start, ci));
            start = ci + 1;
          }
        }
        colDefs.push(body.slice(start));

        for (const colDef of colDefs) {
          const clean = colDef.replace(/\[([^\]]+)\]/g, '$1').replace(/\bdbo\./gi, '').trim();
          if (!clean) continue;

          // Check for references
          const refMatch = clean.match(/\breferences\s+(\w+)\s*(?:\(\s*(\w+)\s*\))?/i);
          if (!refMatch) continue;

          // Determine source column:
          // - Table-level: "foreign key (COL) references TABLE"
          const fkColMatch = clean.match(/\bforeign\s+key\s*\(\s*(\w+)\s*\)/i);
          // - Column-level: first word is the column name (not a keyword)
          const firstWord = clean.match(/^(\w+)/)?.[1] ?? '';
          const isTableLevel = /^(constraint|foreign|primary|unique|check)\b/i.test(firstWord);

          let srcCol: string;
          if (fkColMatch) {
            srcCol = fkColMatch[1]; // from "foreign key (COL)"
          } else if (!isTableLevel) {
            srcCol = firstWord; // column-level: first word is column name
          } else {
            continue; // can't determine source column
          }

          alterFKs.push({
            tableName: tblNameRaw,
            columns: [srcCol],
            refTable: refMatch[1],
            refColumns: refMatch[2] ? [refMatch[2]] : [],
          });
        }
      }
    }

    // Clean MSSQL-specific syntax
    let cleaned = cleanMSSQLSyntax(trimmed);

    // Keep CREATE TABLE statements only (ALTER TABLE FKs handled above)
    if (/^\s*create\s+table\b/i.test(cleaned)) {
      const tblMatch = cleaned.match(/create\s+table\s+(\w+)/i);
      const tblName = tblMatch?.[1] ?? '';

      // Extract and strip table-level FK constraints (parser can't handle them)
      const fkPattern = /,?\s*\bforeign\s+key\s*\(([^)]+)\)\s*references\s+(\w+)\s*\(([^)]+)\)/gi;
      let fkMatch: RegExpExecArray | null;
      while ((fkMatch = fkPattern.exec(cleaned)) !== null) {
        if (tblName) {
          alterFKs.push({
            tableName: tblName,
            columns: fkMatch[1].split(',').map(s => s.trim()),
            refTable: fkMatch[2],
            refColumns: fkMatch[3].split(',').map(s => s.trim()),
          });
        }
      }
      cleaned = cleaned.replace(fkPattern, '');

      // Extract and strip table-level UNIQUE constraints (parser misparses them as columns)
      // Handles: UNIQUE (col), UNIQUE name (col), UNIQUE INDEX name (col), etc.
      const uqPattern = /,?\s*\bunique\b[^(,)]*\(([^)]+)\)/gi;
      let uqMatch: RegExpExecArray | null;
      while ((uqMatch = uqPattern.exec(cleaned)) !== null) {
        if (tblName) {
          const cols = uqMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          if (cols.length > 0) {
            alterUQs.push({ tableName: tblName, columns: cols });
          }
        }
      }
      cleaned = cleaned.replace(uqPattern, '');

      // Also strip any bare UNIQUE keyword left without parens
      cleaned = cleaned.replace(/,?\s*\bunique\s*(?=\s*[,)])/gi, '');

      // Also strip any remaining inline references (now that FKs are extracted)
      cleaned = cleaned.replace(/\breferences\s+\w+\s*(\([^)]*\))?\s*/gi, '');

      // Clean up after removal (trailing comma before closing paren)
      cleaned = cleaned.replace(/,(\s*\n?\s*\))/g, '$1');

      // Deduplicate identical statements
      const normalized = cleaned.replace(/\s+/g, ' ').trim();
      if (!seenStmts.has(normalized)) {
        seenStmts.add(normalized);
        statements.push(cleaned);
      }
    }
  }

  return { statements, tableComments, colComments, alterFKs, alterUQs };
}

function cleanMSSQLStatement(sql: string): string {
  // Apply the full MSSQL syntax cleanup again (in case preprocessing missed something)
  sql = cleanMSSQLSyntax(sql);

  // More aggressive: strip ALL inline references (with or without column list)
  sql = sql.replace(/\breferences\s+\w+\s*(\([^)]*\))?\s*/gi, '');

  // Strip all DEFAULT clauses entirely (nuclear option for stubborn expressions)
  sql = sql.replace(/\bDEFAULT\s+(?:'[^']*'|\w+\([^)]*\)|[\w.]+)/gi, '');

  // Remove table-level UNIQUE constraints (with or without content, parser misidentifies them)
  sql = sql.replace(/,?\s*\bunique\s*\([^)]*\)/gi, '');

  // Remove bare UNIQUE keyword left as table-level entry (no parens)
  sql = sql.replace(/,?\s*\bunique\s*(?=\s*[,)])/gi, '');

  // Fix trailing comma before closing paren
  sql = sql.replace(/,(\s*\n?\s*\))/g, '$1');
  // Fix double commas
  sql = sql.replace(/,\s*,/g, ',');
  // Fix leading comma
  sql = sql.replace(/\(\s*,/g, '(');

  return sql;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveParser(mod: any): any {
  // CJS modules imported via ESM: Parser may be at mod.Parser (Vite) or mod.default.Parser (Node.js)
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
  }
}

export interface ImportResult {
  tables: Table[];
  errors: string[];
  warnings: string[];
}

/**
 * Extract inline column-level CHECK constraints from raw SQL.
 * Returns Map<tableName, Map<columnName, checkExpression>>
 */
function extractCheckConstraints(sql: string): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  // Match CREATE TABLE blocks
  const tableRe = /create\s+table\s+(?:\[?\w+\]?\.)?[\[`"]?(\w+)[\]`"]?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\))/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tableRe.exec(sql)) !== null) {
    const tableName = tMatch[1];
    const body = tMatch[2];
    // Split by top-level commas
    const colDefs: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') depth--;
      else if (body[i] === ',' && depth === 0) {
        colDefs.push(body.slice(start, i));
        start = i + 1;
      }
    }
    colDefs.push(body.slice(start));

    for (const colDef of colDefs) {
      const trimmed = colDef.trim();
      // Skip table-level constraints
      if (/^(constraint|primary|foreign|unique|check|index|key)\b/i.test(trimmed)) continue;
      // Extract column name (first word)
      const colNameMatch = trimmed.match(/^[\[`"]?(\w+)[\]`"]?\s+/);
      if (!colNameMatch) continue;
      const colName = colNameMatch[1];
      // Find CHECK (...) in this column definition
      const checkMatch = trimmed.match(/\bcheck\s*\(/i);
      if (!checkMatch) continue;
      const checkStart = checkMatch.index! + checkMatch[0].length - 1;
      // Find matching close paren
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
  const pattern = /create\s+(unique\s+)?(?:nonclustered\s+)?index\s+(?:\[?(\w+)\]?)\s+on\s+(?:\[?\w+\]?\.)?[\[`"]?(\w+)[\]`"]?\s*\(([^)]+)\)/gi;
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

export async function importDDL(sql: string, dialect: Dialect = 'mysql', messages?: DDLImportMessages): Promise<ImportResult> {
  const msg = messages ?? DEFAULT_MESSAGES;
  const errors: string[] = [];
  const warnings: string[] = [];
  const tables: Table[] = [];
  const existingNames: string[] = [];
  _typeWarnings = [];
  // Extract CHECK constraints from raw SQL before parsing
  const checkConstraints = extractCheckConstraints(sql);
  // Extract CREATE INDEX statements from raw SQL
  const parsedIndexes = extractIndexStatements(sql);

  let parser;
  try {
    parser = await getParser(dialect);
  } catch (e) {
    errors.push(`Parser load failed: ${e}`);
    return { tables, errors, warnings };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stmts: any[];
  let mssqlComments: { tableComments: Map<string, string>; colComments: Map<string, Map<string, string>> } | null = null;
  let mssqlAlterFKs: MSSQLAlterFK[] = [];
  let mssqlAlterUQs: MSSQLAlterUQ[] = [];

  if (dialect === 'mssql') {
    const preprocessed = preprocessMSSQL(sql);
    mssqlComments = { tableComments: preprocessed.tableComments, colComments: preprocessed.colComments };
    mssqlAlterFKs = preprocessed.alterFKs;
    mssqlAlterUQs = preprocessed.alterUQs;
    stmts = [];
    for (const stmtSql of preprocessed.statements) {
      try {
        const result = parser.astify(stmtSql);
        const arr = Array.isArray(result) ? result : [result];
        stmts.push(...arr);
      } catch {
        // Try with cleanup (remove duplicate constraints, empty unique, etc.)
        try {
          const cleaned = cleanMSSQLStatement(stmtSql);
          const result = parser.astify(cleaned);
          const arr = Array.isArray(result) ? result : [result];
          stmts.push(...arr);
        } catch (e) {
          const tMatch = stmtSql.match(/(?:create|alter)\s+table\s+(\w+)/i);
          errors.push(`Parse failed (${tMatch?.[1] ?? 'unknown'}): ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } else {
    // Try parsing the entire SQL at once first
    try {
      const result = parser.astify(sql);
      stmts = Array.isArray(result) ? result : [result];
    } catch {
      // Fallback: split by semicolons and parse each statement individually
      stmts = [];
      const rawStmts = sql.split(/;\s*/).filter((s) => s.trim());
      for (const rawStmt of rawStmts) {
        const trimmed = rawStmt.trim();
        if (!trimmed) continue;
        try {
          const result = parser.astify(trimmed);
          const arr = Array.isArray(result) ? result : [result];
          stmts.push(...arr);
        } catch (e) {
          const tMatch = trimmed.match(/(?:create|alter)\s+table\s+(\w+)/i);
          if (tMatch) {
            errors.push(`Parse failed (${tMatch[1]}): ${e instanceof Error ? e.message : e}`);
          }
          // Skip non-table statements silently (e.g. USE, SET, etc.)
        }
      }
      if (stmts.length === 0 && errors.length === 0) {
        errors.push(msg.noCreateTable());
        return { tables, errors, warnings };
      }
    }
  }

  // Collect ALTER TABLE FK/UQ and COMMENT ON statements
  const alterFKMap = new Map<string, ParsedFK[]>();
  const alterUQMap = new Map<string, { columns: string[]; name?: string }[]>();
  const tableComments = new Map<string, string>();
  const colComments = new Map<string, Map<string, string>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const stmt of stmts) {
    // ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY / UNIQUE
    if (stmt.type === 'alter' && stmt.keyword === 'table') {
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

  // Process CREATE TABLE statements
  const GRID_COLS = 4;
  const GRID_GAP_X = 300;
  const GRID_GAP_Y = 220;
  let tableIdx = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const stmt of stmts) {
    if (stmt.type !== 'create' || stmt.keyword !== 'table') continue;

    try {
      const rawTableName = stmt.table?.[0]?.table ?? 'unknown';
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
          // Skip false columns from parser misidentifying SQL keywords as column names
          if (/^(unique|primary|key|foreign|constraint|check|index|references)$/i.test(colName)) continue;
          const rawType = def.definition?.dataType ?? 'VARCHAR';
          const length = def.definition?.length ?? undefined;
          const scale = def.definition?.scale ?? undefined;
          const warnsBefore = _typeWarnings.length;
          const type = normalizeType(rawType);
          // Capture type normalization warnings with table/column context
          if (_typeWarnings.length > warnsBefore) {
            const w = _typeWarnings[_typeWarnings.length - 1];
            warnings.push(`Type: ${w.original} → ${w.normalized} (${tableName}.${colName})`);
          }
          const nullable = def.nullable?.type !== 'not null';
          const isPK = !!def.primary_key;
          const isUnique = !!def.unique;
          const autoInc = !!def.auto_increment || !!def.identity ||
            rawType.toUpperCase() === 'SERIAL' ||
            rawType.toUpperCase() === 'BIGSERIAL';
          const defaultValue = extractDefaultValue(def.default_val);

          // Comment from MySQL inline COMMENT
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
        } else if (def.resource === 'constraint') {
          const ct = def.constraint_type?.toUpperCase() ?? '';
          if (ct === 'PRIMARY KEY') {
            for (const d of def.definition ?? []) {
              primaryKeys.push(extractColumnName(d.column));
            }
          } else if (ct.includes('UNIQUE')) {
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
      if (tableComments.has(rawTableName)) {
        tableComment = tableComments.get(rawTableName);
      }

      // PostgreSQL COMMENT ON COLUMN
      const colCmts = colComments.get(rawTableName);
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
      const alterFKs = alterFKMap.get(rawTableName) ?? [];
      foreignKeys.push(...alterFKs);

      // Merge ALTER TABLE UQs into compositeUniqueGroups
      const alterUQs = alterUQMap.get(rawTableName) ?? [];
      compositeUniqueGroups.push(...alterUQs);

      const col = tableIdx % GRID_COLS;
      const row = Math.floor(tableIdx / GRID_COLS);

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

      const table: Table = {
        id: generateId(),
        name: tableName,
        columns,
        foreignKeys: [],
        uniqueKeys,
        indexes: [],
        position: { x: 40 + col * GRID_GAP_X, y: 40 + row * GRID_GAP_Y },
        comment: tableComment,
      };

      // Store parsed FK info for second-pass resolution
      (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs = foreignKeys;
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

  // Second pass: resolve foreign keys
  for (const table of tables) {
    const parsedFKs = (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs ?? [];
    delete (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs;

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

  // Apply MSSQL ALTER TABLE FKs (extracted via regex in preprocessing)
  // Deduplicate by (tableName, column, refTable) to avoid duplicate FKs
  const seenFKs = new Set<string>();
  for (const afk of mssqlAlterFKs) {
    const srcTable = tables.find((t) => t.name === afk.tableName);
    const refTable = tables.find((t) => t.name === afk.refTable);
    if (!srcTable || !refTable) continue;

    // If refColumns is empty, resolve to PK of target table
    if (afk.refColumns.length === 0) {
      const pkCol = refTable.columns.find(c => c.primaryKey);
      if (pkCol) afk.refColumns = [pkCol.name];
      else continue;
    }

    // Deduplicate
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
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
  }

  // Apply MSSQL ALTER TABLE UNIQUE constraints (skip duplicates already in CREATE TABLE)
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

  // Apply CREATE INDEX statements
  for (const pidx of parsedIndexes) {
    const srcTable = tables.find((t) => t.name === pidx.tableName);
    if (!srcTable) continue;
    const colIds = pidx.columnNames
      .map((name) => srcTable.columns.find((c) => c.name === name)?.id)
      .filter((id): id is string => !!id);
    if (colIds.length === 0) continue;
    const idx: TableIndex = {
      id: generateId(),
      columnIds: colIds,
      unique: pidx.unique,
      name: pidx.name,
    };
    srcTable.indexes.push(idx);
  }

  // Apply MSSQL sp_addextendedproperty comments
  if (mssqlComments) {
    for (const table of tables) {
      const tComment = mssqlComments.tableComments.get(table.name);
      if (tComment) table.comment = tComment;
      const colCmts = mssqlComments.colComments.get(table.name);
      if (colCmts) {
        for (const col of table.columns) {
          const c = colCmts.get(col.name);
          if (c) col.comment = c;
        }
      }
    }
  }

  return { tables, errors, warnings };
}

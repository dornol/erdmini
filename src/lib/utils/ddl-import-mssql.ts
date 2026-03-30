import type { ReferentialAction } from '$lib/types/erd';
import { parseRefAction } from './ddl-import-types';

export interface MSSQLAlterFK {
  tableName: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export interface MSSQLAlterUQ {
  tableName: string;
  columns: string[];
  name?: string;
}

export interface MSSQLPreprocessResult {
  statements: string[];
  tableComments: Map<string, string>;
  colComments: Map<string, Map<string, string>>;
  alterFKs: MSSQLAlterFK[];
  alterUQs: MSSQLAlterUQ[];
}

/** Unwrap MSSQL default parens: DEFAULT ((0)) → DEFAULT 0, DEFAULT (getdate()) → DEFAULT getdate() */
export function unwrapDefaultParens(sql: string): string {
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
export function cleanMSSQLSyntax(sql: string): string {
  // Strip SQL single-line comments (they contain keywords that confuse cleanup regexes)
  sql = sql.replace(/--.*$/gm, '');

  // Strip block comments
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  // Strip [bracket] identifiers → bare names (preserve reserved words as double-quoted)
  // Excludes SQL structural keywords (PRIMARY, UNIQUE, etc.) that appear in constraint/filegroup contexts
  const mssqlReserved = /^(explain|show|key|call|read|write|end|insert|update|delete|drop|table|create|alter|into|set|truncate|desc|asc|order|group|by|from|where|join|add|rename|values|limit|between|in|exists|not|null|is|cross|outer|pivot|unpivot|else|case|when|then|session|left|json|select|like|grant|revoke|lock|use|open|close|return|begin|if|replace|get|right|option|rank|row|rows|range|over|partition|cursor|fetch|function|procedure|trigger|signal|condition|loop|repeat|leave|iterate|declare|continue|offset)$/i;
  sql = sql.replace(/\[([^\]]+)\]/g, (_m, name) => mssqlReserved.test(name) ? `"${name}"` : name);

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

  // Strip ASC/DESC only when following a column ref (PK/index defs)
  // e.g. "([ColName] ASC)" but not "Desc NVARCHAR(500)" as column definition
  // Matches: word + ASC/DESC + followed by comma, closing paren, or end-of-string
  sql = sql.replace(/(\w)\s+(ASC|DESC)\b(?=\s*[,)]|\s*$)/gim, '$1');

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

export function preprocessMSSQL(sql: string): MSSQLPreprocessResult {
  const tableComments = new Map<string, string>();
  const colComments = new Map<string, Map<string, string>>();
  const alterFKs: MSSQLAlterFK[] = [];
  const alterUQs: MSSQLAlterUQ[] = [];
  const statements: string[] = [];
  const seenStmts = new Set<string>();

  // Split by 'go' batch separator (case-insensitive, standalone line), then by semicolons
  const goBatches = sql.split(/^\s*go\s*$/gim);
  const batches: string[] = [];
  for (const goBatch of goBatches) {
    // Further split by semicolons to handle multiple statements within a batch
    const stmtParts = goBatch.split(/;\s*/).filter((s) => s.trim());
    batches.push(...stmtParts);
  }

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

          // Extract ON DELETE/UPDATE actions from the FK definition
          const onDeleteMatch = clean.match(/\bON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
          const onUpdateMatch = clean.match(/\bON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
          alterFKs.push({
            tableName: tblNameRaw,
            columns: [srcCol],
            refTable: refMatch[1],
            refColumns: refMatch[2] ? [refMatch[2]] : [],
            onDelete: onDeleteMatch ? parseRefAction(onDeleteMatch[1]) : undefined,
            onUpdate: onUpdateMatch ? parseRefAction(onUpdateMatch[1]) : undefined,
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
      // Also capture ON DELETE/UPDATE actions to avoid leaving orphaned clauses
      const fkPattern = /,?\s*\bforeign\s+key\s*\(([^)]+)\)\s*references\s+(\w+)\s*\(([^)]+)\)((?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION))*)/gi;
      let fkMatch: RegExpExecArray | null;
      while ((fkMatch = fkPattern.exec(cleaned)) !== null) {
        if (tblName) {
          const actionStr = fkMatch[4] || '';
          const onDelMatch = actionStr.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
          const onUpdMatch = actionStr.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
          alterFKs.push({
            tableName: tblName,
            columns: fkMatch[1].split(',').map(s => s.trim()),
            refTable: fkMatch[2],
            refColumns: fkMatch[3].split(',').map(s => s.trim()),
            onDelete: onDelMatch ? parseRefAction(onDelMatch[1]) : undefined,
            onUpdate: onUpdMatch ? parseRefAction(onUpdMatch[1]) : undefined,
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

export function cleanMSSQLStatement(sql: string): string {
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

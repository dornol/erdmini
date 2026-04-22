import type { Column, ColumnDomain, Dialect, ERDSchema, Table } from '$lib/types/erd';

export interface DDLExportOptions {
  indent: '2spaces' | '4spaces' | 'tab';
  quoteStyle: 'none' | 'backtick' | 'double' | 'bracket';
  includeComments: boolean;
  includeIndexes: boolean;
  includeForeignKeys: boolean;
  includeDomains: boolean;
  upperCaseKeywords: boolean;
  dbObjectIds?: string[];
}

export function getDefaultQuoteStyle(dialect: Dialect): DDLExportOptions['quoteStyle'] {
  if (dialect === 'mysql' || dialect === 'mariadb') return 'backtick';
  if (dialect === 'mssql') return 'bracket';
  if (dialect === 'sqlite') return 'none';
  return 'double';
}

export const DEFAULT_DDL_OPTIONS: DDLExportOptions = {
  indent: '2spaces',
  quoteStyle: 'backtick',
  includeComments: true,
  includeIndexes: true,
  includeForeignKeys: true,
  includeDomains: true,
  upperCaseKeywords: true,
};

export function getIndent(indent: DDLExportOptions['indent']): string {
  if (indent === '4spaces') return '    ';
  if (indent === 'tab') return '\t';
  return '  ';
}

export function q(name: string, style: DDLExportOptions['quoteStyle']): string {
  if (style === 'none') return name;
  if (style === 'backtick') return `\`${name}\``;
  if (style === 'bracket') return `[${name}]`;
  return `"${name}"`; // double
}

export function kw(keyword: string, upper: boolean): string {
  return upper ? keyword.toUpperCase() : keyword.toLowerCase();
}

export function columnTypeSql(col: Column, dialect: Dialect, upper: boolean, tableName?: string): string {
  const len = col.length ? `(${col.length})` : '';
  const decimalLen = col.length
    ? `(${col.length}${col.scale != null ? `,${col.scale}` : ''})`
    : '';

  const enumList = col.enumValues?.length ? `(${col.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})` : '';

  if (dialect === 'mysql' || dialect === 'mariadb') {
    if (col.autoIncrement && (col.type === 'BIGINT' || col.type === 'INT')) return kw(col.type, upper);
    if (col.type === 'ENUM') return `${kw('ENUM', upper)}${enumList || "('value')"}`;
    if (col.type === 'NVARCHAR') return `${kw('VARCHAR', upper)}${len || '(255)'}`;
    if (col.type === 'NCHAR') return `${kw('CHAR', upper)}${len || '(255)'}`;
    if (col.type === 'NTEXT') return kw('TEXT', upper);
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${kw(col.type, upper)}${len || '(255)'}`;
    if (col.type === 'DECIMAL' || col.type === 'NUMERIC') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
    if (col.type === 'UUID') return `${kw('CHAR', upper)}(36)`;
    if (col.type === 'REAL') return kw('FLOAT', upper);
    if (col.type === 'BIT') return kw('TINYINT', upper) + '(1)';
    if (col.type === 'TIME') return col.length ? `${kw('TIME', upper)}(${col.length})` : kw('TIME', upper);
    if (col.type === 'YEAR') return kw('YEAR', upper);
    if (col.type === 'DATETIMEOFFSET') return kw('TIMESTAMP', upper);
    if (col.type === 'INTERVAL') return `${kw('VARCHAR', upper)}(64)`;
    if (col.type === 'MONEY') return `${kw('DECIMAL', upper)}(19,4)`;
    if (col.type === 'JSONB') return kw('JSON', upper);
    if (col.type === 'BINARY') return `${kw('BINARY', upper)}${len || '(255)'}`;
    if (col.type === 'VARBINARY') return `${kw('VARBINARY', upper)}${len || '(255)'}`;
    if (col.type === 'BLOB') return kw('LONGBLOB', upper);
    return kw(col.type, upper);
  }

  if (dialect === 'postgresql') {
    if (col.autoIncrement) return kw(col.type === 'BIGINT' ? 'BIGSERIAL' : col.type === 'SMALLINT' ? 'SMALLSERIAL' : 'SERIAL', upper);
    if (col.type === 'ENUM') return col.enumValues?.length && tableName ? `${tableName}_${col.name}_enum` : `${kw('VARCHAR', upper)}(255)`;
    if (col.type === 'NVARCHAR') return `${kw('VARCHAR', upper)}${len || '(255)'}`;
    if (col.type === 'NCHAR') return `${kw('CHAR', upper)}${len || '(255)'}`;
    if (col.type === 'NTEXT') return kw('TEXT', upper);
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${kw(col.type, upper)}${len || '(255)'}`;
    if (col.type === 'DATETIME') return kw('TIMESTAMP', upper);
    if (col.type === 'DATETIMEOFFSET') return `${kw('TIMESTAMP', upper)} ${kw('WITH TIME ZONE', upper)}`;
    if (col.type === 'YEAR') return kw('SMALLINT', upper);
    if (col.type === 'INTERVAL') return kw('INTERVAL', upper);
    if (col.type === 'MONEY') return kw('MONEY', upper);
    if (col.type === 'JSONB') return kw('JSONB', upper);
    if (col.type === 'DECIMAL' || col.type === 'NUMERIC') return `${kw('NUMERIC', upper)}${decimalLen || '(10,2)'}`;
    if (col.type === 'REAL') return kw('REAL', upper);
    if (col.type === 'TINYINT' || col.type === 'MEDIUMINT') return kw('INTEGER', upper);
    if (col.type === 'BIT') return kw('BOOLEAN', upper);
    if (col.type === 'TIME') return col.length ? `${kw('TIME', upper)}(${col.length})` : kw('TIME', upper);
    if (col.type === 'BINARY' || col.type === 'VARBINARY') return kw('BYTEA', upper);
    if (col.type === 'BLOB') return kw('BYTEA', upper);
    return kw(col.type, upper);
  }

  if (dialect === 'sqlite') {
    if (col.type === 'INT' || col.type === 'BIGINT' || col.type === 'SMALLINT' || col.type === 'TINYINT' || col.type === 'MEDIUMINT' || col.type === 'BOOLEAN' || col.type === 'BIT' || col.type === 'YEAR') return kw('INTEGER', upper);
    if (col.type === 'DECIMAL' || col.type === 'NUMERIC' || col.type === 'FLOAT' || col.type === 'DOUBLE' || col.type === 'REAL' || col.type === 'MONEY') return kw('REAL', upper);
    if (col.type === 'BINARY' || col.type === 'VARBINARY' || col.type === 'BLOB') return kw('BLOB', upper);
    return kw('TEXT', upper);
  }

  if (dialect === 'oracle') {
    if (col.type === 'INT' || col.type === 'MEDIUMINT') return `${kw('NUMBER', upper)}(10)`;
    if (col.type === 'BIGINT') return `${kw('NUMBER', upper)}(19)`;
    if (col.type === 'SMALLINT' || col.type === 'YEAR') return `${kw('NUMBER', upper)}(5)`;
    if (col.type === 'TINYINT') return `${kw('NUMBER', upper)}(3)`;
    if (col.type === 'BOOLEAN' || col.type === 'BIT') return `${kw('NUMBER', upper)}(1)`;
    if (col.type === 'VARCHAR' || col.type === 'NVARCHAR') return `${kw('VARCHAR2', upper)}${len || '(255)'}`;
    if (col.type === 'CHAR' || col.type === 'NCHAR') return `${kw('CHAR', upper)}${len || '(255)'}`;
    if (col.type === 'TEXT' || col.type === 'NTEXT' || col.type === 'JSON' || col.type === 'JSONB') return kw('CLOB', upper);
    if (col.type === 'DATE') return kw('DATE', upper);
    if (col.type === 'TIME') return kw('TIMESTAMP', upper);
    if (col.type === 'DATETIME' || col.type === 'TIMESTAMP') return kw('TIMESTAMP', upper);
    if (col.type === 'DATETIMEOFFSET') return `${kw('TIMESTAMP', upper)} ${kw('WITH TIME ZONE', upper)}`;
    if (col.type === 'INTERVAL') return `${kw('INTERVAL DAY TO SECOND', upper)}`;
    if (col.type === 'MONEY') return `${kw('NUMBER', upper)}(19,4)`;
    if (col.type === 'DECIMAL' || col.type === 'NUMERIC') return `${kw('NUMBER', upper)}${decimalLen || '(10,2)'}`;
    if (col.type === 'FLOAT' || col.type === 'REAL') return kw('FLOAT', upper);
    if (col.type === 'DOUBLE') return kw('BINARY_DOUBLE', upper);
    if (col.type === 'UUID') return `${kw('VARCHAR2', upper)}(36)`;
    if (col.type === 'ENUM') return `${kw('VARCHAR2', upper)}(255)`;
    if (col.type === 'BINARY' || col.type === 'VARBINARY') return `${kw('RAW', upper)}${len || '(255)'}`;
    if (col.type === 'BLOB') return kw('BLOB', upper);
    return kw(col.type, upper);
  }

  if (dialect === 'h2') {
    if (col.type === 'TEXT' || col.type === 'NTEXT') return kw('CLOB', upper);
    if (col.type === 'NVARCHAR') return `${kw('VARCHAR', upper)}${len || '(255)'}`;
    if (col.type === 'NCHAR') return `${kw('CHAR', upper)}${len || '(255)'}`;
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${kw(col.type, upper)}${len || '(255)'}`;
    if (col.type === 'DECIMAL' || col.type === 'NUMERIC') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
    if (col.type === 'ENUM') return `${kw('ENUM', upper)}${enumList || "('value')"}`;
    if (col.type === 'DATETIME') return kw('TIMESTAMP', upper);
    if (col.type === 'DATETIMEOFFSET') return `${kw('TIMESTAMP', upper)} ${kw('WITH TIME ZONE', upper)}`;
    if (col.type === 'YEAR') return kw('SMALLINT', upper);
    if (col.type === 'INTERVAL') return kw('INTERVAL DAY TO SECOND', upper);
    if (col.type === 'MONEY') return `${kw('DECIMAL', upper)}(19,4)`;
    if (col.type === 'JSON' || col.type === 'JSONB') return kw('JSON', upper);
    if (col.type === 'BLOB') return kw('BLOB', upper);
    if (col.type === 'BINARY' || col.type === 'VARBINARY') return `${kw(col.type, upper)}${len || '(255)'}`;
    return kw(col.type, upper);
  }

  // MSSQL
  if (col.type === 'ENUM') return `${kw('NVARCHAR', upper)}(255)`;
  if (col.type === 'BOOLEAN') return kw('BIT', upper);
  if (col.type === 'BIT') return kw('BIT', upper);
  if (col.type === 'TEXT') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'NTEXT') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'VARCHAR') return `${kw('NVARCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'NVARCHAR') return `${kw('NVARCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'CHAR') return `${kw('NCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'NCHAR') return `${kw('NCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'TIME') return col.length ? `${kw('TIME', upper)}(${col.length})` : kw('TIME', upper);
  if (col.type === 'DATETIME' || col.type === 'TIMESTAMP') return col.length ? `${kw('DATETIME2', upper)}(${col.length})` : kw('DATETIME2', upper);
  if (col.type === 'DATETIMEOFFSET') return col.length ? `${kw('DATETIMEOFFSET', upper)}(${col.length})` : kw('DATETIMEOFFSET', upper);
  if (col.type === 'YEAR') return kw('SMALLINT', upper);
  if (col.type === 'INTERVAL') return `${kw('NVARCHAR', upper)}(64)`;
  if (col.type === 'MONEY') return kw('MONEY', upper);
  if (col.type === 'DECIMAL' || col.type === 'NUMERIC') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
  if (col.type === 'DOUBLE' || col.type === 'REAL') return kw('FLOAT', upper);
  if (col.type === 'TINYINT') return kw('TINYINT', upper);
  if (col.type === 'MEDIUMINT') return kw('INT', upper);
  if (col.type === 'JSON') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'JSONB') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'UUID') return kw('UNIQUEIDENTIFIER', upper);
  if (col.type === 'BINARY') return `${kw('BINARY', upper)}${len || '(255)'}`;
  if (col.type === 'VARBINARY') return `${kw('VARBINARY', upper)}${len || '(255)'}`;
  if (col.type === 'BLOB') return `${kw('VARBINARY', upper)}(MAX)`;
  return kw(col.type, upper);
}

export function columnSql(col: Column, dialect: Dialect, opts: DDLExportOptions, domains?: ColumnDomain[], tableName?: string): string {
  const ind = getIndent(opts.indent);
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const parts: string[] = [];
  parts.push(`${ind}${q(col.name, qs)} ${columnTypeSql(col, dialect, up, tableName)}`);

  // MSSQL: IDENTITY instead of AUTO_INCREMENT
  if (col.autoIncrement && dialect === 'mssql') {
    parts.push('IDENTITY(1,1)');
  }

  // Oracle: GENERATED ALWAYS AS IDENTITY
  if (col.autoIncrement && dialect === 'oracle') {
    parts.push(kw('GENERATED ALWAYS AS IDENTITY', up));
  }

  if (!col.nullable) parts.push(kw('NOT NULL', up));

  if (col.autoIncrement && (dialect === 'mysql' || dialect === 'mariadb' || dialect === 'h2')) {
    parts.push(kw('AUTO_INCREMENT', up));
  }

  // SQLite: PRIMARY KEY AUTOINCREMENT inline — only valid for integer types
  if (col.autoIncrement && dialect === 'sqlite' && col.primaryKey
    && (col.type === 'INT' || col.type === 'BIGINT' || col.type === 'SMALLINT')) {
    parts.push(kw('PRIMARY KEY AUTOINCREMENT', up));
  }

  if (col.defaultValue !== undefined && col.defaultValue !== '') {
    if (dialect === 'mssql') {
      parts.push(`${kw('DEFAULT', up)} (${col.defaultValue})`);
    } else {
      parts.push(`${kw('DEFAULT', up)} ${col.defaultValue}`);
    }
  }

  if (col.check) {
    parts.push(`${kw('CHECK', up)} (${col.check})`);
  }

  if (opts.includeComments && col.comment && (dialect === 'mysql' || dialect === 'mariadb')) {
    parts.push(`${kw('COMMENT', up)} '${col.comment.replace(/'/g, "''")}'`);
  }

  // Domain comment
  if (opts.includeDomains && col.domainId && domains) {
    const domain = domains.find(d => d.id === col.domainId);
    if (domain) {
      parts.push(`-- domain: ${domain.name}`);
    }
  }

  return parts.join(' ');
}

export function qualifiedTableName(table: Table, dialect: Dialect, qs: DDLExportOptions['quoteStyle']): string {
  if (table.schema && dialect !== 'sqlite') {
    return `${q(table.schema, qs)}.${q(table.name, qs)}`;
  }
  return q(table.name, qs);
}

export function createTableSql(table: Table, dialect: Dialect, opts: DDLExportOptions, domains?: ColumnDomain[]): string {
  const ind = getIndent(opts.indent);
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const lines: string[] = [];
  const tq = qualifiedTableName(table, dialect, qs);

  for (const col of table.columns) {
    lines.push(columnSql(col, dialect, opts, domains, table.name));
  }

  // SQLite: auto-increment PK is inline, skip from table-level PK clause
  const pkCols = table.columns.filter((c) => c.primaryKey);
  const tableLevelPKCols = dialect === 'sqlite'
    ? pkCols.filter((c) => !c.autoIncrement)
    : pkCols;
  if (tableLevelPKCols.length > 0) {
    lines.push(`${ind}${kw('PRIMARY KEY', up)} (${tableLevelPKCols.map((c) => q(c.name, qs)).join(', ')})`);
  }

  const uqCols = table.columns.filter((c) => c.unique && !c.primaryKey);
  for (const col of uqCols) {
    lines.push(`${ind}${kw('UNIQUE', up)} (${q(col.name, qs)})`);
  }

  // Composite unique keys
  if (table.uniqueKeys) {
    for (const uk of table.uniqueKeys) {
      const ukColNames = uk.columnIds
        .map((id) => table.columns.find((c) => c.id === id))
        .filter((c) => c != null)
        .map((c) => q(c.name, qs));
      if (ukColNames.length < 2) continue;
      if (uk.name) {
        lines.push(`${ind}${kw('CONSTRAINT', up)} ${q(uk.name, qs)} ${kw('UNIQUE', up)} (${ukColNames.join(', ')})`);
      } else {
        lines.push(`${ind}${kw('UNIQUE', up)} (${ukColNames.join(', ')})`);
      }
    }
  }

  let trailer: string;
  if (dialect === 'mysql' || dialect === 'mariadb') {
    const comment = (opts.includeComments && table.comment)
      ? ` COMMENT='${table.comment.replace(/'/g, "''")}'`
      : '';
    trailer = `) ENGINE=InnoDB${comment};`;
  } else {
    trailer = ');';
  }

  // SQLite: skip schema prefix (not supported)
  // Oracle/H2: schema prefix handled by qualifiedTableName

  return `${kw('CREATE TABLE', up)} ${tq} (\n${lines.join(',\n')}\n${trailer}`;
}

function commentOnStatements(table: Table, dialect: Dialect, opts: DDLExportOptions): string[] {
  const stmts: string[] = [];
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const tq = qualifiedTableName(table, dialect, qs);
  if (table.comment) {
    stmts.push(`${kw('COMMENT ON TABLE', up)} ${tq} ${kw('IS', up)} '${table.comment.replace(/'/g, "''")}';`);
  }
  for (const col of table.columns) {
    if (col.comment) {
      stmts.push(
        `${kw('COMMENT ON COLUMN', up)} ${tq}.${q(col.name, qs)} ${kw('IS', up)} '${col.comment.replace(/'/g, "''")}';`,
      );
    }
  }
  return stmts;
}

function mssqlComments(table: Table): string[] {
  const stmts: string[] = [];
  const schemaName = table.schema ?? 'dbo';
  if (table.comment) {
    stmts.push(
      `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${table.comment.replace(/'/g, "''")}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${table.name}';`,
    );
  }
  for (const col of table.columns) {
    if (col.comment) {
      stmts.push(
        `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${col.comment.replace(/'/g, "''")}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${table.name}', @level2type=N'COLUMN', @level2name=N'${col.name}';`,
      );
    }
  }
  return stmts;
}

export function alterTableFkSql(
  table: Table,
  dialect: Dialect,
  allTables: Table[],
  opts: DDLExportOptions,
): string[] {
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const ind = getIndent(opts.indent);
  const result: string[] = [];
  for (const fk of table.foreignKeys) {
    const refTable = allTables.find((t) => t.id === fk.referencedTableId);
    if (!refTable) continue;

    const srcCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id));
    const refCols = fk.referencedColumnIds.map((id) => refTable.columns.find((c) => c.id === id));
    if (srcCols.some((c) => !c) || refCols.some((c) => !c)) continue;

    const constraintName = `fk_${table.name}_${srcCols.map((c) => c!.name).join('_')}`;
    const tq = qualifiedTableName(table, dialect, qs);
    const srcColSql = srcCols.map((c) => q(c!.name, qs)).join(', ');
    const refColSql = refCols.map((c) => q(c!.name, qs)).join(', ');
    const onUpdateClause = dialect === 'oracle' ? '' : ` ${kw('ON UPDATE', up)} ${kw(fk.onUpdate, up)}`;
    const sql =
      `${kw('ALTER TABLE', up)} ${tq}\n` +
      `${ind}${kw('ADD CONSTRAINT', up)} ${q(constraintName, qs)}\n` +
      `${ind}${kw('FOREIGN KEY', up)} (${srcColSql}) ${kw('REFERENCES', up)} ${qualifiedTableName(refTable, dialect, qs)} (${refColSql})\n` +
      `${ind}${kw('ON DELETE', up)} ${kw(fk.onDelete, up)}${onUpdateClause};`;
    result.push(sql);
  }
  return result;
}

export function exportDDL(schema: ERDSchema, dialect: Dialect, options?: Partial<DDLExportOptions>): string {
  const opts: DDLExportOptions = {
    ...DEFAULT_DDL_OPTIONS,
    quoteStyle: getDefaultQuoteStyle(dialect),
    ...options,
  };
  const sections: string[] = [];
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;

  const domains = schema.domains ?? [];

  // CREATE SCHEMA statements (PostgreSQL/MSSQL/H2 only — not SQLite/Oracle)
  if (dialect === 'postgresql' || dialect === 'mssql' || dialect === 'h2') {
    const schemaNames = [...new Set(schema.tables.map((t) => t.schema).filter(Boolean))] as string[];
    for (const sn of schemaNames) {
      if (dialect === 'postgresql' && sn === 'public') continue;
      if (dialect === 'postgresql' || dialect === 'h2') {
        sections.push(`${kw('CREATE SCHEMA IF NOT EXISTS', up)} ${q(sn, qs)};`);
      } else {
        sections.push(`IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '${sn}') EXEC('CREATE SCHEMA ${sn}');`);
      }
    }
  }

  // PostgreSQL: CREATE TYPE ... AS ENUM for ENUM columns
  if (dialect === 'postgresql') {
    for (const table of schema.tables) {
      for (const col of table.columns) {
        if (col.type === 'ENUM' && col.enumValues?.length) {
          const enumName = `${table.name}_${col.name}_enum`;
          const values = col.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
          sections.push(`${kw('CREATE TYPE', up)} ${q(enumName, qs)} ${kw('AS ENUM', up)} (${values});`);
        }
      }
    }
  }

  // CREATE TABLE statements
  for (const table of schema.tables) {
    sections.push(createTableSql(table, dialect, opts, domains));
  }

  // COMMENT ON statements (PostgreSQL, Oracle, H2)
  if (opts.includeComments && (dialect === 'postgresql' || dialect === 'oracle' || dialect === 'h2')) {
    for (const table of schema.tables) {
      sections.push(...commentOnStatements(table, dialect, opts));
    }
  }

  // MSSQL extended properties for comments
  if (opts.includeComments && dialect === 'mssql') {
    for (const table of schema.tables) {
      sections.push(...mssqlComments(table));
    }
  }

  // CREATE INDEX statements
  if (opts.includeIndexes) {
    for (const table of schema.tables) {
      for (const idx of table.indexes ?? []) {
        const colNames = idx.columnIds
          .map((id) => table.columns.find((c) => c.id === id))
          .filter((c) => c != null)
          .map((c) => q(c.name, opts.quoteStyle));
        if (colNames.length === 0) continue;
        const uniqueKw = idx.unique ? `${kw('UNIQUE', opts.upperCaseKeywords)} ` : '';
        const idxName = idx.name || `idx_${table.name}_${idx.columnIds.map((id) => table.columns.find((c) => c.id === id)?.name ?? '').join('_')}`;
        sections.push(
          `${kw('CREATE', opts.upperCaseKeywords)} ${uniqueKw}${kw('INDEX', opts.upperCaseKeywords)} ${q(idxName, opts.quoteStyle)} ${kw('ON', opts.upperCaseKeywords)} ${qualifiedTableName(table, dialect, opts.quoteStyle)} (${colNames.join(', ')});`,
        );
      }
    }
  }

  // ALTER TABLE FK statements
  if (opts.includeForeignKeys) {
    const fkStatements: string[] = [];
    for (const table of schema.tables) {
      fkStatements.push(...alterTableFkSql(table, dialect, schema.tables, opts));
    }
    if (fkStatements.length > 0) {
      sections.push(...fkStatements);
    }
  }

  // DB Objects — use explicit IDs if provided, otherwise fall back to includeInDdl flag
  const dbObjectIdSet = opts.dbObjectIds ? new Set(opts.dbObjectIds) : null;
  const dbObjects = (schema.dbObjects ?? []).filter((o) =>
    o.sql.trim() && (dbObjectIdSet ? dbObjectIdSet.has(o.id) : o.includeInDdl)
  );
  if (dbObjects.length > 0) {
    const categories = schema.dbObjectCategories ?? [];
    const sorted = [...dbObjects].sort((a, b) => {
      const ai = categories.indexOf(a.category);
      const bi = categories.indexOf(b.category);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    let lastCategory = '';
    for (const obj of sorted) {
      if (obj.category !== lastCategory) {
        sections.push(`-- ${obj.category}`);
        lastCategory = obj.category;
      }
      sections.push(obj.sql.trim());
    }
  }

  return sections.join('\n\n');
}

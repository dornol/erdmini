import type { Column, ColumnDomain, Dialect, ERDSchema, Table } from '$lib/types/erd';

export interface DDLExportOptions {
  indent: '2spaces' | '4spaces' | 'tab';
  quoteStyle: 'none' | 'backtick' | 'double' | 'bracket';
  includeComments: boolean;
  includeIndexes: boolean;
  includeForeignKeys: boolean;
  includeDomains: boolean;
  upperCaseKeywords: boolean;
}

export function getDefaultQuoteStyle(dialect: Dialect): DDLExportOptions['quoteStyle'] {
  if (dialect === 'mysql' || dialect === 'mariadb') return 'backtick';
  if (dialect === 'mssql') return 'bracket';
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

function getIndent(indent: DDLExportOptions['indent']): string {
  if (indent === '4spaces') return '    ';
  if (indent === 'tab') return '\t';
  return '  ';
}

function q(name: string, style: DDLExportOptions['quoteStyle']): string {
  if (style === 'none') return name;
  if (style === 'backtick') return `\`${name}\``;
  if (style === 'bracket') return `[${name}]`;
  return `"${name}"`; // double
}

function kw(keyword: string, upper: boolean): string {
  return upper ? keyword.toUpperCase() : keyword.toLowerCase();
}

function columnTypeSql(col: Column, dialect: Dialect, upper: boolean): string {
  const len = col.length ? `(${col.length})` : '';
  const decimalLen = col.length
    ? `(${col.length}${col.scale != null ? `,${col.scale}` : ''})`
    : '';

  const enumList = col.enumValues?.length ? `(${col.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})` : '';

  if (dialect === 'mysql' || dialect === 'mariadb') {
    if (col.autoIncrement && (col.type === 'BIGINT' || col.type === 'INT')) return kw(col.type, upper);
    if (col.type === 'ENUM') return `${kw('ENUM', upper)}${enumList || "('value')"}`;
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${kw(col.type, upper)}${len || '(255)'}`;
    if (col.type === 'DECIMAL') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
    if (col.type === 'UUID') return `${kw('CHAR', upper)}(36)`;
    return kw(col.type, upper);
  }

  if (dialect === 'postgresql') {
    if (col.autoIncrement) return kw(col.type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL', upper);
    if (col.type === 'ENUM') return `${kw('VARCHAR', upper)}(255)`;
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${kw(col.type, upper)}${len || '(255)'}`;
    if (col.type === 'DATETIME') return kw('TIMESTAMP', upper);
    if (col.type === 'DECIMAL') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
    return kw(col.type, upper);
  }

  // MSSQL
  if (col.type === 'ENUM') return `${kw('NVARCHAR', upper)}(255)`;
  if (col.type === 'BOOLEAN') return kw('BIT', upper);
  if (col.type === 'TEXT') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'VARCHAR') return `${kw('NVARCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'CHAR') return `${kw('NCHAR', upper)}${len || '(255)'}`;
  if (col.type === 'DATETIME' || col.type === 'TIMESTAMP') return kw('DATETIME2', upper);
  if (col.type === 'DECIMAL') return `${kw('DECIMAL', upper)}${decimalLen || '(10,2)'}`;
  if (col.type === 'DOUBLE') return kw('FLOAT', upper);
  if (col.type === 'JSON') return `${kw('NVARCHAR', upper)}(MAX)`;
  if (col.type === 'UUID') return kw('UNIQUEIDENTIFIER', upper);
  return kw(col.type, upper);
}

function columnSql(col: Column, dialect: Dialect, opts: DDLExportOptions, domains?: ColumnDomain[]): string {
  const ind = getIndent(opts.indent);
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const parts: string[] = [];
  parts.push(`${ind}${q(col.name, qs)} ${columnTypeSql(col, dialect, up)}`);

  // MSSQL: IDENTITY instead of AUTO_INCREMENT
  if (col.autoIncrement && dialect === 'mssql') {
    parts.push('IDENTITY(1,1)');
  }

  if (!col.nullable) parts.push(kw('NOT NULL', up));

  if (col.autoIncrement && (dialect === 'mysql' || dialect === 'mariadb')) {
    parts.push(kw('AUTO_INCREMENT', up));
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

function qualifiedTableName(table: Table, dialect: Dialect, qs: DDLExportOptions['quoteStyle']): string {
  if (table.schema) {
    return `${q(table.schema, qs)}.${q(table.name, qs)}`;
  }
  return q(table.name, qs);
}

function createTableSql(table: Table, dialect: Dialect, opts: DDLExportOptions, domains?: ColumnDomain[]): string {
  const ind = getIndent(opts.indent);
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const lines: string[] = [];
  const tq = qualifiedTableName(table, dialect, qs);

  for (const col of table.columns) {
    lines.push(columnSql(col, dialect, opts, domains));
  }

  const pkCols = table.columns.filter((c) => c.primaryKey);
  if (pkCols.length > 0) {
    lines.push(`${ind}${kw('PRIMARY KEY', up)} (${pkCols.map((c) => q(c.name, qs)).join(', ')})`);
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

  return `${kw('CREATE TABLE', up)} ${tq} (\n${lines.join(',\n')}\n${trailer}`;
}

function postgresComments(table: Table, opts: DDLExportOptions): string[] {
  const stmts: string[] = [];
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const tq = qualifiedTableName(table, 'postgresql', qs);
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
  if (table.comment) {
    stmts.push(
      `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${table.comment.replace(/'/g, "''")}', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'${table.name}';`,
    );
  }
  for (const col of table.columns) {
    if (col.comment) {
      stmts.push(
        `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${col.comment.replace(/'/g, "''")}', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'${table.name}', @level2type=N'COLUMN', @level2name=N'${col.name}';`,
      );
    }
  }
  return stmts;
}

function alterTableFkSql(
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
    const sql =
      `${kw('ALTER TABLE', up)} ${tq}\n` +
      `${ind}${kw('ADD CONSTRAINT', up)} ${q(constraintName, qs)}\n` +
      `${ind}${kw('FOREIGN KEY', up)} (${srcColSql}) ${kw('REFERENCES', up)} ${qualifiedTableName(refTable, dialect, qs)} (${refColSql})\n` +
      `${ind}${kw('ON DELETE', up)} ${kw(fk.onDelete, up)} ${kw('ON UPDATE', up)} ${kw(fk.onUpdate, up)};`;
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

  // CREATE SCHEMA statements (PostgreSQL/MSSQL only, skip 'public' for PostgreSQL)
  if (dialect === 'postgresql' || dialect === 'mssql') {
    const schemaNames = [...new Set(schema.tables.map((t) => t.schema).filter(Boolean))] as string[];
    for (const sn of schemaNames) {
      if (dialect === 'postgresql' && sn === 'public') continue;
      if (dialect === 'postgresql') {
        sections.push(`${kw('CREATE SCHEMA IF NOT EXISTS', up)} ${q(sn, qs)};`);
      } else {
        sections.push(`IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '${sn}') EXEC('CREATE SCHEMA ${sn}');`);
      }
    }
  }

  // CREATE TABLE statements
  for (const table of schema.tables) {
    sections.push(createTableSql(table, dialect, opts, domains));
  }

  // PostgreSQL COMMENT ON statements
  if (opts.includeComments && dialect === 'postgresql') {
    for (const table of schema.tables) {
      sections.push(...postgresComments(table, opts));
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

  return sections.join('\n\n');
}

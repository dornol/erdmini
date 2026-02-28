import type { Column, Dialect, ERDSchema, Table } from '$lib/types/erd';

function q(name: string, dialect: Dialect): string {
  if (dialect === 'mssql') return `[${name}]`;
  if (dialect === 'mysql' || dialect === 'mariadb') return `\`${name}\``;
  return `"${name}"`; // postgresql
}

function columnTypeSql(col: Column, dialect: Dialect): string {
  const len = col.length ? `(${col.length})` : '';

  if (dialect === 'mysql' || dialect === 'mariadb') {
    if (col.autoIncrement && (col.type === 'BIGINT' || col.type === 'INT')) return col.type;
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${col.type}${len || '(255)'}`;
    if (col.type === 'DECIMAL') return `DECIMAL${len || '(10,2)'}`;
    if (col.type === 'UUID') return 'CHAR(36)';
    return col.type;
  }

  if (dialect === 'postgresql') {
    if (col.autoIncrement) return col.type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${col.type}${len || '(255)'}`;
    if (col.type === 'DATETIME') return 'TIMESTAMP';
    if (col.type === 'DECIMAL') return `DECIMAL${len || '(10,2)'}`;
    return col.type;
  }

  // MSSQL
  if (col.type === 'BOOLEAN') return 'BIT';
  if (col.type === 'TEXT') return 'NVARCHAR(MAX)';
  if (col.type === 'VARCHAR') return `NVARCHAR${len || '(255)'}`;
  if (col.type === 'CHAR') return `NCHAR${len || '(255)'}`;
  if (col.type === 'DATETIME' || col.type === 'TIMESTAMP') return 'DATETIME2';
  if (col.type === 'DECIMAL') return `DECIMAL${len || '(10,2)'}`;
  if (col.type === 'DOUBLE') return 'FLOAT';
  if (col.type === 'JSON') return 'NVARCHAR(MAX)';
  if (col.type === 'UUID') return 'UNIQUEIDENTIFIER';
  return col.type;
}

function columnSql(col: Column, dialect: Dialect): string {
  const parts: string[] = [];
  parts.push(`  ${q(col.name, dialect)} ${columnTypeSql(col, dialect)}`);

  // MSSQL: IDENTITY instead of AUTO_INCREMENT
  if (col.autoIncrement && dialect === 'mssql') {
    parts.push('IDENTITY(1,1)');
  }

  if (!col.nullable) parts.push('NOT NULL');

  if (col.autoIncrement && (dialect === 'mysql' || dialect === 'mariadb')) {
    parts.push('AUTO_INCREMENT');
  }

  if (col.defaultValue !== undefined && col.defaultValue !== '') {
    if (dialect === 'mssql') {
      parts.push(`DEFAULT (${col.defaultValue})`);
    } else {
      parts.push(`DEFAULT ${col.defaultValue}`);
    }
  }

  if (col.comment && (dialect === 'mysql' || dialect === 'mariadb')) {
    parts.push(`COMMENT '${col.comment.replace(/'/g, "''")}'`);
  }

  return parts.join(' ');
}

function createTableSql(table: Table, dialect: Dialect): string {
  const lines: string[] = [];
  const tq = q(table.name, dialect);

  for (const col of table.columns) {
    lines.push(columnSql(col, dialect));
  }

  const pkCols = table.columns.filter((c) => c.primaryKey);
  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.map((c) => q(c.name, dialect)).join(', ')})`);
  }

  const uqCols = table.columns.filter((c) => c.unique && !c.primaryKey);
  for (const col of uqCols) {
    lines.push(`  UNIQUE (${q(col.name, dialect)})`);
  }

  let trailer: string;
  if (dialect === 'mysql' || dialect === 'mariadb') {
    const comment = table.comment
      ? ` COMMENT='${table.comment.replace(/'/g, "''")}'`
      : '';
    trailer = `) ENGINE=InnoDB${comment};`;
  } else {
    trailer = ');';
  }

  return `CREATE TABLE ${tq} (\n${lines.join(',\n')}\n${trailer}`;
}

function postgresComments(table: Table): string[] {
  const stmts: string[] = [];
  const tq = `"${table.name}"`;
  if (table.comment) {
    stmts.push(`COMMENT ON TABLE ${tq} IS '${table.comment.replace(/'/g, "''")}';`);
  }
  for (const col of table.columns) {
    if (col.comment) {
      stmts.push(
        `COMMENT ON COLUMN ${tq}."${col.name}" IS '${col.comment.replace(/'/g, "''")}';`,
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
): string[] {
  const result: string[] = [];
  for (const fk of table.foreignKeys) {
    const refTable = allTables.find((t) => t.id === fk.referencedTableId);
    if (!refTable) continue;

    const srcCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id));
    const refCols = fk.referencedColumnIds.map((id) => refTable.columns.find((c) => c.id === id));
    if (srcCols.some((c) => !c) || refCols.some((c) => !c)) continue;

    const constraintName = `fk_${table.name}_${srcCols.map((c) => c!.name).join('_')}`;
    const tq = q(table.name, dialect);
    const srcColSql = srcCols.map((c) => q(c!.name, dialect)).join(', ');
    const refColSql = refCols.map((c) => q(c!.name, dialect)).join(', ');
    const sql =
      `ALTER TABLE ${tq}\n` +
      `  ADD CONSTRAINT ${q(constraintName, dialect)}\n` +
      `  FOREIGN KEY (${srcColSql}) REFERENCES ${q(refTable.name, dialect)} (${refColSql})\n` +
      `  ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate};`;
    result.push(sql);
  }
  return result;
}

export function exportDDL(schema: ERDSchema, dialect: Dialect): string {
  const sections: string[] = [];

  // CREATE TABLE statements
  for (const table of schema.tables) {
    sections.push(createTableSql(table, dialect));
  }

  // PostgreSQL COMMENT ON statements
  if (dialect === 'postgresql') {
    for (const table of schema.tables) {
      sections.push(...postgresComments(table));
    }
  }

  // MSSQL extended properties for comments
  if (dialect === 'mssql') {
    for (const table of schema.tables) {
      sections.push(...mssqlComments(table));
    }
  }

  // ALTER TABLE FK statements
  const fkStatements: string[] = [];
  for (const table of schema.tables) {
    fkStatements.push(...alterTableFkSql(table, dialect, schema.tables));
  }
  if (fkStatements.length > 0) {
    sections.push(...fkStatements);
  }

  return sections.join('\n\n');
}

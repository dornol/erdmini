import type { Column, ERDSchema, Table } from '$lib/types/erd';

export type Dialect = 'mysql' | 'postgresql';

function q(name: string, dialect: Dialect): string {
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

function columnTypeSql(col: Column, dialect: Dialect): string {
  const len = col.length ? `(${col.length})` : '';
  if (dialect === 'mysql') {
    if (col.autoIncrement && col.type === 'BIGINT') return 'BIGINT';
    if (col.autoIncrement && col.type === 'INT') return 'INT';
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${col.type}${len || '(255)'}`;
    if (col.type === 'DECIMAL') return `DECIMAL${len || '(10,2)'}`;
    return col.type;
  } else {
    // PostgreSQL
    if (col.autoIncrement) {
      return col.type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    }
    if (col.type === 'VARCHAR' || col.type === 'CHAR') return `${col.type}${len || '(255)'}`;
    if (col.type === 'DATETIME') return 'TIMESTAMP';
    if (col.type === 'BOOLEAN') return 'BOOLEAN';
    if (col.type === 'DECIMAL') return `DECIMAL${len || '(10,2)'}`;
    return col.type;
  }
}

function columnSql(col: Column, dialect: Dialect): string {
  const parts: string[] = [];
  parts.push(`  ${q(col.name, dialect)} ${columnTypeSql(col, dialect)}`);
  if (!col.nullable) parts.push('NOT NULL');
  if (col.autoIncrement && dialect === 'mysql') parts.push('AUTO_INCREMENT');
  if (col.defaultValue !== undefined && col.defaultValue !== '') {
    parts.push(`DEFAULT ${col.defaultValue}`);
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

  const trailer = dialect === 'mysql' ? ') ENGINE=InnoDB;' : ');';
  return `CREATE TABLE ${tq} (\n${lines.join(',\n')}\n${trailer}`;
}

function alterTableFkSql(
  table: Table,
  dialect: Dialect,
  allTables: Table[],
): string[] {
  const result: string[] = [];
  for (const fk of table.foreignKeys) {
    const srcCol = table.columns.find((c) => c.id === fk.columnId);
    const refTable = allTables.find((t) => t.id === fk.referencedTableId);
    const refCol = refTable?.columns.find((c) => c.id === fk.referencedColumnId);
    if (!srcCol || !refTable || !refCol) continue;

    const constraintName = `fk_${table.name}_${srcCol.name}`;
    const tq = q(table.name, dialect);
    const sql =
      `ALTER TABLE ${tq}\n` +
      `  ADD CONSTRAINT ${q(constraintName, dialect)}\n` +
      `  FOREIGN KEY (${q(srcCol.name, dialect)}) REFERENCES ${q(refTable.name, dialect)} (${q(refCol.name, dialect)})\n` +
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

import type { Column, Dialect, Table } from '$lib/types/erd';
import type { SchemaDiff, TableDiff, ColumnDiff } from '$lib/utils/schema-diff';
import {
  q, kw, getIndent, columnTypeSql, qualifiedTableName, createTableSql,
  type DDLExportOptions, DEFAULT_DDL_OPTIONS, getDefaultQuoteStyle,
} from '$lib/utils/ddl-export';

export function generateMigrationSQL(
  diff: SchemaDiff,
  dialect: Dialect,
  options?: Partial<DDLExportOptions>,
  currTables?: Table[],
): string {
  const opts: DDLExportOptions = {
    ...DEFAULT_DDL_OPTIONS,
    quoteStyle: getDefaultQuoteStyle(dialect),
    ...options,
  };
  const sections: string[] = [];
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const ind = getIndent(opts.indent);

  const allTables = currTables ?? [];

  function resolveTable(tableId: string): Table | null {
    return allTables.find((t) => t.id === tableId)
      ?? diff.addedTables.find((t) => t.id === tableId)
      ?? diff.removedTables.find((t) => t.id === tableId)
      ?? null;
  }

  // Find the current table by tableDiff info
  function findCurrTable(td: TableDiff): Table | null {
    return allTables.find((t) => t.id === td.tableId) ?? null;
  }

  // ── 1. Drop FK constraints ──
  const dropFkLines: string[] = [];

  for (const td of diff.modifiedTables) {
    const table = findCurrTable(td);
    const tableName = td.prevName ?? td.tableName;
    for (const fk of td.removedFKs) {
      const srcCols = fk.columnIds.map((id) => {
        // Try current table columns, or look in removed table
        const col = table?.columns.find((c) => c.id === id);
        return col?.name ?? id;
      });
      const constraintName = `fk_${tableName}_${srcCols.join('_')}`;
      const tq = table ? qualifiedTableName({ ...table, name: tableName }, dialect, qs) : q(tableName, qs);
      if (dialect === 'mysql' || dialect === 'mariadb') {
        dropFkLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP FOREIGN KEY', up)} ${q(constraintName, qs)};`);
      } else {
        dropFkLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP CONSTRAINT', up)} ${q(constraintName, qs)};`);
      }
    }
  }

  // FKs from removed tables
  for (const table of diff.removedTables) {
    for (const fk of table.foreignKeys) {
      const srcCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id)?.name ?? id);
      const constraintName = `fk_${table.name}_${srcCols.join('_')}`;
      const tq = qualifiedTableName(table, dialect, qs);
      if (dialect === 'mysql' || dialect === 'mariadb') {
        dropFkLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP FOREIGN KEY', up)} ${q(constraintName, qs)};`);
      } else {
        dropFkLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP CONSTRAINT', up)} ${q(constraintName, qs)};`);
      }
    }
  }

  if (dropFkLines.length > 0) {
    sections.push(`-- Drop FK constraints\n${dropFkLines.join('\n')}`);
  }

  // ── 2. Drop indexes / unique keys ──
  const dropIdxLines: string[] = [];

  for (const td of diff.modifiedTables) {
    const table = findCurrTable(td);
    const tableName = td.prevName ?? td.tableName;
    const tq = table ? qualifiedTableName({ ...table, name: tableName }, dialect, qs) : q(tableName, qs);

    for (const idx of td.removedIndexes) {
      const idxName = idx.name || `idx_${tableName}_${idx.columnIds.join('_')}`;
      if (dialect === 'mysql' || dialect === 'mariadb') {
        dropIdxLines.push(`${kw('DROP INDEX', up)} ${q(idxName, qs)} ${kw('ON', up)} ${tq};`);
      } else {
        dropIdxLines.push(`${kw('DROP INDEX', up)} ${q(idxName, qs)};`);
      }
    }

    for (const uk of td.removedUniqueKeys) {
      const ukName = uk.name || `uq_${tableName}_${uk.columnIds.join('_')}`;
      if (dialect === 'mysql' || dialect === 'mariadb') {
        dropIdxLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP INDEX', up)} ${q(ukName, qs)};`);
      } else {
        dropIdxLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP CONSTRAINT', up)} ${q(ukName, qs)};`);
      }
    }
  }

  if (dropIdxLines.length > 0) {
    sections.push(`-- Drop indexes / unique keys\n${dropIdxLines.join('\n')}`);
  }

  // ── 3. DROP TABLE ──
  const dropTableLines: string[] = [];
  for (const table of diff.removedTables) {
    const tq = qualifiedTableName(table, dialect, qs);
    dropTableLines.push(`${kw('DROP TABLE', up)} ${tq};`);
  }
  if (dropTableLines.length > 0) {
    sections.push(`-- Drop tables\n${dropTableLines.join('\n')}`);
  }

  // ── 4. CREATE TABLE ──
  const createTableLines: string[] = [];
  for (const table of diff.addedTables) {
    createTableLines.push(createTableSql(table, dialect, opts));
  }
  if (createTableLines.length > 0) {
    sections.push(`-- Create tables\n${createTableLines.join('\n\n')}`);
  }

  // ── 5. RENAME TABLE ──
  const renameLines: string[] = [];
  for (const td of diff.modifiedTables) {
    if (!td.prevName) continue;
    const table = findCurrTable(td);
    const oldTq = table
      ? qualifiedTableName({ ...table, name: td.prevName }, dialect, qs)
      : q(td.prevName, qs);
    const newTq = table
      ? qualifiedTableName(table, dialect, qs)
      : q(td.tableName, qs);

    if (dialect === 'mysql' || dialect === 'mariadb') {
      renameLines.push(`${kw('RENAME TABLE', up)} ${oldTq} ${kw('TO', up)} ${newTq};`);
    } else if (dialect === 'oracle') {
      renameLines.push(`${kw('ALTER TABLE', up)} ${oldTq} ${kw('RENAME TO', up)} ${q(td.tableName, qs)};`);
    } else if (dialect === 'mssql') {
      renameLines.push(`EXEC sp_rename '${td.prevName}', '${td.tableName}';`);
    } else {
      renameLines.push(`${kw('ALTER TABLE', up)} ${oldTq} ${kw('RENAME TO', up)} ${q(td.tableName, qs)};`);
    }
  }
  if (renameLines.length > 0) {
    sections.push(`-- Rename tables\n${renameLines.join('\n')}`);
  }

  // ── 6. ADD COLUMN ──
  const addColLines: string[] = [];
  for (const td of diff.modifiedTables) {
    if (td.addedColumns.length === 0) continue;
    const table = findCurrTable(td);
    const tq = table ? qualifiedTableName(table, dialect, qs) : q(td.tableName, qs);

    for (const col of td.addedColumns) {
      const colDef = columnDefInline(col, dialect, opts, td.tableName);
      addColLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('ADD COLUMN', up)} ${colDef};`);
    }
  }
  if (addColLines.length > 0) {
    sections.push(`-- Add columns\n${addColLines.join('\n')}`);
  }

  // ── 7. DROP COLUMN ──
  const dropColLines: string[] = [];
  const sqliteRecreateTables: string[] = [];

  for (const td of diff.modifiedTables) {
    if (td.removedColumns.length === 0) continue;
    const table = findCurrTable(td);
    const tq = table ? qualifiedTableName(table, dialect, qs) : q(td.tableName, qs);

    if (dialect === 'sqlite') {
      // Recreate table pattern
      if (table) {
        sqliteRecreateTables.push(sqliteRecreateTable(table, dialect, opts));
      }
    } else {
      for (const col of td.removedColumns) {
        dropColLines.push(`${kw('ALTER TABLE', up)} ${tq} ${kw('DROP COLUMN', up)} ${q(col.name, qs)};`);
      }
    }
  }

  if (dropColLines.length > 0) {
    sections.push(`-- Drop columns\n${dropColLines.join('\n')}`);
  }
  if (sqliteRecreateTables.length > 0) {
    sections.push(`-- Drop columns (SQLite recreate-table)\n${sqliteRecreateTables.join('\n\n')}`);
  }

  // ── 8. ALTER COLUMN ──
  const alterColLines: string[] = [];
  const sqliteAlterRecreateTables: string[] = [];

  for (const td of diff.modifiedTables) {
    if (td.modifiedColumns.length === 0) continue;
    const table = findCurrTable(td);
    const tq = table ? qualifiedTableName(table, dialect, qs) : q(td.tableName, qs);

    if (dialect === 'sqlite') {
      // SQLite: recreate table for column modifications
      if (table && !sqliteRecreateTables.some(s => s.includes(td.tableName))) {
        sqliteAlterRecreateTables.push(sqliteRecreateTable(table, dialect, opts));
      }
    } else {
      for (const cd of td.modifiedColumns) {
        alterColLines.push(...alterColumnSql(cd, tq, dialect, opts, td.tableName));
      }
    }
  }

  if (alterColLines.length > 0) {
    sections.push(`-- Modify columns\n${alterColLines.join('\n')}`);
  }
  if (sqliteAlterRecreateTables.length > 0) {
    sections.push(`-- Modify columns (SQLite recreate-table)\n${sqliteAlterRecreateTables.join('\n\n')}`);
  }

  // ── 9. CREATE INDEX / ADD UNIQUE KEY ──
  const addIdxLines: string[] = [];

  for (const td of diff.modifiedTables) {
    const table = findCurrTable(td);
    const tq = table ? qualifiedTableName(table, dialect, qs) : q(td.tableName, qs);

    for (const idx of td.addedIndexes) {
      const colNames = idx.columnIds
        .map((id) => table?.columns.find((c) => c.id === id))
        .filter((c) => c != null)
        .map((c) => q(c.name, qs));
      if (colNames.length === 0) continue;
      const uniqueKw = idx.unique ? `${kw('UNIQUE', up)} ` : '';
      const idxName = idx.name || `idx_${td.tableName}_${idx.columnIds.map((id) => table?.columns.find((c) => c.id === id)?.name ?? '').join('_')}`;
      addIdxLines.push(
        `${kw('CREATE', up)} ${uniqueKw}${kw('INDEX', up)} ${q(idxName, qs)} ${kw('ON', up)} ${tq} (${colNames.join(', ')});`,
      );
    }

    for (const uk of td.addedUniqueKeys) {
      const colNames = uk.columnIds
        .map((id) => table?.columns.find((c) => c.id === id))
        .filter((c) => c != null)
        .map((c) => q(c.name, qs));
      if (colNames.length === 0) continue;
      const ukName = uk.name || `uq_${td.tableName}_${uk.columnIds.join('_')}`;
      addIdxLines.push(
        `${kw('ALTER TABLE', up)} ${tq} ${kw('ADD CONSTRAINT', up)} ${q(ukName, qs)} ${kw('UNIQUE', up)} (${colNames.join(', ')});`,
      );
    }
  }

  if (addIdxLines.length > 0) {
    sections.push(`-- Add indexes / unique keys\n${addIdxLines.join('\n')}`);
  }

  // ── 10. ADD FK constraints ──
  const addFkLines: string[] = [];

  for (const td of diff.modifiedTables) {
    if (td.addedFKs.length === 0) continue;
    const table = findCurrTable(td);
    if (!table) continue;

    for (const fk of td.addedFKs) {
      const refTable = resolveTable(fk.referencedTableId);
      if (!refTable) continue;

      const srcCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id));
      const refCols = fk.referencedColumnIds.map((id) => refTable.columns.find((c) => c.id === id));
      if (srcCols.some((c) => !c) || refCols.some((c) => !c)) continue;

      const constraintName = `fk_${td.tableName}_${srcCols.map((c) => c!.name).join('_')}`;
      const tq = qualifiedTableName(table, dialect, qs);
      const srcColSql = srcCols.map((c) => q(c!.name, qs)).join(', ');
      const refColSql = refCols.map((c) => q(c!.name, qs)).join(', ');
      const onUpdateClause = dialect === 'oracle' ? '' : ` ${kw('ON UPDATE', up)} ${kw(fk.onUpdate, up)}`;
      addFkLines.push(
        `${kw('ALTER TABLE', up)} ${tq}\n` +
        `${ind}${kw('ADD CONSTRAINT', up)} ${q(constraintName, qs)}\n` +
        `${ind}${kw('FOREIGN KEY', up)} (${srcColSql}) ${kw('REFERENCES', up)} ${qualifiedTableName(refTable, dialect, qs)} (${refColSql})\n` +
        `${ind}${kw('ON DELETE', up)} ${kw(fk.onDelete, up)}${onUpdateClause};`,
      );
    }
  }

  // FKs from added tables
  for (const table of diff.addedTables) {
    if (table.foreignKeys.length === 0) continue;
    for (const fk of table.foreignKeys) {
      const refTable = resolveTable(fk.referencedTableId);
      if (!refTable) continue;

      const srcCols = fk.columnIds.map((id) => table.columns.find((c) => c.id === id));
      const refCols = fk.referencedColumnIds.map((id) => refTable.columns.find((c) => c.id === id));
      if (srcCols.some((c) => !c) || refCols.some((c) => !c)) continue;

      const constraintName = `fk_${table.name}_${srcCols.map((c) => c!.name).join('_')}`;
      const tq = qualifiedTableName(table, dialect, qs);
      const srcColSql = srcCols.map((c) => q(c!.name, qs)).join(', ');
      const refColSql = refCols.map((c) => q(c!.name, qs)).join(', ');
      const onUpdateClause = dialect === 'oracle' ? '' : ` ${kw('ON UPDATE', up)} ${kw(fk.onUpdate, up)}`;
      addFkLines.push(
        `${kw('ALTER TABLE', up)} ${tq}\n` +
        `${ind}${kw('ADD CONSTRAINT', up)} ${q(constraintName, qs)}\n` +
        `${ind}${kw('FOREIGN KEY', up)} (${srcColSql}) ${kw('REFERENCES', up)} ${qualifiedTableName(refTable, dialect, qs)} (${refColSql})\n` +
        `${ind}${kw('ON DELETE', up)} ${kw(fk.onDelete, up)}${onUpdateClause};`,
      );
    }
  }

  if (addFkLines.length > 0) {
    sections.push(`-- Add FK constraints\n${addFkLines.join('\n\n')}`);
  }

  return sections.join('\n\n');
}

// ── Internal helpers ──

function columnDefInline(col: Column, dialect: Dialect, opts: DDLExportOptions, tableName: string): string {
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const parts: string[] = [];
  parts.push(`${q(col.name, qs)} ${columnTypeSql(col, dialect, up, tableName)}`);

  if (col.autoIncrement && dialect === 'mssql') {
    parts.push('IDENTITY(1,1)');
  }
  if (col.autoIncrement && dialect === 'oracle') {
    parts.push(kw('GENERATED ALWAYS AS IDENTITY', up));
  }
  if (!col.nullable) parts.push(kw('NOT NULL', up));
  if (col.autoIncrement && (dialect === 'mysql' || dialect === 'mariadb' || dialect === 'h2')) {
    parts.push(kw('AUTO_INCREMENT', up));
  }
  if (col.defaultValue !== undefined && col.defaultValue !== '') {
    if (dialect === 'mssql') {
      parts.push(`${kw('DEFAULT', up)} (${col.defaultValue})`);
    } else {
      parts.push(`${kw('DEFAULT', up)} ${col.defaultValue}`);
    }
  }

  return parts.join(' ');
}

function alterColumnSql(
  cd: ColumnDiff,
  tableQ: string,
  dialect: Dialect,
  opts: DDLExportOptions,
  tableName: string,
): string[] {
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const curr = cd.curr!;
  const prev = cd.prev!;
  const results: string[] = [];

  // Column rename
  if (prev.name !== curr.name) {
    if (dialect === 'mysql' || dialect === 'mariadb') {
      // RENAME COLUMN is supported in MySQL 8+
      results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('RENAME COLUMN', up)} ${q(prev.name, qs)} ${kw('TO', up)} ${q(curr.name, qs)};`);
    } else if (dialect === 'mssql') {
      results.push(`EXEC sp_rename '${tableName}.${prev.name}', '${curr.name}', 'COLUMN';`);
    } else {
      results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('RENAME COLUMN', up)} ${q(prev.name, qs)} ${kw('TO', up)} ${q(curr.name, qs)};`);
    }
  }

  const colName = q(curr.name, qs);

  // Type / nullable / default changes
  const typeChanged = prev.type !== curr.type || (prev.length ?? '') !== (curr.length ?? '') || (prev.scale ?? null) !== (curr.scale ?? null);
  const nullableChanged = prev.nullable !== curr.nullable;
  const defaultChanged = (prev.defaultValue ?? '') !== (curr.defaultValue ?? '');

  if (!typeChanged && !nullableChanged && !defaultChanged) return results;

  if (dialect === 'mysql' || dialect === 'mariadb') {
    // MODIFY COLUMN with full column definition
    const colDef = columnDefInline(curr, dialect, opts, tableName);
    results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('MODIFY COLUMN', up)} ${colDef};`);
  } else if (dialect === 'postgresql') {
    // Separate statements for type, nullable, default
    if (typeChanged) {
      results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${kw('TYPE', up)} ${columnTypeSql(curr, dialect, up, tableName)};`);
    }
    if (nullableChanged) {
      if (curr.nullable) {
        results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${kw('DROP NOT NULL', up)};`);
      } else {
        results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${kw('SET NOT NULL', up)};`);
      }
    }
    if (defaultChanged) {
      if (curr.defaultValue !== undefined && curr.defaultValue !== '') {
        results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${kw('SET DEFAULT', up)} ${curr.defaultValue};`);
      } else {
        results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${kw('DROP DEFAULT', up)};`);
      }
    }
  } else if (dialect === 'oracle') {
    const typePart = columnTypeSql(curr, dialect, up, tableName);
    const nullPart = nullableChanged ? (curr.nullable ? ` ${kw('NULL', up)}` : ` ${kw('NOT NULL', up)}`) : '';
    const defPart = defaultChanged
      ? (curr.defaultValue !== undefined && curr.defaultValue !== ''
        ? ` ${kw('DEFAULT', up)} ${curr.defaultValue}`
        : ` ${kw('DEFAULT', up)} ${kw('NULL', up)}`)
      : '';
    results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('MODIFY', up)} (${colName} ${typePart}${defPart}${nullPart});`);
  } else if (dialect === 'mssql') {
    const typePart = columnTypeSql(curr, dialect, up, tableName);
    const nullPart = curr.nullable ? ` ${kw('NULL', up)}` : ` ${kw('NOT NULL', up)}`;
    results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colName} ${typePart}${nullPart};`);
    if (defaultChanged) {
      if (curr.defaultValue !== undefined && curr.defaultValue !== '') {
        results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ADD', up)} ${kw('DEFAULT', up)} (${curr.defaultValue}) ${kw('FOR', up)} ${colName};`);
      }
    }
  } else if (dialect === 'h2') {
    const colDef = columnDefInline(curr, dialect, opts, tableName);
    results.push(`${kw('ALTER TABLE', up)} ${tableQ} ${kw('ALTER COLUMN', up)} ${colDef};`);
  }

  return results;
}

function sqliteRecreateTable(table: Table, dialect: Dialect, opts: DDLExportOptions): string {
  const qs = opts.quoteStyle;
  const up = opts.upperCaseKeywords;
  const tempName = `_temp_${table.name}`;
  const tq = q(table.name, qs);
  const tempTq = q(tempName, qs);
  const colNames = table.columns.map((c) => q(c.name, qs)).join(', ');

  const createSql = createTableSql({ ...table, name: tempName }, dialect, opts);

  return [
    `${kw('PRAGMA', up)} foreign_keys=off;`,
    `${kw('BEGIN TRANSACTION', up)};`,
    createSql,
    `${kw('INSERT INTO', up)} ${tempTq} (${colNames}) ${kw('SELECT', up)} ${colNames} ${kw('FROM', up)} ${tq};`,
    `${kw('DROP TABLE', up)} ${tq};`,
    `${kw('ALTER TABLE', up)} ${tempTq} ${kw('RENAME TO', up)} ${tq};`,
    `${kw('COMMIT', up)};`,
    `${kw('PRAGMA', up)} foreign_keys=on;`,
  ].join('\n');
}

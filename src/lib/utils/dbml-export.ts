import type { ERDSchema, Column, Table, ReferentialAction } from '$lib/types/erd';

export interface DBMLExportOptions {
  includeComments: boolean;
  includeForeignKeys: boolean;
  includeIndexes: boolean;
}

const DEFAULT_OPTIONS: DBMLExportOptions = {
  includeComments: true,
  includeForeignKeys: true,
  includeIndexes: true,
};

/** Map ERD ColumnType to DBML type string */
function toDbmlType(col: Column): string {
  const t = col.type;
  switch (t) {
    case 'INT': return col.length ? `int(${col.length})` : 'int';
    case 'BIGINT': return 'bigint';
    case 'SMALLINT': return 'smallint';
    case 'VARCHAR': return col.length ? `varchar(${col.length})` : 'varchar';
    case 'NVARCHAR': return col.length ? `nvarchar(${col.length})` : 'nvarchar';
    case 'CHAR': return col.length ? `char(${col.length})` : 'char';
    case 'NCHAR': return col.length ? `nchar(${col.length})` : 'nchar';
    case 'TEXT': return 'text';
    case 'NTEXT': return 'ntext';
    case 'BOOLEAN': return 'boolean';
    case 'DATE': return 'date';
    case 'DATETIME': return 'datetime';
    case 'TIMESTAMP': return 'timestamp';
    case 'DECIMAL':
      if (col.length && col.scale) return `decimal(${col.length},${col.scale})`;
      if (col.length) return `decimal(${col.length})`;
      return 'decimal';
    case 'FLOAT': return 'float';
    case 'DOUBLE': return 'double';
    case 'JSON': return 'json';
    case 'UUID': return 'uuid';
    case 'ENUM': return 'varchar'; // will use enum name if available
    default: return 'varchar';
  }
}

function formatRefAction(action: ReferentialAction): string {
  switch (action) {
    case 'CASCADE': return 'cascade';
    case 'SET NULL': return 'set null';
    case 'RESTRICT': return 'restrict';
    case 'NO ACTION': return 'no action';
    default: return 'no action';
  }
}

function qualifiedName(table: Table): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

export function exportDBML(
  schema: ERDSchema,
  options?: Partial<DBMLExportOptions>,
): string {
  const opts: DBMLExportOptions = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];
  const tableById = new Map<string, Table>();
  for (const t of schema.tables) tableById.set(t.id, t);

  // Collect ENUM types from columns
  const enumBlocks = new Map<string, string[]>(); // enumName → values
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.type === 'ENUM' && col.enumValues && col.enumValues.length > 0) {
        const enumName = `${col.name}_enum`;
        if (!enumBlocks.has(enumName)) {
          enumBlocks.set(enumName, col.enumValues);
        }
      }
    }
  }

  // Output enums
  for (const [name, values] of enumBlocks) {
    lines.push(`Enum ${name} {`);
    for (const v of values) {
      lines.push(`  ${v}`);
    }
    lines.push('}');
    lines.push('');
  }

  // Output tables
  for (const table of schema.tables) {
    const qName = qualifiedName(table);
    if (opts.includeComments && table.comment) {
      lines.push(`// ${table.comment}`);
    }
    lines.push(`Table ${qName} {`);

    for (const col of table.columns) {
      const settings: string[] = [];
      if (col.primaryKey) settings.push('pk');
      if (!col.nullable && !col.primaryKey) settings.push('not null');
      if (col.unique) settings.push('unique');
      if (col.autoIncrement) settings.push('increment');
      if (col.defaultValue !== undefined && col.defaultValue !== '') {
        const dv = col.defaultValue;
        // Quote non-numeric, non-keyword defaults
        if (/^\d+(\.\d+)?$/.test(dv) || /^(true|false|null)$/i.test(dv)) {
          settings.push(`default: ${dv}`);
        } else {
          settings.push(`default: '${dv.replace(/'/g, "\\'")}'`);
        }
      }
      if (opts.includeComments && col.comment) {
        settings.push(`note: '${col.comment.replace(/'/g, "\\'")}'`);
      }

      // Determine type
      let typeName: string;
      if (col.type === 'ENUM' && col.enumValues && col.enumValues.length > 0) {
        typeName = `${col.name}_enum`;
      } else {
        typeName = toDbmlType(col);
      }

      const settingsStr = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
      lines.push(`  ${col.name} ${typeName}${settingsStr}`);
    }

    // Indexes
    if (opts.includeIndexes) {
      const hasIndexes =
        (table.uniqueKeys && table.uniqueKeys.length > 0) ||
        (table.indexes && table.indexes.length > 0);
      if (hasIndexes) {
        lines.push('');
        lines.push('  Indexes {');

        for (const uk of table.uniqueKeys || []) {
          const colNames = uk.columnIds
            .map((id) => table.columns.find((c) => c.id === id)?.name)
            .filter(Boolean);
          if (colNames.length === 0) continue;

          const colStr = colNames.length === 1 ? colNames[0] : `(${colNames.join(', ')})`;
          const settings: string[] = ['unique'];
          if (uk.name) settings.push(`name: '${uk.name}'`);
          lines.push(`    ${colStr} [${settings.join(', ')}]`);
        }

        for (const idx of table.indexes || []) {
          const colNames = idx.columnIds
            .map((id) => table.columns.find((c) => c.id === id)?.name)
            .filter(Boolean);
          if (colNames.length === 0) continue;

          const colStr = colNames.length === 1 ? colNames[0] : `(${colNames.join(', ')})`;
          const settings: string[] = [];
          if (idx.unique) settings.push('unique');
          if (idx.name) settings.push(`name: '${idx.name}'`);
          if (settings.length > 0) {
            lines.push(`    ${colStr} [${settings.join(', ')}]`);
          } else {
            lines.push(`    ${colStr}`);
          }
        }

        lines.push('  }');
      }
    }

    lines.push('}');
    lines.push('');
  }

  // Output Ref statements
  if (opts.includeForeignKeys) {
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        const refTable = tableById.get(fk.referencedTableId);
        if (!refTable) continue;

        const fromCols = fk.columnIds
          .map((id) => table.columns.find((c) => c.id === id)?.name)
          .filter(Boolean);
        const toCols = fk.referencedColumnIds
          .map((id) => refTable.columns.find((c) => c.id === id)?.name)
          .filter(Boolean);

        if (fromCols.length === 0 || toCols.length === 0) continue;

        const fromStr = fromCols.length === 1
          ? `${qualifiedName(table)}.${fromCols[0]}`
          : `${qualifiedName(table)}.(${fromCols.join(', ')})`;
        const toStr = toCols.length === 1
          ? `${qualifiedName(refTable)}.${toCols[0]}`
          : `${qualifiedName(refTable)}.(${toCols.join(', ')})`;

        const settings: string[] = [];
        if (fk.onDelete !== 'NO ACTION') settings.push(`delete: ${formatRefAction(fk.onDelete)}`);
        if (fk.onUpdate !== 'NO ACTION') settings.push(`update: ${formatRefAction(fk.onUpdate)}`);

        const settingsStr = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
        lines.push(`Ref: ${fromStr} > ${toStr}${settingsStr}`);
      }
    }
  }

  return lines.join('\n').trim() + '\n';
}

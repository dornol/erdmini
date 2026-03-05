import type { Column, ColumnType, ERDSchema, ForeignKey, Table } from '$lib/types/erd';

export interface PrismaExportOptions {
  includeComments: boolean;
  includeForeignKeys: boolean;
  includeIndexes: boolean;
}

const DEFAULT_OPTIONS: PrismaExportOptions = {
  includeComments: true,
  includeForeignKeys: true,
  includeIndexes: true,
};

// ERD ColumnType → Prisma type + optional @db.* hint
interface PrismaTypeInfo {
  prismaType: string;
  nativeHint?: string;
}

function mapColumnType(col: Column): PrismaTypeInfo {
  const t = col.type;
  switch (t) {
    case 'INT': return { prismaType: 'Int' };
    case 'BIGINT': return { prismaType: 'BigInt' };
    case 'SMALLINT': return { prismaType: 'Int', nativeHint: '@db.SmallInt' };
    case 'VARCHAR':
      if (col.length && col.length !== 255) return { prismaType: 'String', nativeHint: `@db.VarChar(${col.length})` };
      return { prismaType: 'String' };
    case 'CHAR':
      return { prismaType: 'String', nativeHint: `@db.Char(${col.length || 255})` };
    case 'TEXT': return { prismaType: 'String', nativeHint: '@db.Text' };
    case 'BOOLEAN': return { prismaType: 'Boolean' };
    case 'DATE': return { prismaType: 'DateTime', nativeHint: '@db.Date' };
    case 'DATETIME': return { prismaType: 'DateTime' };
    case 'TIMESTAMP': return { prismaType: 'DateTime', nativeHint: '@db.Timestamp' };
    case 'DECIMAL': {
      const p = col.length || 10;
      const s = col.scale ?? 2;
      return { prismaType: 'Decimal', nativeHint: `@db.Decimal(${p}, ${s})` };
    }
    case 'FLOAT': return { prismaType: 'Float' };
    case 'DOUBLE': return { prismaType: 'Float', nativeHint: '@db.DoublePrecision' };
    case 'JSON': return { prismaType: 'Json' };
    case 'UUID': return { prismaType: 'String', nativeHint: '@db.Uuid' };
    case 'ENUM': return { prismaType: '__ENUM__' };
    default: return { prismaType: 'String' };
  }
}

function toPascalCase(name: string): string {
  return name
    .replace(/[_-]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function defaultValueToPrisma(col: Column): string | undefined {
  if (col.autoIncrement) return '@default(autoincrement())';
  if (!col.defaultValue) return undefined;

  const dv = col.defaultValue;
  const upper = dv.toUpperCase().trim();
  if (upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') return '@default(now())';
  if (upper === 'UUID()' || upper === 'GEN_RANDOM_UUID()') return '@default(uuid())';
  if (upper === 'CUID()') return '@default(cuid())';

  // Boolean defaults
  if (col.type === 'BOOLEAN') {
    if (upper === 'TRUE' || upper === '1') return '@default(true)';
    if (upper === 'FALSE' || upper === '0') return '@default(false)';
  }

  // Numeric defaults
  if (['INT', 'BIGINT', 'SMALLINT', 'FLOAT', 'DOUBLE', 'DECIMAL'].includes(col.type)) {
    const num = Number(dv);
    if (!isNaN(num)) return `@default(${dv})`;
  }

  // String defaults — quote them
  if (['VARCHAR', 'CHAR', 'TEXT', 'UUID'].includes(col.type)) {
    const unquoted = dv.replace(/^['"]|['"]$/g, '');
    return `@default("${unquoted.replace(/"/g, '\\"')}")`;
  }

  // Enum defaults — unquoted
  if (col.type === 'ENUM') {
    const unquoted = dv.replace(/^['"]|['"]$/g, '');
    return `@default(${unquoted})`;
  }

  return `@default(${dv})`;
}

function refActionToPrisma(action: string): string | undefined {
  switch (action) {
    case 'CASCADE': return 'Cascade';
    case 'SET NULL': return 'SetNull';
    case 'RESTRICT': return 'Restrict';
    case 'NO ACTION': return 'NoAction';
    default: return undefined;
  }
}

// Generate a unique enum name from table + column
function enumName(tableName: string, colName: string): string {
  return toPascalCase(tableName) + toPascalCase(colName);
}

export function exportPrisma(schema: ERDSchema, options?: Partial<PrismaExportOptions>): string {
  const opts: PrismaExportOptions = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = [];

  // Collect all enums from columns
  const enumBlocks = new Map<string, string[]>(); // enumName → values
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.type === 'ENUM' && col.enumValues?.length) {
        const eName = enumName(table.name, col.name);
        if (!enumBlocks.has(eName)) {
          enumBlocks.set(eName, col.enumValues);
        }
      }
    }
  }

  // Emit enum blocks
  for (const [name, values] of enumBlocks) {
    const lines = [`enum ${name} {`];
    for (const v of values) {
      lines.push(`  ${v}`);
    }
    lines.push('}');
    sections.push(lines.join('\n'));
  }

  // Build FK lookup: for each table, which tables reference it (for back-relations)
  interface FkInfo {
    fk: ForeignKey;
    srcTable: Table;
    refTable: Table;
  }
  const allFks: FkInfo[] = [];
  if (opts.includeForeignKeys) {
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        const refTable = schema.tables.find(t => t.id === fk.referencedTableId);
        if (refTable) {
          allFks.push({ fk, srcTable: table, refTable });
        }
      }
    }
  }

  // Count FKs per (srcTable, refTable) pair for relation naming
  const fkCountMap = new Map<string, number>();
  for (const { srcTable, refTable } of allFks) {
    const key = `${srcTable.id}→${refTable.id}`;
    fkCountMap.set(key, (fkCountMap.get(key) || 0) + 1);
  }

  // Track emitted relation names per pair
  const emittedRelNames = new Map<string, number>();

  for (const table of schema.tables) {
    const lines: string[] = [];

    // Table comment
    if (opts.includeComments && table.comment) {
      for (const line of table.comment.split('\n')) {
        lines.push(`/// ${line}`);
      }
    }

    const modelName = toPascalCase(table.name);
    lines.push(`model ${modelName} {`);

    // Check if table name differs from PascalCase model name
    const needsMapTable = modelName !== table.name;

    // Detect composite PK (>1 PK columns → use @@id, not @id)
    const pkCols = table.columns.filter(c => c.primaryKey);
    const isCompositePk = pkCols.length > 1;

    // Columns
    for (const col of table.columns) {
      // Column comment
      if (opts.includeComments && col.comment) {
        lines.push(`  /// ${col.comment}`);
      }

      const typeInfo = mapColumnType(col);
      let prismaType = typeInfo.prismaType;

      // Handle ENUM — reference generated enum name
      if (prismaType === '__ENUM__') {
        prismaType = enumName(table.name, col.name);
      }

      // Optional suffix
      const typeSuffix = col.nullable ? '?' : '';
      const attrs: string[] = [];

      // @id (only for single-column PK)
      if (col.primaryKey && !isCompositePk) attrs.push('@id');

      // @unique
      if (col.unique && !col.primaryKey) attrs.push('@unique');

      // @default
      const defStr = defaultValueToPrisma(col);
      if (defStr) attrs.push(defStr);

      // @map if column name differs from field name (non-camelCase)
      // We keep column names as-is (no camelCase conversion)

      // @db.* native type hint
      if (typeInfo.nativeHint) attrs.push(typeInfo.nativeHint);

      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      lines.push(`  ${col.name} ${prismaType}${typeSuffix}${attrStr}`);
    }

    // Relation fields for FKs originating from this table
    if (opts.includeForeignKeys) {
      const tableFks = allFks.filter(f => f.srcTable.id === table.id);
      for (const { fk, refTable } of tableFks) {
        const srcCols = fk.columnIds
          .map(id => table.columns.find(c => c.id === id))
          .filter((c): c is Column => !!c);
        const refCols = fk.referencedColumnIds
          .map(id => refTable.columns.find(c => c.id === id))
          .filter((c): c is Column => !!c);

        if (srcCols.length === 0 || refCols.length === 0) continue;

        const refModelName = toPascalCase(refTable.name);
        const fieldName = toCamelCase(refTable.name);

        // Relation name if there are multiple FKs to the same target
        const pairKey = `${table.id}→${refTable.id}`;
        const pairCount = fkCountMap.get(pairKey) || 1;
        let relName = '';
        if (pairCount > 1) {
          const idx = emittedRelNames.get(pairKey) || 0;
          emittedRelNames.set(pairKey, idx + 1);
          relName = `"${refModelName}_${srcCols.map(c => c.name).join('_')}"`;
        }

        const fieldsStr = srcCols.map(c => c.name).join(', ');
        const refsStr = refCols.map(c => c.name).join(', ');

        const relParts = [
          relName ? `name: ${relName}, ` : '',
          `fields: [${fieldsStr}], references: [${refsStr}]`,
        ];

        const onDel = refActionToPrisma(fk.onDelete);
        const onUpd = refActionToPrisma(fk.onUpdate);
        if (onDel && onDel !== 'Restrict') relParts.push(`, onDelete: ${onDel}`);
        if (onUpd && onUpd !== 'Restrict') relParts.push(`, onUpdate: ${onUpd}`);

        lines.push(`  ${fieldName} ${refModelName} @relation(${relParts.join('')})`);
      }

      // Back-relation fields: other tables referencing this one
      const incomingFks = allFks.filter(f => f.refTable.id === table.id);
      // Group by source table
      const incomingByTable = new Map<string, FkInfo[]>();
      for (const fkInfo of incomingFks) {
        const arr = incomingByTable.get(fkInfo.srcTable.id) || [];
        arr.push(fkInfo);
        incomingByTable.set(fkInfo.srcTable.id, arr);
      }

      for (const [, fkInfos] of incomingByTable) {
        const srcTable = fkInfos[0].srcTable;
        const srcModelName = toPascalCase(srcTable.name);
        const backFieldName = toCamelCase(srcTable.name) + 's';

        if (fkInfos.length === 1) {
          lines.push(`  ${backFieldName} ${srcModelName}[]`);
        } else {
          // Multiple FKs from same source table — need relation names
          for (const { fk } of fkInfos) {
            const srcCols = fk.columnIds
              .map(id => srcTable.columns.find(c => c.id === id))
              .filter((c): c is Column => !!c);
            const relName = `${srcModelName}_${srcCols.map(c => c.name).join('_')}`;
            const fieldSuffix = srcCols.map(c => toPascalCase(c.name)).join('');
            lines.push(`  ${backFieldName}By${fieldSuffix} ${srcModelName}[] @relation("${relName}")`);
          }
        }
      }
    }

    // Composite PK (@@id)
    if (isCompositePk) {
      lines.push(`  @@id([${pkCols.map(c => c.name).join(', ')}])`);
    }

    // No PK warning
    if (pkCols.length === 0) {
      lines.push('  // WARNING: No primary key defined. Prisma requires @id or @@id.');
    }

    // Composite unique keys (@@unique)
    if (table.uniqueKeys) {
      for (const uk of table.uniqueKeys) {
        const ukColNames = uk.columnIds
          .map(id => table.columns.find(c => c.id === id))
          .filter((c): c is Column => !!c)
          .map(c => c.name);
        if (ukColNames.length < 2) continue;
        lines.push(`  @@unique([${ukColNames.join(', ')}])`);
      }
    }

    // Indexes (@@index)
    if (opts.includeIndexes && table.indexes) {
      for (const idx of table.indexes) {
        const idxColNames = idx.columnIds
          .map(id => table.columns.find(c => c.id === id))
          .filter((c): c is Column => !!c)
          .map(c => c.name);
        if (idxColNames.length === 0) continue;
        if (idx.unique) {
          lines.push(`  @@unique([${idxColNames.join(', ')}])`);
        } else {
          lines.push(`  @@index([${idxColNames.join(', ')}])`);
        }
      }
    }

    // @@map if table name is not PascalCase
    if (needsMapTable) {
      lines.push(`  @@map("${table.name}")`);
    }

    lines.push('}');
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n') + '\n';
}

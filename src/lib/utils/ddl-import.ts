import type { Column, ColumnType, Dialect, ForeignKey, ReferentialAction, Table } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeType(raw: string): ColumnType {
  const upper = raw.toUpperCase().trim();
  const base = upper.replace(/\s*\([^)]*\)/, '').trim();

  if (base === 'SERIAL') return 'INT';
  if (base === 'BIGSERIAL') return 'BIGINT';
  if (base === 'INTEGER') return 'INT';
  if (base === 'TINYINT' || base === 'MEDIUMINT') return base === 'TINYINT' ? 'SMALLINT' : 'INT';
  if (base === 'TINYTEXT' || base === 'MEDIUMTEXT' || base === 'LONGTEXT') return 'TEXT';
  if (base === 'TINYBLOB' || base === 'BLOB' || base === 'MEDIUMBLOB' || base === 'LONGBLOB') return 'TEXT';
  if (base === 'BOOL' || base === 'BIT') return 'BOOLEAN';
  if (base === 'DATETIME' || base === 'TIMESTAMP' || base === 'TIMESTAMPTZ' || base === 'DATETIME2') return 'TIMESTAMP';
  if (base === 'NUMERIC' || base === 'REAL' || base === 'MONEY') return 'DECIMAL';
  if (base === 'CHARACTER VARYING' || base === 'NVARCHAR') return 'VARCHAR';
  if (base === 'CHARACTER' || base === 'NCHAR') return 'CHAR';
  if (base === 'UNIQUEIDENTIFIER') return 'UUID';
  if (base === 'NVARCHAR(MAX)') return 'TEXT';

  if ((COLUMN_TYPES as readonly string[]).includes(base)) return base as ColumnType;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getParser(dialect: Dialect): Promise<any> {
  switch (dialect) {
    case 'mysql': {
      const mod = await import('node-sql-parser/build/mysql');
      return new mod.Parser();//
    }
    case 'mariadb': {
      const mod = await import('node-sql-parser/build/mariadb');
      return new mod.Parser();
    }
    case 'postgresql': {
      const mod = await import('node-sql-parser/build/postgresql');
      return new mod.Parser();
    }
    case 'mssql': {
      const mod = await import('node-sql-parser/build/transactsql');
      return new mod.Parser();
    }
  }
}

export interface ImportResult {
  tables: Table[];
  errors: string[];
}

export async function importDDL(sql: string, dialect: Dialect = 'mysql'): Promise<ImportResult> {
  const errors: string[] = [];
  const tables: Table[] = [];
  const existingNames: string[] = [];

  let parser;
  try {
    parser = await getParser(dialect);
  } catch (e) {
    errors.push(`파서 로딩 실패: ${e}`);
    return { tables, errors };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stmts: any[];
  try {
    const result = parser.astify(sql);
    stmts = Array.isArray(result) ? result : [result];
  } catch (e) {
    errors.push(`SQL 파싱 오류: ${e instanceof Error ? e.message : e}`);
    return { tables, errors };
  }

  // Collect ALTER TABLE FK and COMMENT ON statements
  const alterFKMap = new Map<string, ParsedFK[]>();
  const tableComments = new Map<string, string>();
  const colComments = new Map<string, Map<string, string>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const stmt of stmts) {
    // ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY
    if (stmt.type === 'alter' && stmt.keyword === 'table') {
      const tName = stmt.table?.[0]?.table ?? '';
      if (stmt.expr) {
        for (const expr of stmt.expr) {
          if (expr.action === 'add' && expr.create_definitions?.constraint_type === 'FOREIGN KEY') {
            const fkDefs = expr.create_definitions.definition ?? [];
            const fk = extractFKFromRefDef(expr.create_definitions.reference_definition, fkDefs);
            if (fk) {
              const existing = alterFKMap.get(tName) ?? [];
              existing.push(fk);
              alterFKMap.set(tName, existing);
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
      const foreignKeys: ParsedFK[] = [];
      const defs = stmt.create_definitions ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const def of defs) {
        if (def.resource === 'column') {
          const colName = extractColumnName(def.column?.column);
          const rawType = def.definition?.dataType ?? 'VARCHAR';
          const length = def.definition?.length ?? undefined;
          const type = normalizeType(rawType);
          const nullable = def.nullable?.type !== 'not null';
          const isPK = !!def.primary_key;
          const isUnique = !!def.unique;
          const autoInc = !!def.auto_increment ||
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
            nullable,
            primaryKey: isPK,
            unique: isUnique,
            autoIncrement: autoInc,
          };
          if (length !== undefined) col.length = length;
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
            for (const d of def.definition ?? []) {
              uniqueColumns.push(extractColumnName(d.column));
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
        if (primaryKeys.includes(col.name)) col.primaryKey = true;
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

      // Merge ALTER TABLE FKs
      const alterFKs = alterFKMap.get(rawTableName) ?? [];
      foreignKeys.push(...alterFKs);

      const col = tableIdx % GRID_COLS;
      const row = Math.floor(tableIdx / GRID_COLS);

      const table: Table = {
        id: generateId(),
        name: tableName,
        columns,
        foreignKeys: [],
        position: { x: 40 + col * GRID_GAP_X, y: 40 + row * GRID_GAP_Y },
        comment: tableComment,
      };

      // Store parsed FK info for second-pass resolution
      (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs = foreignKeys;
      tables.push(table);
      tableIdx++;
    } catch (e) {
      errors.push(`테이블 파싱 오류: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (tables.length === 0) {
    errors.push('CREATE TABLE 구문을 찾을 수 없습니다.');
    return { tables, errors };
  }

  // Second pass: resolve foreign keys
  for (const table of tables) {
    const parsedFKs = (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs ?? [];
    delete (table as Table & { _parsedFKs?: ParsedFK[] })._parsedFKs;

    for (const fkDef of parsedFKs) {
      const refTable = tables.find((t) => t.name === fkDef.refTableName);
      if (!refTable) {
        errors.push(`FK 해결 실패: ${table.name}.(${fkDef.columnNames.join(', ')}) → ${fkDef.refTableName}`);
        continue;
      }
      const columnIds: string[] = [];
      const referencedColumnIds: string[] = [];
      let valid = true;
      for (let i = 0; i < fkDef.columnNames.length; i++) {
        const srcCol = table.columns.find((c) => c.name === fkDef.columnNames[i]);
        const refCol = refTable.columns.find((c) => c.name === fkDef.refColumnNames[i]);
        if (!srcCol || !refCol) {
          errors.push(
            `FK 해결 실패: ${table.name}.${fkDef.columnNames[i]} → ${fkDef.refTableName}.${fkDef.refColumnNames[i]}`,
          );
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

  return { tables, errors };
}

export type ColumnType =
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT' | 'MEDIUMINT'
  | 'VARCHAR' | 'CHAR' | 'TEXT'
  | 'NVARCHAR' | 'NCHAR' | 'NTEXT'
  | 'BOOLEAN' | 'BIT'
  | 'DATE' | 'TIME' | 'DATETIME' | 'TIMESTAMP' | 'DATETIMEOFFSET' | 'YEAR' | 'INTERVAL'
  | 'DECIMAL' | 'NUMERIC' | 'FLOAT' | 'DOUBLE' | 'REAL' | 'MONEY'
  | 'BINARY' | 'VARBINARY' | 'BLOB'
  | 'JSON' | 'JSONB' | 'UUID' | 'ENUM';

export const COLUMN_TYPES: ColumnType[] = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
  'VARCHAR', 'CHAR', 'TEXT',
  'NVARCHAR', 'NCHAR', 'NTEXT',
  'BOOLEAN', 'BIT',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'DATETIMEOFFSET', 'YEAR', 'INTERVAL',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'MONEY',
  'BINARY', 'VARBINARY', 'BLOB',
  'JSON', 'JSONB', 'UUID', 'ENUM',
];

export interface Column {
  id: string;
  name: string;
  domainId?: string;
  type: ColumnType;
  length?: number;
  scale?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  enumValues?: string[];
  comment?: string;
}

export interface ColumnDomain {
  id: string;
  name: string;
  type: ColumnType;
  length?: number;
  scale?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  enumValues?: string[];
  comment?: string;
  group?: string;
  // Documentation fields (not propagated to columns)
  description?: string;
  alias?: string;
  dataStandard?: string;
  example?: string;
  validRange?: string;
  owner?: string;
  tags?: string[];
  // Hierarchy
  parentId?: string;
}

export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';

export const REFERENTIAL_ACTIONS: ReferentialAction[] = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'];

export interface UniqueKey {
  id: string;
  columnIds: string[];
  name?: string;
}

export interface TableIndex {
  id: string;
  columnIds: string[];
  name?: string;
  unique: boolean;
}

export interface ForeignKey {
  id: string;
  columnIds: string[];
  referencedTableId: string;
  referencedColumnIds: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  label?: string;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  uniqueKeys: UniqueKey[];
  indexes: TableIndex[];
  position: { x: number; y: number };
  comment?: string;
  color?: string;
  group?: string;
  locked?: boolean;
  schema?: string;
}

export interface Memo {
  id: string;
  content: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  color?: string;
  locked?: boolean;
  attachedTableId?: string;
  schema?: string;
}

export interface DbObject {
  id: string;
  category: string;
  name: string;
  sql: string;
  comment?: string;
  schema?: string;
  includeInDdl?: boolean;
}

export interface ERDSchema {
  version: string;
  dialect?: Dialect;
  tables: Table[];
  domains: ColumnDomain[];
  memos: Memo[];
  dbObjects?: DbObject[];
  dbObjectCategories?: string[];
  groupColors?: Record<string, string>;
  schemas?: string[];
  namingRules?: import('./naming-rules').ProjectNamingOverrides;
  createdAt: string;
  updatedAt: string;
}

export const DOMAIN_FIELDS: (keyof Column)[] = [
  'type', 'length', 'scale', 'nullable', 'primaryKey', 'unique', 'autoIncrement', 'defaultValue', 'check', 'enumValues',
];

export type Dialect = 'mysql' | 'postgresql' | 'mariadb' | 'mssql' | 'sqlite' | 'oracle' | 'h2';

/** Per-dialect column types — types native or commonly used in each DBMS */
export const DIALECT_COLUMN_TYPES: Record<Dialect, ColumnType[]> = {
  mysql: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'ENUM',
  ],
  mariadb: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'ENUM',
  ],
  postgresql: [
    'INT', 'BIGINT', 'SMALLINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'INTERVAL',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'MONEY',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'JSONB', 'UUID', 'ENUM',
  ],
  mssql: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'NVARCHAR', 'NCHAR', 'NTEXT',
    'BIT',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'DATETIMEOFFSET',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'UUID',
  ],
  sqlite: [
    'INT', 'BIGINT', 'SMALLINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
    'BLOB',
    'JSON',
  ],
  oracle: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'INTERVAL',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE',
    'BINARY', 'VARBINARY', 'BLOB',
    'UUID', 'ENUM',
  ],
  h2: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'BOOLEAN',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'INTERVAL',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'UUID', 'ENUM',
  ],
};

/** Get column types for a dialect. If no dialect, returns all types. */
export function getColumnTypesForDialect(dialect?: Dialect): ColumnType[] {
  if (!dialect) return COLUMN_TYPES;
  return DIALECT_COLUMN_TYPES[dialect];
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface SchemaSnapshot {
  id: string;
  name: string;
  description?: string;
  snap: string;
  createdAt: number;
  isAuto?: boolean;
}

export interface ProjectIndex {
  version: string;
  activeProjectId: string;
  projects: ProjectMeta[];
}

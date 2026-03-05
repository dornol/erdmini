export type ColumnType =
  | 'INT' | 'BIGINT' | 'SMALLINT'
  | 'VARCHAR' | 'CHAR' | 'TEXT'
  | 'BOOLEAN'
  | 'DATE' | 'DATETIME' | 'TIMESTAMP'
  | 'DECIMAL' | 'FLOAT' | 'DOUBLE'
  | 'JSON' | 'UUID' | 'ENUM';

export const COLUMN_TYPES: ColumnType[] = [
  'INT', 'BIGINT', 'SMALLINT',
  'VARCHAR', 'CHAR', 'TEXT',
  'BOOLEAN',
  'DATE', 'DATETIME', 'TIMESTAMP',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'JSON', 'UUID', 'ENUM',
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

export interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];
  memos: Memo[];
  groupColors?: Record<string, string>;
  schemas?: string[];
  createdAt: string;
  updatedAt: string;
}

export const DOMAIN_FIELDS: (keyof Column)[] = [
  'type', 'length', 'scale', 'nullable', 'primaryKey', 'unique', 'autoIncrement', 'defaultValue', 'check', 'enumValues',
];

export type Dialect = 'mysql' | 'postgresql' | 'mariadb' | 'mssql' | 'sqlite' | 'oracle' | 'h2';

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

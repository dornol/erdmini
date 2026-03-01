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
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
  group?: string;
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
}

export interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];
  createdAt: string;
  updatedAt: string;
}

export const DOMAIN_FIELDS: (keyof Column)[] = [
  'type', 'length', 'scale', 'nullable', 'primaryKey', 'unique', 'autoIncrement', 'defaultValue',
];

export type Dialect = 'mysql' | 'postgresql' | 'mariadb' | 'mssql';

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ProjectIndex {
  version: string;
  activeProjectId: string;
  projects: ProjectMeta[];
}

export type ColumnType =
  | 'INT' | 'BIGINT' | 'SMALLINT'
  | 'VARCHAR' | 'CHAR' | 'TEXT'
  | 'BOOLEAN'
  | 'DATE' | 'DATETIME' | 'TIMESTAMP'
  | 'DECIMAL' | 'FLOAT' | 'DOUBLE'
  | 'JSON' | 'UUID';

export const COLUMN_TYPES: ColumnType[] = [
  'INT', 'BIGINT', 'SMALLINT',
  'VARCHAR', 'CHAR', 'TEXT',
  'BOOLEAN',
  'DATE', 'DATETIME', 'TIMESTAMP',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'JSON', 'UUID',
];

export interface Column {
  id: string;
  name: string;
  domainId?: string;
  type: ColumnType;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
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
}

export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';

export const REFERENTIAL_ACTIONS: ReferentialAction[] = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'];

export interface ForeignKey {
  id: string;
  columnId: string;
  referencedTableId: string;
  referencedColumnId: string;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  position: { x: number; y: number };
  comment?: string;
}

export interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];
  createdAt: string;
  updatedAt: string;
}

export type Dialect = 'mysql' | 'postgresql' | 'mariadb' | 'mssql';

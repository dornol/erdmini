import type { Column } from '$lib/types/erd';

export interface TableTemplate {
  id: string;
  nameKey: string;
  tableName: string;
  columns: Omit<Column, 'id'>[];
}

export const TABLE_TEMPLATES: TableTemplate[] = [
  {
    id: 'users',
    nameKey: 'template_users',
    tableName: 'users',
    columns: [
      { name: 'id', type: 'BIGINT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
      { name: 'email', type: 'VARCHAR', length: 255, nullable: false, primaryKey: false, unique: true, autoIncrement: false },
      { name: 'password_hash', type: 'VARCHAR', length: 255, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'name', type: 'VARCHAR', length: 100, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'status', type: 'VARCHAR', length: 20, nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: "'active'" },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
    ],
  },
  {
    id: 'audit_log',
    nameKey: 'template_audit_log',
    tableName: 'audit_log',
    columns: [
      { name: 'id', type: 'BIGINT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
      { name: 'user_id', type: 'BIGINT', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'action', type: 'VARCHAR', length: 50, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'entity_type', type: 'VARCHAR', length: 50, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'entity_id', type: 'VARCHAR', length: 100, nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'details', type: 'JSON', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'ip_address', type: 'VARCHAR', length: 45, nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
    ],
  },
  {
    id: 'settings',
    nameKey: 'template_settings',
    tableName: 'settings',
    columns: [
      { name: 'key', type: 'VARCHAR', length: 100, nullable: false, primaryKey: true, unique: false, autoIncrement: false },
      { name: 'value', type: 'TEXT', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'description', type: 'VARCHAR', length: 255, nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
    ],
  },
  {
    id: 'files',
    nameKey: 'template_files',
    tableName: 'files',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, primaryKey: true, unique: false, autoIncrement: false },
      { name: 'name', type: 'VARCHAR', length: 255, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'path', type: 'VARCHAR', length: 1000, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'mime_type', type: 'VARCHAR', length: 100, nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'size_bytes', type: 'BIGINT', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'uploaded_by', type: 'BIGINT', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
    ],
  },
  {
    id: 'tags',
    nameKey: 'template_tags',
    tableName: 'tags',
    columns: [
      { name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
      { name: 'name', type: 'VARCHAR', length: 50, nullable: false, primaryKey: false, unique: true, autoIncrement: false },
      { name: 'slug', type: 'VARCHAR', length: 50, nullable: false, primaryKey: false, unique: true, autoIncrement: false },
      { name: 'color', type: 'VARCHAR', length: 7, nullable: true, primaryKey: false, unique: false, autoIncrement: false },
    ],
  },
];

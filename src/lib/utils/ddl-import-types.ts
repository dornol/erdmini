import type { ReferentialAction } from '$lib/types/erd';

export interface DDLImportMessages {
  noCreateTable: () => string;
  tableParseError: (params: { error: string }) => string;
  fkResolveFailed: (params: { detail: string }) => string;
}

export const DEFAULT_MESSAGES: DDLImportMessages = {
  noCreateTable: () => 'No CREATE TABLE statements found.',
  tableParseError: ({ error }) => `Table parse error: ${error}`,
  fkResolveFailed: ({ detail }) => `FK resolve failed: ${detail}`,
};

export interface ParsedFK {
  columnNames: string[];
  refTableName: string;
  refColumnNames: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface ImportResult {
  tables: import('$lib/types/erd').Table[];
  errors: string[];
  warnings: string[];
}

export interface ParsedIndex {
  tableName: string;
  columnNames: string[];
  name?: string;
  unique: boolean;
}

export function parseRefAction(raw: string | undefined): ReferentialAction {
  if (!raw) return 'RESTRICT';
  const u = raw.trim().toUpperCase();
  if (u === 'CASCADE') return 'CASCADE';
  if (u === 'SET NULL') return 'SET NULL';
  if (u === 'RESTRICT') return 'RESTRICT';
  return 'NO ACTION';
}

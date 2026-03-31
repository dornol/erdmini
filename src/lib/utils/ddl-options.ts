import type { Dialect } from '$lib/types/erd';
import { DEFAULT_DDL_OPTIONS, type DDLExportOptions } from '$lib/utils/ddl-export';

export const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'mssql', label: 'MSSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'h2', label: 'H2' },
];

const STORAGE_KEY = 'erdmini_ddl_options';

export function loadDdlOptions(): DDLExportOptions {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_DDL_OPTIONS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DEFAULT_DDL_OPTIONS };
}

export function saveDdlOptions(options: DDLExportOptions): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); } catch { /* quota exceeded */ }
}

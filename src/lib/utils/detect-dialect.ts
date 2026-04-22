import type { Dialect } from '$lib/types/erd';

/**
 * Detect SQL dialect from DDL text by scanning for dialect-specific keywords.
 * Returns null if no clear signal is found.
 */
export function detectDialect(sql: string): Dialect | null {
  const upper = sql.toUpperCase();

  // MSSQL signals
  if (/\bIDENTITY\s*\(\s*\d/.test(upper) || /\bNVARCHAR\b/.test(upper) || /\bDATETIMEOFFSET\b/.test(upper) || /\[dbo\]/.test(sql) || /\bsp_addextendedproperty\b/i.test(sql)) {
    return 'mssql';
  }

  // Oracle signals
  if (/\bVARCHAR2\b/.test(upper) || /\bNUMBER\s*\(/.test(upper) || /\bCLOB\b/.test(upper) || /\bGENERATED\s+ALWAYS\s+AS\s+IDENTITY\b/.test(upper)) {
    return 'oracle';
  }

  // PostgreSQL signals
  if (/\bJSONB\b/.test(upper) || /\b(BIGSERIAL|SMALLSERIAL|SERIAL)\b/.test(upper) || /\bTEXT\b/.test(upper) && /\bBOOLEAN\b/.test(upper) || /\bCREATE\s+TYPE\b/.test(upper)) {
    return 'postgresql';
  }

  // SQLite signals
  if (/\bAUTOINCREMENT\b/.test(upper) || /\bINTEGER\s+PRIMARY\s+KEY\b/.test(upper)) {
    return 'sqlite';
  }

  // MySQL/MariaDB signals
  if (/\bAUTO_INCREMENT\b/.test(upper) || /\bENGINE\s*=/.test(upper) || /`[^`]+`/.test(sql)) {
    return 'mysql';
  }

  // H2 signals
  if (/\bCACHED\b/.test(upper) && /\bTABLE\b/.test(upper) || /\bMEMORY\b/.test(upper) && /\bCREATE\b/.test(upper)) {
    return 'h2';
  }

  return null;
}

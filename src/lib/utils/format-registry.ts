/**
 * Format registry for import/export formats.
 *
 * Single source of truth for all supported formats (DDL, Prisma, DBML, Drizzle,
 * Mermaid, PlantUML, ...). Adding a new format = adding one entry here.
 *
 * Each format owns its own options/messages translation. The UI layer only
 * knows: "give me a format spec, call export/import, show the result".
 */
import type { Dialect, ERDSchema } from '$lib/types/erd';
import type { DDLExportOptions } from './ddl-export';
import type { ImportResult } from './ddl-import-types';

import { exportDDL } from './ddl-export';
import { exportMermaid, exportPlantUML } from './diagram-export';
import { exportPrisma } from './prisma-export';
import { exportDBML } from './dbml-export';
import { exportDrizzle, type DrizzleDialect } from './drizzle-export';
import { importDDL } from './ddl-import';
import { importPrisma } from './prisma-import';
import { importDBML } from './dbml-import';

// ─── Export registry ─────────────────────────────────────────────────

export interface ExportCallOptions {
  dialect?: Dialect;
  ddlOptions?: DDLExportOptions;
  dbObjectIds?: string[];
}

export interface ExportFormatSpec {
  /** Unique identifier (used as state key and option value) */
  id: string;
  /** Display label shown in UI */
  label: string;
  /** Whether this format needs dialect selection in UI */
  supportsDialect: boolean;
  /** Whether DDL-specific options panel applies */
  supportsDdlOptions: boolean;
  /** Perform the export */
  export: (schema: ERDSchema, opts: ExportCallOptions) => string;
  /** File extension — static or computed per dialect */
  fileExt: string | ((dialect?: Dialect) => string);
  /** MIME type for download */
  mime: string;
  /** i18n key for download button label (optional) */
  downloadLabelKey?: string;
}

export const EXPORT_FORMATS: readonly ExportFormatSpec[] = [
  {
    id: 'ddl',
    label: 'DDL',
    supportsDialect: true,
    supportsDdlOptions: true,
    export: (schema, opts) => {
      const dialect = opts.dialect ?? 'mysql';
      const ddlOpts = (opts.ddlOptions ?? {}) as DDLExportOptions;
      return exportDDL(schema, dialect, {
        ...ddlOpts,
        dbObjectIds: opts.dbObjectIds,
      });
    },
    fileExt: (dialect) => `_${dialect ?? 'mysql'}.sql`,
    mime: 'text/plain',
    downloadLabelKey: 'ddl_download',
  },
  {
    id: 'mermaid',
    label: 'Mermaid',
    supportsDialect: false,
    supportsDdlOptions: false,
    export: (schema) => exportMermaid(schema),
    fileExt: '.mmd',
    mime: 'text/plain',
  },
  {
    id: 'plantuml',
    label: 'PlantUML',
    supportsDialect: false,
    supportsDdlOptions: false,
    export: (schema) => exportPlantUML(schema),
    fileExt: '.puml',
    mime: 'text/plain',
  },
  {
    id: 'prisma',
    label: 'Prisma',
    supportsDialect: false,
    supportsDdlOptions: false,
    export: (schema) => exportPrisma(schema),
    fileExt: '.prisma',
    mime: 'text/plain',
    downloadLabelKey: 'prisma_download',
  },
  {
    id: 'dbml',
    label: 'DBML',
    supportsDialect: false,
    supportsDdlOptions: false,
    export: (schema) => exportDBML(schema),
    fileExt: '.dbml',
    mime: 'text/plain',
    downloadLabelKey: 'dbml_download',
  },
  {
    id: 'drizzle',
    label: 'Drizzle',
    supportsDialect: true, // Drizzle has 3 dialects (pg/mysql/sqlite) — reuse dialect selector
    supportsDdlOptions: false,
    export: (schema, opts) => {
      // Drizzle only supports 3 dialects; fall back to postgresql for others
      const d = opts.dialect;
      const drizzleDialect: DrizzleDialect =
        d === 'mysql' || d === 'mariadb' ? 'mysql' :
        d === 'sqlite' ? 'sqlite' :
        'postgresql';
      return exportDrizzle(schema, { dialect: drizzleDialect, includeRelations: true });
    },
    fileExt: '.ts',
    mime: 'text/typescript',
    downloadLabelKey: 'drizzle_download',
  },
];

export function getExportFormat(id: string): ExportFormatSpec | undefined {
  return EXPORT_FORMATS.find((f) => f.id === id);
}

export function resolveFileExt(spec: ExportFormatSpec, dialect?: Dialect): string {
  return typeof spec.fileExt === 'function' ? spec.fileExt(dialect) : spec.fileExt;
}

// ─── Import registry ─────────────────────────────────────────────────

/**
 * Paraglide messages subset used by importers.
 * The UI layer passes this once; each importer picks the keys it needs.
 */
export interface ImportMessageBag {
  // Common
  fkResolveFailed: (p: { detail: string }) => string;
  // DDL-specific
  noCreateTable?: () => string;
  tableParseError?: (p: { error: string }) => string;
  // Prisma-specific
  noModels?: () => string;
  implicitM2m?: (p: { detail: string }) => string;
  noPkWarning?: (p: { model?: string; table?: string }) => string;
  // DBML-specific
  noTables?: () => string;
}

export interface ImportCallOptions {
  dialect?: Dialect;
  messages?: ImportMessageBag;
}

export interface ImportFormatSpec {
  /** Unique identifier */
  id: string;
  /** Display label shown in UI */
  label: string;
  /** Whether this format needs dialect selection */
  supportsDialect: boolean;
  /** File input accept attribute */
  acceptFiles: string;
  /** Perform the import */
  import: (text: string, opts: ImportCallOptions) => ImportResult | Promise<ImportResult>;
  /** i18n placeholder key */
  placeholderKey: string;
  /** i18n success message key (takes { count }) */
  successKey: string;
}

export const IMPORT_FORMATS: readonly ImportFormatSpec[] = [
  {
    id: 'ddl',
    label: 'DDL',
    supportsDialect: true,
    acceptFiles: '.sql,.txt',
    import: (text, opts) => {
      const m = opts.messages;
      return importDDL(text, opts.dialect ?? 'mysql', m ? {
        noCreateTable: m.noCreateTable ?? (() => 'No CREATE TABLE statements found'),
        tableParseError: m.tableParseError ?? ((p) => `Parse error: ${p.error}`),
        fkResolveFailed: m.fkResolveFailed,
      } : undefined);
    },
    placeholderKey: 'ddl_paste_placeholder',
    successKey: 'ddl_import_success',
  },
  {
    id: 'prisma',
    label: 'Prisma',
    supportsDialect: false,
    acceptFiles: '.prisma,.txt',
    import: (text, opts) => {
      const m = opts.messages;
      return importPrisma(text, m ? {
        noModels: m.noModels,
        implicitM2m: m.implicitM2m,
        noPkWarning: m.noPkWarning ? ({ model }) => m.noPkWarning!({ model }) : undefined,
        fkResolveFailed: m.fkResolveFailed,
      } : undefined);
    },
    placeholderKey: 'prisma_paste_placeholder',
    successKey: 'prisma_import_success',
  },
  {
    id: 'dbml',
    label: 'DBML',
    supportsDialect: false,
    acceptFiles: '.dbml,.txt',
    import: (text, opts) => {
      const m = opts.messages;
      return importDBML(text, m ? {
        noTables: m.noTables,
        noPkWarning: m.noPkWarning ? ({ table }) => m.noPkWarning!({ table }) : undefined,
        fkResolveFailed: m.fkResolveFailed,
      } : undefined);
    },
    placeholderKey: 'dbml_paste_placeholder',
    successKey: 'dbml_import_success',
  },
];

export function getImportFormat(id: string): ImportFormatSpec | undefined {
  return IMPORT_FORMATS.find((f) => f.id === id);
}

import type { ERDSchema } from '$lib/types/erd';

/**
 * Normalize and migrate a raw ERDSchema in-place.
 * Handles missing arrays, legacy FK format (columnId → columnIds), PK/nullable fix.
 * Used by both erdStore.loadSchema() and projectStore.migrateSchema().
 */
export function normalizeSchema(schema: ERDSchema): void {
  if (!schema.domains) schema.domains = [];
  if (!schema.memos) (schema as ERDSchema).memos = [];
  if (!schema.dbObjects) schema.dbObjects = [];
  if (!schema.dbObjectCategories) schema.dbObjectCategories = [];
  if (!schema.groupColors) schema.groupColors = {};
  if (!schema.namingRules) schema.namingRules = {};

  for (const table of schema.tables) {
    if (!table.uniqueKeys) table.uniqueKeys = [];
    if (!table.indexes) table.indexes = [];

    // Migrate legacy FK format: columnId/referencedColumnId → columnIds/referencedColumnIds
    for (const fk of table.foreignKeys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = fk as any;
      if (raw.columnId && !fk.columnIds) {
        fk.columnIds = [raw.columnId];
        fk.referencedColumnIds = [raw.referencedColumnId];
        delete raw.columnId;
        delete raw.referencedColumnId;
      }
    }

    // PK implies NOT NULL
    for (const col of table.columns) {
      if (col.primaryKey && col.nullable) col.nullable = false;
    }
  }
}

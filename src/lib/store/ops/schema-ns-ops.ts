import type { ERDSchema } from '$lib/types/erd';
import { now } from '$lib/utils/common';

export function addSchemaOp(schema: ERDSchema, name: string): boolean {
  if (!schema.schemas) schema.schemas = [];
  if (schema.schemas.includes(name)) return false;
  schema.schemas = [...schema.schemas, name];
  schema.updatedAt = now();
  return true;
}

export function renameSchemaOp(schema: ERDSchema, oldName: string, newName: string): boolean {
  if (!newName || oldName === newName) return false;
  if (schema.schemas?.includes(newName)) return false;
  schema.schemas = schema.schemas?.map((s) => (s === oldName ? newName : s));
  for (const t of schema.tables) {
    if (t.schema === oldName) t.schema = newName;
  }
  for (const mm of schema.memos) {
    if (mm.schema === oldName) mm.schema = newName;
  }
  schema.updatedAt = now();
  return true;
}

export function reorderSchemasOp(schema: ERDSchema, schemas: string[]): void {
  schema.schemas = schemas;
  schema.updatedAt = now();
}

export function deleteSchemaOp(schema: ERDSchema, name: string): void {
  schema.schemas = schema.schemas?.filter((s) => s !== name);
  for (const t of schema.tables) {
    if (t.schema === name) delete t.schema;
  }
  for (const mm of schema.memos) {
    if (mm.schema === name) delete mm.schema;
  }
  schema.updatedAt = now();
}

export function updateTableSchemaOp(schema: ERDSchema, tableId: string, schemaName: string | undefined): void {
  const tbl = schema.tables.find((t) => t.id === tableId);
  if (!tbl) return;
  if (schemaName) tbl.schema = schemaName; else delete tbl.schema;
  schema.updatedAt = now();
}

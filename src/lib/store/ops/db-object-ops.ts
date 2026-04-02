import type { DbObject, ERDSchema } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

export function addDbObjectOp(schema: ERDSchema, category: string, name?: string): DbObject {
  if (!schema.dbObjects) schema.dbObjects = [];
  if (!schema.dbObjectCategories) schema.dbObjectCategories = [];

  if (!schema.dbObjectCategories.includes(category)) {
    schema.dbObjectCategories.push(category);
  }

  const obj: DbObject = {
    id: generateId(),
    category,
    name: name ?? `new_${category.toLowerCase()}`,
    sql: '',
  };
  schema.dbObjects.push(obj);
  schema.updatedAt = now();
  return obj;
}

export function updateDbObjectOp(
  schema: ERDSchema,
  objectId: string,
  updates: Partial<Pick<DbObject, 'name' | 'sql' | 'comment' | 'category' | 'schema' | 'includeInDdl'>>,
): boolean {
  if (!schema.dbObjects) return false;
  const obj = schema.dbObjects.find((o) => o.id === objectId);
  if (!obj) return false;

  if (updates.name !== undefined) obj.name = updates.name;
  if (updates.sql !== undefined) obj.sql = updates.sql;
  if (updates.comment !== undefined) obj.comment = updates.comment;
  if (updates.category !== undefined) obj.category = updates.category;
  if (updates.schema !== undefined) obj.schema = updates.schema;
  if (updates.includeInDdl !== undefined) obj.includeInDdl = updates.includeInDdl;

  schema.updatedAt = now();
  return true;
}

export function deleteDbObjectOp(schema: ERDSchema, objectId: string): boolean {
  if (!schema.dbObjects) return false;
  const idx = schema.dbObjects.findIndex((o) => o.id === objectId);
  if (idx < 0) return false;

  schema.dbObjects.splice(idx, 1);
  schema.updatedAt = now();
  return true;
}

export function addDbObjectCategoryOp(schema: ERDSchema, category: string): boolean {
  if (!schema.dbObjectCategories) schema.dbObjectCategories = [];
  if (schema.dbObjectCategories.includes(category)) return false;
  schema.dbObjectCategories.push(category);
  schema.updatedAt = now();
  return true;
}

export function renameDbObjectCategoryOp(schema: ERDSchema, oldName: string, newName: string): boolean {
  if (!schema.dbObjectCategories || !schema.dbObjects) return false;
  const idx = schema.dbObjectCategories.indexOf(oldName);
  if (idx < 0 || schema.dbObjectCategories.includes(newName)) return false;

  schema.dbObjectCategories[idx] = newName;
  for (const obj of schema.dbObjects) {
    if (obj.category === oldName) obj.category = newName;
  }
  schema.updatedAt = now();
  return true;
}

export function deleteDbObjectCategoryOp(schema: ERDSchema, category: string): boolean {
  if (!schema.dbObjectCategories || !schema.dbObjects) return false;
  const idx = schema.dbObjectCategories.indexOf(category);
  if (idx < 0) return false;

  schema.dbObjectCategories.splice(idx, 1);
  schema.dbObjects = schema.dbObjects.filter((o) => o.category !== category);
  schema.updatedAt = now();
  return true;
}

export function reorderDbObjectCategoriesOp(schema: ERDSchema, categories: string[]): void {
  schema.dbObjectCategories = categories;
  schema.updatedAt = now();
}

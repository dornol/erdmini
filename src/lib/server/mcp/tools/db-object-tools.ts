import { z } from 'zod';
import type { RegisterFn } from './types';
import { addDbObject, updateDbObject, deleteDbObject, addDbObjectCategory, deleteDbObjectCategory, renameDbObjectCategory } from '../schema-ops';

export const registerDbObjectTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'list_db_objects',
    'List all DB objects (procedures, functions, views, triggers, etc.) grouped by category. Optionally filter by category.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      category: z.string().max(256).optional().describe('Filter by category name'),
    },
    async ({ projectId, category }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      let objects = schema.dbObjects ?? [];
      if (category) objects = objects.filter(o => o.category === category);
      const result = objects.map(o => ({
        id: o.id,
        category: o.category,
        name: o.name,
        comment: o.comment || null,
        schema: o.schema || null,
        includeInDdl: o.includeInDdl ?? false,
        sqlPreview: o.sql.length > 200 ? o.sql.slice(0, 200) + '...' : o.sql,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_db_object_categories',
    'List all DB object categories (e.g., Procedure, Function, View, Trigger).',
    {
      projectId: z.string().max(256).describe('Project ID'),
    },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const categories = schema.dbObjectCategories ?? [];
      const counts = categories.map(c => ({
        category: c,
        count: (schema.dbObjects ?? []).filter(o => o.category === c).length,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(counts, null, 2) }] };
    },
  );

  server.tool(
    'get_db_object',
    'Get full details of a DB object including its SQL content.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      objectId: z.string().max(256).describe('DB object ID'),
    },
    async ({ projectId, objectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const obj = (schema.dbObjects ?? []).find(o => o.id === objectId);
      if (!obj) return { content: [{ type: 'text' as const, text: `DB object ${objectId} not found` }], isError: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
    },
  );

  server.tool(
    'add_db_object',
    'Add a new DB object (procedure, function, view, trigger, etc.). Category is auto-created if it does not exist. Returns {objectId}.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      category: z.string().max(256).describe('Category name (e.g., Procedure, Function, View, Trigger)'),
      name: z.string().max(256).optional().describe('Object name'),
      sql: z.string().max(100000).optional().describe('SQL content'),
      comment: z.string().max(1000).optional().describe('Description'),
      schema: z.string().max(256).optional().describe('Schema namespace'),
      includeInDdl: z.boolean().optional().describe('Include in DDL export'),
    },
    async ({ projectId, category, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addDbObject(schema, category, opts);
      mcpAudit('add_db_object', projectId, { category, name: opts.name });
      saveAndNotify(projectId, result.schema);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ objectId: result.objectId }) }] };
    },
  );

  server.tool(
    'update_db_object',
    'Update a DB object. Only provided fields are changed.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      objectId: z.string().max(256).describe('DB object ID'),
      name: z.string().max(256).optional().describe('New name'),
      sql: z.string().max(100000).optional().describe('New SQL content'),
      comment: z.string().max(1000).optional().describe('New description'),
      category: z.string().max(256).optional().describe('Move to different category'),
      schema: z.string().max(256).optional().describe('Schema namespace'),
      includeInDdl: z.boolean().optional().describe('Include in DDL export'),
    },
    async ({ projectId, objectId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.dbObjects ?? []).find(o => o.id === objectId)) {
        return { content: [{ type: 'text' as const, text: `DB object ${objectId} not found` }], isError: true };
      }
      const updated = updateDbObject(schema, objectId, patch);
      mcpAudit('update_db_object', projectId, { objectId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'delete_db_object',
    'Delete a DB object by ID.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      objectId: z.string().max(256).describe('DB object ID'),
    },
    async ({ projectId, objectId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.dbObjects ?? []).find(o => o.id === objectId)) {
        return { content: [{ type: 'text' as const, text: `DB object ${objectId} not found` }], isError: true };
      }
      const updated = deleteDbObject(schema, objectId);
      mcpAudit('delete_db_object', projectId, { objectId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'add_db_object_category',
    'Add a new DB object category.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      category: z.string().max(256).describe('Category name'),
    },
    async ({ projectId, category }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if ((schema.dbObjectCategories ?? []).includes(category)) {
        return { content: [{ type: 'text' as const, text: `Category "${category}" already exists` }], isError: true };
      }
      const updated = addDbObjectCategory(schema, category);
      mcpAudit('add_db_object_category', projectId, { category });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'rename_db_object_category',
    'Rename a DB object category. All objects in the category are updated.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      oldName: z.string().max(256).describe('Current category name'),
      newName: z.string().max(256).describe('New category name'),
    },
    async ({ projectId, oldName, newName }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.dbObjectCategories ?? []).includes(oldName)) {
        return { content: [{ type: 'text' as const, text: `Category "${oldName}" not found` }], isError: true };
      }
      if ((schema.dbObjectCategories ?? []).includes(newName)) {
        return { content: [{ type: 'text' as const, text: `Category "${newName}" already exists` }], isError: true };
      }
      const updated = renameDbObjectCategory(schema, oldName, newName);
      mcpAudit('rename_db_object_category', projectId, { oldName, newName });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'delete_db_object_category',
    'Delete a DB object category and all its objects.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      category: z.string().max(256).describe('Category name'),
    },
    async ({ projectId, category }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.dbObjectCategories ?? []).includes(category)) {
        return { content: [{ type: 'text' as const, text: `Category "${category}" not found` }], isError: true };
      }
      const updated = deleteDbObjectCategory(schema, category);
      mcpAudit('delete_db_object_category', projectId, { category });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );
};

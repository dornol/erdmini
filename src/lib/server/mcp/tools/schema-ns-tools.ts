import { z } from 'zod';
import type { RegisterFn } from './types';
import { renameSchema, addSchemaNamespace, deleteSchemaNamespace } from '../schema-ops';

export const registerSchemaNsTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'add_schema',
    'Add a new schema namespace (e.g. "public", "auth", "billing"). Use update_table to assign tables to it. Use list_schemas to see existing namespaces.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Schema namespace name'),
    },
    async ({ projectId, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = addSchemaNamespace(schema, name);
      if (!updated) {
        return { content: [{ type: 'text', text: `Schema namespace '${name}' already exists` }], isError: true };
      }
      mcpAudit('add_schema', projectId, { name });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Schema namespace '${name}' added` }] };
    },
  );

  server.tool(
    'delete_schema',
    'Delete a schema namespace. Tables and memos in it become unassigned (not deleted). Use rename_schema to rename instead.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Schema namespace name to delete'),
    },
    async ({ projectId, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.schemas ?? []).includes(name)) {
        return { content: [{ type: 'text', text: `Schema namespace '${name}' not found` }], isError: true };
      }
      const updated = deleteSchemaNamespace(schema, name);
      mcpAudit('delete_schema', projectId, { name });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Schema namespace '${name}' deleted` }] };
    },
  );

  server.tool(
    'rename_schema',
    'Rename a schema namespace. All tables and memos assigned to the old name are updated to the new name.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      oldName: z.string().max(256).describe('Current schema namespace name'),
      newName: z.string().max(256).describe('New schema namespace name'),
    },
    async ({ projectId, oldName, newName }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = renameSchema(schema, oldName, newName);
      if (!result) {
        return { content: [{ type: 'text', text: 'Invalid or duplicate schema name' }], isError: true };
      }
      mcpAudit('rename_schema', projectId, { oldName, newName });
      saveAndNotify(projectId, result);
      return { content: [{ type: 'text', text: `Schema renamed: "${oldName}" → "${newName}"` }] };
    },
  );

  server.tool(
    'bulk_update_table_schema',
    'Change the schema namespace for multiple tables at once. Pass null/empty string to remove schema assignment.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableIds: z.array(z.string().max(256)).min(1).max(500).describe('Array of table IDs'),
      schema: z.string().max(256).nullable().describe('Schema namespace name (null to remove)'),
    },
    async ({ projectId, tableIds, schema: schemaName }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated: string[] = [];

      for (const tableId of tableIds) {
        const table = schema.tables.find(t => t.id === tableId);
        if (table) {
          table.schema = schemaName || undefined;
          updated.push(tableId);
        }
      }

      if (updated.length === 0) {
        return { content: [{ type: 'text', text: 'No matching tables found' }], isError: true };
      }

      mcpAudit('bulk_update_table_schema', projectId, { count: updated.length, schema: schemaName });
      saveAndNotify(projectId, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ updated: updated.length, schema: schemaName || null }) }],
      };
    },
  );
};

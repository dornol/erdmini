import { z } from 'zod';
import type { RegisterFn } from './types';
import { addUniqueKey, deleteUniqueKey, addIndex, deleteIndex } from '../schema-ops';

export const registerConstraintTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'add_unique_key',
    'Add a unique key constraint on one or more columns. Returns {ukId}. Supports composite unique keys.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnIds: z.array(z.string().max(256)).max(100).describe('Column IDs for the unique key'),
      name: z.string().max(256).optional().describe('Optional constraint name'),
    },
    async ({ projectId, tableId, columnIds, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addUniqueKey(schema, tableId, columnIds, name);
      if (!result) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      mcpAudit('add_unique_key', projectId, { tableId, columnIds });
      saveAndNotify(projectId, result.schema);
      return { content: [{ type: 'text', text: JSON.stringify({ ukId: result.ukId }) }] };
    },
  );

  server.tool(
    'delete_unique_key',
    'Delete a unique key constraint from a table',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      uniqueKeyId: z.string().max(256).describe('Unique key ID to delete'),
    },
    async ({ projectId, tableId, uniqueKeyId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = deleteUniqueKey(schema, tableId, uniqueKeyId);
      mcpAudit('delete_unique_key', projectId, { tableId, uniqueKeyId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Unique key deleted' }] };
    },
  );

  server.tool(
    'add_index',
    'Add an index on one or more columns. Returns {indexId}. Set unique=true for a unique index.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnIds: z.array(z.string().max(256)).max(100).describe('Column IDs for the index'),
      unique: z.boolean().optional().describe('Whether the index is unique (default: false)'),
      name: z.string().max(256).optional().describe('Optional index name'),
    },
    async ({ projectId, tableId, columnIds, unique, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addIndex(schema, tableId, columnIds, unique ?? false, name);
      if (!result) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      mcpAudit('add_index', projectId, { tableId, columnIds, unique });
      saveAndNotify(projectId, result.schema);
      return { content: [{ type: 'text', text: JSON.stringify({ indexId: result.indexId }) }] };
    },
  );

  server.tool(
    'delete_index',
    'Delete an index from a table',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      indexId: z.string().max(256).describe('Index ID to delete'),
    },
    async ({ projectId, tableId, indexId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = deleteIndex(schema, tableId, indexId);
      mcpAudit('delete_index', projectId, { tableId, indexId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Index deleted' }] };
    },
  );
};

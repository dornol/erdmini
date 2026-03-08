import { z } from 'zod';
import type { RegisterFn } from './types';
import { COLUMN_TYPES } from '$lib/types/erd';
import { addColumn, updateColumn, deleteColumn, moveColumn } from '../schema-ops';

export const registerColumnTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'add_column',
    'Add a column to a table. Returns {columnId}. Defaults: type=VARCHAR, nullable=true. Setting primaryKey=true auto-sets nullable=false. For adding many columns at once, use bulk_add_columns.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      name: z.string().max(256).optional().describe('Column name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('Column type'),
      length: z.number().min(0).max(65535).optional().describe('Column length'),
      scale: z.number().min(0).max(30).optional().describe('Decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique constraint'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      comment: z.string().max(4096).optional().describe('Column comment'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      domainId: z.string().max(256).optional().describe('Domain ID to link'),
    },
    async ({ projectId, tableId, ...colOpts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addColumn(schema, tableId, colOpts as any);
      if (!result) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      mcpAudit('add_column', projectId, { tableId, name: colOpts.name });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ columnId: result.columnId }) }],
      };
    },
  );

  server.tool(
    'update_column',
    'Update column properties. Only provided fields are changed. Setting primaryKey=true auto-sets nullable=false. Set domainId to empty string to unlink from domain.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnId: z.string().max(256).describe('Column ID'),
      name: z.string().max(256).optional().describe('New column name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('New column type'),
      length: z.number().min(0).max(65535).optional().describe('New length'),
      scale: z.number().min(0).max(30).optional().describe('New decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      comment: z.string().max(4096).optional().describe('Column comment'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      domainId: z.string().max(256).optional().describe('Domain ID to link (empty string to unlink)'),
    },
    async ({ projectId, tableId, columnId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.columns.find(c => c.id === columnId)) {
        return { content: [{ type: 'text', text: `Column ${columnId} not found` }], isError: true };
      }
      const updated = updateColumn(schema, tableId, columnId, patch as any);
      mcpAudit('update_column', projectId, { tableId, columnId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Column updated' }] };
    },
  );

  server.tool(
    'delete_column',
    'Delete a column. Automatically removes any FK, unique key, and index references that include this column.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnId: z.string().max(256).describe('Column ID to delete'),
    },
    async ({ projectId, tableId, columnId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.columns.find(c => c.id === columnId)) {
        return { content: [{ type: 'text', text: `Column ${columnId} not found` }], isError: true };
      }
      const updated = deleteColumn(schema, tableId, columnId);
      mcpAudit('delete_column', projectId, { tableId, columnId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Column deleted' }] };
    },
  );

  server.tool(
    'move_column',
    'Reorder a column within a table. toIndex is 0-based position in the column list.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnId: z.string().max(256).describe('Column ID to move'),
      toIndex: z.number().int().min(0).describe('Target position index (0-based)'),
    },
    async ({ projectId, tableId, columnId, toIndex }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = moveColumn(schema, tableId, columnId, toIndex);
      if (!result) {
        return { content: [{ type: 'text', text: 'Table or column not found, or index out of range' }], isError: true };
      }
      mcpAudit('move_column', projectId, { tableId, columnId, toIndex });
      saveAndNotify(projectId, result);
      return { content: [{ type: 'text', text: 'Column moved' }] };
    },
  );
};

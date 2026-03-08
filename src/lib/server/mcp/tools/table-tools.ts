import { z } from 'zod';
import type { RegisterFn } from './types';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { addTable, updateTable, deleteTable, deleteTables, duplicateTable, renameGroup } from '../schema-ops';

export const registerTableTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'add_table',
    'Add a new table. Returns {tableId, name}. By default creates an auto-increment PK "id" column (set withPk=false to skip). Position is auto-calculated to avoid overlap. For creating many tables at once, use bulk_add_tables instead.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).optional().describe('Table name (auto-generated if omitted)'),
      comment: z.string().max(4096).optional().describe('Table comment'),
      color: z.enum(TABLE_COLOR_IDS as unknown as [string, ...string[]]).optional().describe('Table header color'),
      group: z.string().max(256).optional().describe('Table group name'),
      schema: z.string().max(256).optional().describe('Schema namespace (e.g. "public", "auth")'),
      withPk: z.boolean().optional().describe('Auto-create id PK column (default: true)'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addTable(schema, opts);
      mcpAudit('add_table', projectId, { name: opts.name });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ tableId: result.tableId, name: opts.name || result.schema.tables.find(t => t.id === result.tableId)?.name }) }],
      };
    },
  );

  server.tool(
    'update_table',
    'Update table properties. Only provided fields are changed; omitted fields remain unchanged. Pass empty string to clear comment, color, group, or schema.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      name: z.string().max(256).optional().describe('New table name'),
      comment: z.string().max(4096).optional().describe('New comment (empty string to clear)'),
      color: z.enum([...TABLE_COLOR_IDS, ''] as unknown as [string, ...string[]]).optional().describe('Table header color (empty string to clear)'),
      group: z.string().max(256).optional().describe('New group name (empty string to clear)'),
      schema: z.string().max(256).optional().describe('Schema namespace (empty string to remove)'),
    },
    async ({ projectId, tableId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!schema.tables.find(t => t.id === tableId)) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      const updated = updateTable(schema, tableId, patch);
      mcpAudit('update_table', projectId, { tableId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Table updated' }] };
    },
  );

  server.tool(
    'delete_table',
    'Delete a table. Automatically removes FK references from other tables pointing to it. For deleting multiple tables, use delete_tables.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID to delete'),
    },
    async ({ projectId, tableId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!schema.tables.find(t => t.id === tableId)) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      const updated = deleteTable(schema, tableId);
      mcpAudit('delete_table', projectId, { tableId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Table deleted' }] };
    },
  );

  server.tool(
    'delete_tables',
    'Delete multiple tables at once. Automatically cleans up FK references and detaches memos from deleted tables.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableIds: z.array(z.string().max(256)).min(1).max(500).describe('Array of table IDs to delete'),
    },
    async ({ projectId, tableIds }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const existing = new Set(schema.tables.map(t => t.id));
      const notFound = tableIds.filter(id => !existing.has(id));
      if (notFound.length === tableIds.length) {
        return { content: [{ type: 'text', text: 'None of the specified tables were found' }], isError: true };
      }
      const updated = deleteTables(schema, tableIds);
      mcpAudit('delete_tables', projectId, { tableIds, count: tableIds.length - notFound.length });
      saveAndNotify(projectId, updated);
      const msg = `Deleted ${tableIds.length - notFound.length} table(s)`;
      return { content: [{ type: 'text', text: notFound.length > 0 ? `${msg} (not found: ${notFound.join(', ')})` : msg }] };
    },
  );

  server.tool(
    'duplicate_table',
    'Create a copy of a table with new IDs. Columns are copied; FKs, unique keys, and indexes are NOT copied. Returns {newTableId}.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID to duplicate'),
    },
    async ({ projectId, tableId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = duplicateTable(schema, tableId);
      if (!result) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      mcpAudit('duplicate_table', projectId, { tableId, newTableId: result.newTableId });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ newTableId: result.newTableId }) }],
      };
    },
  );

  server.tool(
    'rename_group',
    'Rename a table group. All tables in the old group are moved to the new name, and group color is preserved.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      oldName: z.string().max(256).describe('Current group name'),
      newName: z.string().max(256).describe('New group name'),
    },
    async ({ projectId, oldName, newName }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = renameGroup(schema, oldName, newName);
      mcpAudit('rename_group', projectId, { oldName, newName });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Group renamed: "${oldName}" → "${newName}"` }] };
    },
  );

  server.tool(
    'update_group_color',
    'Set or clear the color of a table group',
    {
      projectId: z.string().max(256).describe('Project ID'),
      group: z.string().max(256).describe('Group name'),
      color: z.enum(TABLE_COLOR_IDS as [string, ...string[]]).optional().describe('Color ID: red, orange, amber, green, teal, blue, purple, pink, lime, cyan, indigo, rose, slate, brown. Omit to clear'),
    },
    async ({ projectId, group, color }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const groupColors = { ...(schema.groupColors ?? {}) };
      if (color) {
        groupColors[group] = color;
      } else {
        delete groupColors[group];
      }
      const updated: typeof schema = { ...schema, groupColors, updatedAt: new Date().toISOString() };
      mcpAudit('update_group_color', projectId, { group, color });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: color ? `Group "${group}" color set to ${color}` : `Group "${group}" color cleared` }] };
    },
  );
};

import { z } from 'zod';
import type { ReferentialAction } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { addForeignKey, updateForeignKey, deleteForeignKey } from '../schema-ops';

export const registerFkTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'add_foreign_key',
    'Add a FK from source table columns to referenced table columns. Returns {fkId}. Supports composite FKs (multiple column pairs). Defaults: onDelete=RESTRICT, onUpdate=RESTRICT. Column IDs must exist in their respective tables.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Source table ID'),
      columnIds: z.array(z.string().max(256)).max(100).describe('Source column IDs'),
      referencedTableId: z.string().max(256).describe('Referenced table ID'),
      referencedColumnIds: z.array(z.string().max(256)).max(100).describe('Referenced column IDs'),
      onDelete: z.enum(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']).optional().describe('ON DELETE action'),
      onUpdate: z.enum(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']).optional().describe('ON UPDATE action'),
    },
    async ({ projectId, tableId, columnIds, referencedTableId, referencedColumnIds, onDelete, onUpdate }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const srcTable = schema.tables.find(t => t.id === tableId);
      const refTable = schema.tables.find(t => t.id === referencedTableId);
      if (srcTable) {
        for (const colId of columnIds) {
          if (!srcTable.columns.find(c => c.id === colId)) {
            return { content: [{ type: 'text', text: `Column ${colId} not found in source table` }], isError: true };
          }
        }
      }
      if (refTable) {
        for (const colId of referencedColumnIds) {
          if (!refTable.columns.find(c => c.id === colId)) {
            return { content: [{ type: 'text', text: `Column ${colId} not found in referenced table` }], isError: true };
          }
        }
      }
      const result = addForeignKey(schema, tableId, {
        columnIds,
        referencedTableId,
        referencedColumnIds,
        onDelete: onDelete as ReferentialAction | undefined,
        onUpdate: onUpdate as ReferentialAction | undefined,
      });
      if (!result) {
        return { content: [{ type: 'text', text: 'Table not found' }], isError: true };
      }
      mcpAudit('add_foreign_key', projectId, { tableId, referencedTableId });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ fkId: result.fkId }) }],
      };
    },
  );

  server.tool(
    'update_foreign_key',
    'Update an existing FK. Can change column mappings, referenced table, or referential actions (CASCADE, SET NULL, RESTRICT, NO ACTION). Only provided fields are changed.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID containing the FK'),
      fkId: z.string().max(256).describe('Foreign key ID to update'),
      columnIds: z.array(z.string().max(256)).max(100).optional().describe('New source column IDs'),
      referencedTableId: z.string().max(256).optional().describe('New referenced table ID'),
      referencedColumnIds: z.array(z.string().max(256)).max(100).optional().describe('New referenced column IDs'),
      onDelete: z.enum(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']).optional().describe('ON DELETE action'),
      onUpdate: z.enum(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']).optional().describe('ON UPDATE action'),
      label: z.string().max(256).optional().describe('Relationship label displayed on the FK line (e.g. "places", "belongs to")'),
    },
    async ({ projectId, tableId, fkId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = updateForeignKey(schema, tableId, fkId, patch as Parameters<typeof updateForeignKey>[3]);
      if (!result) {
        return { content: [{ type: 'text', text: 'Table or foreign key not found' }], isError: true };
      }
      mcpAudit('update_foreign_key', projectId, { tableId, fkId });
      saveAndNotify(projectId, result);
      return { content: [{ type: 'text', text: 'Foreign key updated' }] };
    },
  );

  server.tool(
    'delete_foreign_key',
    'Delete a foreign key from a table',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      fkId: z.string().max(256).describe('Foreign key ID to delete'),
    },
    async ({ projectId, tableId, fkId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.foreignKeys.find(fk => fk.id === fkId)) {
        return { content: [{ type: 'text', text: `Foreign key ${fkId} not found` }], isError: true };
      }
      const updated = deleteForeignKey(schema, tableId, fkId);
      mcpAudit('delete_foreign_key', projectId, { tableId, fkId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Foreign key deleted' }] };
    },
  );
};

import { z } from 'zod';
import { COLUMN_TYPES } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { addTable, addColumn } from '../schema-ops';

export const registerBulkTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'bulk_add_tables',
    'Create multiple tables at once, each with optional columns and properties. Returns array of {name, tableId}. Much more efficient than calling add_table + add_column individually. Max 100 tables per call.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tables: z.array(z.object({
        name: z.string().max(256).describe('Table name'),
        comment: z.string().max(4096).optional().describe('Table comment'),
        color: z.enum(TABLE_COLOR_IDS as [string, ...string[]]).optional().describe('Table header color'),
        group: z.string().max(256).optional().describe('Group name'),
        schema: z.string().max(256).optional().describe('Schema namespace'),
        withPk: z.boolean().optional().describe('Add default PK column (default: true)'),
        columns: z.array(z.object({
          name: z.string().max(256).describe('Column name'),
          type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('Column type'),
          length: z.number().optional().describe('Column length'),
          scale: z.number().optional().describe('Decimal scale'),
          nullable: z.boolean().optional().describe('Allow NULL'),
          primaryKey: z.boolean().optional().describe('Primary key'),
          unique: z.boolean().optional().describe('Unique'),
          autoIncrement: z.boolean().optional().describe('Auto increment'),
          defaultValue: z.string().max(1024).optional().describe('Default value'),
          comment: z.string().max(4096).optional().describe('Column comment'),
          enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
          check: z.string().max(1024).optional().describe('CHECK constraint'),
          domainId: z.string().max(256).optional().describe('Domain ID'),
        })).optional().describe('Columns to add after creation'),
      })).min(1).max(100).describe('Array of tables to create'),
    },
    async ({ projectId, tables: tableDefs }) => {
      requireAccess(projectId, 'editor');
      let schema = getSchemaOrFail(projectId);
      const created: { name: string; tableId: string }[] = [];

      for (const def of tableDefs) {
        const result = addTable(schema, {
          name: def.name,
          comment: def.comment,
          color: def.color,
          group: def.group,
          schema: def.schema,
          withPk: def.withPk,
        });
        schema = result.schema;
        created.push({ name: def.name, tableId: result.tableId });

        if (def.columns) {
          for (const col of def.columns) {
            const colResult = addColumn(schema, result.tableId, col as any);
            if (colResult) schema = colResult.schema;
          }
        }
      }

      mcpAudit('bulk_add_tables', projectId, { count: created.length });
      saveAndNotify(projectId, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ created }) }],
      };
    },
  );

  server.tool(
    'bulk_add_columns',
    'Add multiple columns to a table in a single call. Returns array of {name, columnId}. Max 200 columns per call. More efficient than calling add_column individually.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columns: z.array(z.object({
        name: z.string().max(256).optional().describe('Column name'),
        type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('Column type'),
        length: z.number().optional().describe('Column length'),
        scale: z.number().optional().describe('Decimal scale'),
        nullable: z.boolean().optional().describe('Allow NULL'),
        primaryKey: z.boolean().optional().describe('Primary key'),
        unique: z.boolean().optional().describe('Unique'),
        autoIncrement: z.boolean().optional().describe('Auto increment'),
        defaultValue: z.string().max(1024).optional().describe('Default value'),
        comment: z.string().max(4096).optional().describe('Column comment'),
        enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
        check: z.string().max(1024).optional().describe('CHECK constraint'),
        domainId: z.string().max(256).optional().describe('Domain ID'),
      })).min(1).max(200).describe('Array of columns to add'),
    },
    async ({ projectId, tableId, columns }) => {
      requireAccess(projectId, 'editor');
      let schema = getSchemaOrFail(projectId);
      if (!schema.tables.find(t => t.id === tableId)) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      const created: { name?: string; columnId: string }[] = [];
      for (const col of columns) {
        const result = addColumn(schema, tableId, col as any);
        if (result) {
          schema = result.schema;
          created.push({ name: col.name, columnId: result.columnId });
        }
      }
      mcpAudit('bulk_add_columns', projectId, { tableId, count: created.length });
      saveAndNotify(projectId, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ created }) }],
      };
    },
  );
};

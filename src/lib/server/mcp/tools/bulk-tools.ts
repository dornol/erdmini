import { z } from 'zod';
import { COLUMN_TYPES } from '$lib/types/erd';
import type { ERDSchema } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import {
  addTable, addColumn,
  bulkUpdateTables, bulkUpdateColumns,
  bulkAssignDomainByName, bulkAssignDomainByPattern, bulkAssignDomainByList,
} from '../schema-ops';

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

  server.tool(
    'bulk_update_tables',
    'Update properties of multiple tables at once. Each entry specifies a tableId and the fields to change. Only provided fields are modified. Pass empty string to clear comment/color/group/schema. Max 500 tables per call.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      updates: z.array(z.object({
        tableId: z.string().max(256).describe('Table ID'),
        name: z.string().max(256).optional().describe('New table name'),
        comment: z.string().max(4096).optional().describe('New comment (empty string to clear)'),
        color: z.enum([...TABLE_COLOR_IDS, ''] as unknown as [string, ...string[]]).optional().describe('Table header color (empty string to clear)'),
        group: z.string().max(256).optional().describe('Group name (empty string to clear)'),
        schema: z.string().max(256).optional().describe('Schema namespace (empty string to remove)'),
      })).min(1).max(500).describe('Array of table updates'),
    },
    async ({ projectId, updates }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = bulkUpdateTables(schema, updates);

      if (result.updated === 0) {
        return { content: [{ type: 'text', text: 'None of the specified tables were found' }], isError: true };
      }

      mcpAudit('bulk_update_tables', projectId, { count: result.updated });
      saveAndNotify(projectId, result.schema);
      const msg = `Updated ${result.updated} table(s)`;
      return { content: [{ type: 'text', text: result.notFound.length > 0 ? `${msg} (not found: ${result.notFound.join(', ')})` : msg }] };
    },
  );

  server.tool(
    'bulk_update_columns',
    'Update properties of multiple columns across different tables in a single call. Each entry specifies tableId + columnId and the fields to change. Only provided fields are modified. Set domainId to empty string to unlink domain. Max 500 columns per call.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      updates: z.array(z.object({
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
        domainId: z.string().max(256).optional().describe('Domain ID to link (empty string to unlink)'),
      })).min(1).max(500).describe('Array of column updates'),
    },
    async ({ projectId, updates }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = bulkUpdateColumns(schema, updates);

      if (result.updated === 0) {
        return { content: [{ type: 'text', text: 'None of the specified columns were found' }], isError: true };
      }

      mcpAudit('bulk_update_columns', projectId, { count: result.updated });
      saveAndNotify(projectId, result.schema);
      const msg = `Updated ${result.updated} column(s)`;
      return { content: [{ type: 'text', text: result.notFound.length > 0 ? `${msg} (not found: ${result.notFound.join(', ')})` : msg }] };
    },
  );

  server.tool(
    'bulk_assign_domain',
    'Assign a domain to multiple columns matching a column name pattern, or to explicit column references. Use search_columns first to preview which columns will be affected. Set domainId to empty string to unlink. Max 1000 columns affected per call.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID to assign (empty string to unlink)'),
      columnName: z.string().max(256).optional().describe('Exact column name to match across all tables (e.g. "user_id", "created_at")'),
      columnNamePattern: z.string().max(256).optional().describe('Regex pattern to match column names (e.g. ".*_id$", "^email")'),
      columns: z.array(z.object({
        tableId: z.string().max(256).describe('Table ID'),
        columnId: z.string().max(256).describe('Column ID'),
      })).max(1000).optional().describe('Explicit list of columns (overrides name/pattern matching)'),
    },
    async ({ projectId, domainId, columnName, columnNamePattern, columns: explicitColumns }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);

      // Validate domain exists (unless unlinking)
      if (domainId && !(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }

      let result: { schema: ERDSchema; updated: number };

      if (explicitColumns && explicitColumns.length > 0) {
        result = bulkAssignDomainByList(schema, domainId, explicitColumns);
      } else if (columnName) {
        result = bulkAssignDomainByName(schema, domainId, columnName);
      } else if (columnNamePattern) {
        let regex: RegExp;
        try {
          regex = new RegExp(columnNamePattern);
        } catch {
          return { content: [{ type: 'text', text: `Invalid regex pattern: ${columnNamePattern}` }], isError: true };
        }
        result = bulkAssignDomainByPattern(schema, domainId, regex);
      } else {
        return { content: [{ type: 'text', text: 'Specify columnName, columnNamePattern, or columns' }], isError: true };
      }

      if (result.updated === 0) {
        return { content: [{ type: 'text', text: 'No matching columns found' }], isError: true };
      }

      mcpAudit('bulk_assign_domain', projectId, { domainId, count: result.updated });
      saveAndNotify(projectId, result.schema);
      return { content: [{ type: 'text', text: `Domain ${domainId ? 'assigned' : 'unlinked'} on ${result.updated} column(s)` }] };
    },
  );
};

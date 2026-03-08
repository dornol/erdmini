import { z } from 'zod';
import type { RegisterFn } from './types';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { TABLE_TEMPLATES } from '$lib/utils/table-templates';
import { addTable, addColumn } from '../schema-ops';

export const registerTemplateTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'list_table_templates',
    'List available table templates (users, audit_log, settings, files, tags). Each template has predefined columns with appropriate types and constraints.',
    {},
    async () => {
      const templates = TABLE_TEMPLATES.map(t => ({
        id: t.id,
        tableName: t.tableName,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          ...(c.length ? { length: c.length } : {}),
          ...(c.primaryKey ? { primaryKey: true } : {}),
          ...(c.unique ? { unique: true } : {}),
          ...(c.autoIncrement ? { autoIncrement: true } : {}),
          ...(c.nullable === false ? { nullable: false } : {}),
          ...(c.defaultValue ? { defaultValue: c.defaultValue } : {}),
        })),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(templates, null, 2) }] };
    },
  );

  server.tool(
    'create_table_from_template',
    'Create a table from a predefined template (users, audit_log, settings, files, tags). Automatically adds columns with proper types, constraints, and defaults. Use list_table_templates to see available templates.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      templateId: z.enum(['users', 'audit_log', 'settings', 'files', 'tags']).describe('Template ID'),
      tableName: z.string().max(256).optional().describe('Override table name (default: template name)'),
      schema: z.string().max(256).optional().describe('Schema namespace'),
      group: z.string().max(256).optional().describe('Group name'),
      color: z.enum(TABLE_COLOR_IDS as [string, ...string[]]).optional().describe('Table header color'),
    },
    async ({ projectId, templateId, tableName, schema: schemaName, group, color }) => {
      requireAccess(projectId, 'editor');
      let schema = getSchemaOrFail(projectId);
      const template = TABLE_TEMPLATES.find(t => t.id === templateId);
      if (!template) {
        return { content: [{ type: 'text', text: `Template "${templateId}" not found` }], isError: true };
      }

      const name = tableName || template.tableName;
      const result = addTable(schema, {
        name,
        comment: undefined,
        color,
        group,
        schema: schemaName,
        withPk: false,
      });
      schema = result.schema;

      for (const col of template.columns) {
        const colResult = addColumn(schema, result.tableId, {
          name: col.name,
          type: col.type,
          length: col.length,
          scale: col.scale,
          nullable: col.nullable,
          primaryKey: col.primaryKey,
          unique: col.unique,
          autoIncrement: col.autoIncrement,
          defaultValue: col.defaultValue,
          comment: col.comment,
          enumValues: col.enumValues,
          check: col.check,
        } as any);
        if (colResult) schema = colResult.schema;
      }

      mcpAudit('create_table_from_template', projectId, { templateId, tableId: result.tableId, name });
      saveAndNotify(projectId, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ tableId: result.tableId, name, templateId, columnCount: template.columns.length }) }],
      };
    },
  );
};

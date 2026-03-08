import { z } from 'zod';
import type { RegisterFn } from './types';
import { listUserProjects } from '../db-helpers';

export const registerReadTools: RegisterFn = (server, ctx) => {
  const { db, keyInfo, requireAccess, getSchemaOrFail } = ctx;

  server.tool(
    'list_projects',
    'List all ERD projects accessible to the authenticated user. Returns array of {id, name, updatedAt}. Use get_project_by_name for name-based search. Use the project ID from results to call other tools.',
    {},
    async () => {
      const projects = listUserProjects(db, keyInfo.userId, keyInfo.userRole, keyInfo.scopes);
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
      };
    },
  );

  server.tool(
    'get_schema',
    'Get the full ERD schema JSON for a project. Returns complete schema with all tables, columns, foreignKeys, domains, memos, schemas. WARNING: Can be very large for big schemas — prefer get_schema_summary or list_tables for overview.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }],
      };
    },
  );

  server.tool(
    'get_schema_summary',
    'Get a high-level summary: table/column/FK/index counts, group names, domain list. Best starting point to understand a project before diving into details.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const tables = schema.tables;
      const groups = [...new Set(tables.map(t => t.group || ''))];
      const summary = {
        tableCount: tables.length,
        columnCount: tables.reduce((sum, t) => sum + t.columns.length, 0),
        fkCount: tables.reduce((sum, t) => sum + t.foreignKeys.length, 0),
        indexCount: tables.reduce((sum, t) => sum + t.indexes.length, 0),
        groups: groups.filter(g => g !== '').sort(),
        domains: schema.domains.map(d => ({ id: d.id, name: d.name, type: d.type })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    'list_tables',
    'List tables with summary info (id, name, schema, group, color, columnCount, fkCount, pkColumns). Does NOT include full column data — use get_table for that. Supports group and schema filters.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      group: z.string().max(256).optional().describe('Filter by group name (exact match)'),
      schema: z.string().max(256).optional().describe('Filter by schema name (exact match)'),
    },
    async ({ projectId, group, schema: schemaFilter }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      let tables = schema.tables;
      if (group !== undefined) {
        tables = tables.filter(t => (t.group || '') === group);
      }
      if (schemaFilter !== undefined) {
        tables = tables.filter(t => (t.schema || '') === schemaFilter);
      }
      const result = tables.map(t => ({
        id: t.id,
        name: t.name,
        schema: t.schema || null,
        comment: t.comment || null,
        group: t.group || null,
        color: t.color || null,
        columnCount: t.columns.length,
        fkCount: t.foreignKeys.length,
        pkColumns: t.columns.filter(c => c.primaryKey).map(c => c.name),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_schemas',
    'List all schema namespaces defined in a project, with table and memo counts',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const defined = schema.schemas ?? [];
      const result = defined.map(name => ({
        name,
        tableCount: schema.tables.filter(t => t.schema === name).length,
        memoCount: (schema.memos ?? []).filter(m => m.schema === name).length,
        tableNames: schema.tables.filter(t => t.schema === name).map(t => t.name),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_table',
    'Get full details of a single table: all columns (with type, PK, FK, domain info), foreignKeys, uniqueKeys, indexes. Look up by ID or name. Returns the complete Table object.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).optional().describe('Table ID (provide tableId or tableName)'),
      tableName: z.string().max(256).optional().describe('Table name (provide tableId or tableName)'),
    },
    async ({ projectId, tableId, tableName }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      if (!tableId && !tableName) {
        return { content: [{ type: 'text', text: 'Provide either tableId or tableName' }], isError: true };
      }
      const table = tableId
        ? schema.tables.find(t => t.id === tableId)
        : schema.tables.find(t => t.name.toLowerCase() === tableName!.toLowerCase());
      if (!table) {
        return { content: [{ type: 'text', text: `Table not found: ${tableId || tableName}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(table, null, 2) }] };
    },
  );

  server.tool(
    'list_groups',
    'List groups with table counts and table names',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const groupMap = new Map<string, string[]>();
      for (const t of schema.tables) {
        const g = t.group || '(ungrouped)';
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push(t.name);
      }
      const result = [...groupMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([group, names]) => ({ group, tableCount: names.length, tableNames: names }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
};

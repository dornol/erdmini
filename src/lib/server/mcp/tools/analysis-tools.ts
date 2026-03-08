import { z } from 'zod';
import type { ERDSchema, Table } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { lintSchema } from '$lib/utils/schema-lint';
import { computeLayout, type LayoutType } from '$lib/utils/auto-layout';
import { listUserProjects } from '../db-helpers';

export const registerAnalysisTools: RegisterFn = (server, ctx) => {
  const { db, keyInfo, requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'lint_schema',
    'Run schema lint: checks for missing PKs, orphan FK targets, SET NULL on NOT NULL columns, duplicate names, circular FKs, empty tables, domain hierarchy cycles. Returns array of {rule, severity, message, tableId, tableName}.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const issues = lintSchema(schema);
      return {
        content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }],
      };
    },
  );

  server.tool(
    'auto_layout',
    'Automatically arrange all tables on the canvas. Algorithms: grid (rows/cols), hierarchical (FK-based tree with barycenter), radial (force-directed). Set groupByGroup=true to cluster by group.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      type: z.enum(['grid', 'hierarchical', 'radial']).describe('Layout algorithm'),
      groupByGroup: z.boolean().optional().describe('Layout groups separately (default: false)'),
    },
    async ({ projectId, type, groupByGroup }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const positions = computeLayout(schema.tables, type as LayoutType, { groupByGroup });
      const tables: Table[] = schema.tables.map(t => {
        const pos = positions.get(t.id);
        return pos ? { ...t, position: pos } : t;
      });
      const updated: ERDSchema = { ...schema, tables, updatedAt: new Date().toISOString() };
      mcpAudit('auto_layout', projectId, { type, groupByGroup });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Layout applied: ${type} (${tables.length} tables)` }] };
    },
  );

  server.tool(
    'get_project_by_name',
    'Find projects by name (case-insensitive partial match). Returns matching projects with IDs. Use this when you know the project name but not its ID.',
    {
      name: z.string().max(256).describe('Project name to search for'),
    },
    async ({ name }) => {
      const projects = listUserProjects(db, keyInfo.userId, keyInfo.userRole, keyInfo.scopes);
      const lower = name.toLowerCase();
      const matches = projects.filter((p: any) => p.name?.toLowerCase().includes(lower));
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: 'No projects found matching that name' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    },
  );

  server.tool(
    'get_table_by_name',
    'Find tables by name within a project. Returns matching tables with columns, FK counts, and metadata. Default is partial match; set exact=true for exact match.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Table name to search for'),
      exact: z.boolean().optional().describe('Exact match only (default: false, partial match)'),
    },
    async ({ projectId, name, exact }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const lower = name.toLowerCase();
      const matches = exact
        ? schema.tables.filter(t => t.name.toLowerCase() === lower)
        : schema.tables.filter(t => t.name.toLowerCase().includes(lower));
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `No tables found matching '${name}'` }], isError: true };
      }
      const results = matches.map(t => ({
        id: t.id,
        name: t.name,
        columns: t.columns.map(c => ({ id: c.id, name: c.name, type: c.type, primaryKey: c.primaryKey })),
        foreignKeyCount: t.foreignKeys.length,
        uniqueKeyCount: (t.uniqueKeys || []).length,
        indexCount: (t.indexes || []).length,
        group: t.group,
        schema: t.schema,
        comment: t.comment,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'search_columns',
    'Search columns across ALL tables. Filter by name (partial match), type, domainId, or hasNoDomain. Returns {tableName, tableId, columnId, columnName, type, domainId} for each match.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).optional().describe('Column name pattern (case-insensitive partial match)'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('Filter by column type'),
      domainId: z.string().max(256).optional().describe('Filter by domain ID'),
      hasNoDomain: z.boolean().optional().describe('Only columns without a domain'),
    },
    async ({ projectId, name, type, domainId, hasNoDomain }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const results: { tableName: string; tableId: string; columnId: string; columnName: string; type: string; domainId?: string }[] = [];
      const lowerName = name?.toLowerCase();

      for (const table of schema.tables) {
        for (const col of table.columns) {
          if (lowerName && !col.name.toLowerCase().includes(lowerName)) continue;
          if (type && col.type !== type) continue;
          if (domainId && col.domainId !== domainId) continue;
          if (hasNoDomain && col.domainId) continue;
          results.push({
            tableName: table.name,
            tableId: table.id,
            columnId: col.id,
            columnName: col.name,
            type: col.type,
            domainId: col.domainId,
          });
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ count: results.length, columns: results }, null, 2) }],
      };
    },
  );

  server.tool(
    'find_orphan_tables',
    'Find tables with no FK connections — neither having FKs nor being referenced by other tables. Useful for identifying isolated tables that may need relationships.',
    {
      projectId: z.string().max(256).describe('Project ID'),
    },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);

      const connectedIds = new Set<string>();
      for (const table of schema.tables) {
        if (table.foreignKeys.length > 0) {
          connectedIds.add(table.id);
          for (const fk of table.foreignKeys) {
            connectedIds.add(fk.referencedTableId);
          }
        }
      }

      const orphans = schema.tables
        .filter(t => !connectedIds.has(t.id))
        .map(t => ({ id: t.id, name: t.name, columnCount: t.columns.length, group: t.group, schema: t.schema }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ count: orphans.length, tables: orphans }, null, 2) }],
      };
    },
  );
};

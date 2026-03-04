import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';

import type { ResolvedApiKey } from '$lib/server/auth/api-key';
import { checkAccess, getSchema, saveSchema, listUserProjects } from './db-helpers';
import { addTable, updateTable, deleteTable, addColumn, updateColumn, deleteColumn, addForeignKey, deleteForeignKey, addMemo, updateMemo, deleteMemo, addDomain, updateDomain, deleteDomain, suggestDomains } from './schema-ops';
import { exportDDL, type DDLExportOptions } from '$lib/utils/ddl-export';
import { lintSchema } from '$lib/utils/schema-lint';
import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';
import { importDDL } from '$lib/utils/ddl-import';
import type { ColumnDomain, Dialect, ERDSchema, ReferentialAction } from '$lib/types/erd';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { notifyCollabSchemaChange } from '$lib/server/collab-notify';
import { exportDictionaryMarkdown, exportDictionaryHtml } from '$lib/utils/domain-dictionary';
import { computeCoverageStats } from '$lib/utils/domain-analysis';
import { resolveEffectiveDomain, getDescendantIds } from '$lib/utils/domain-hierarchy';

export function createMcpServer(
  db: Database.Database,
  keyInfo: ResolvedApiKey,
): McpServer {
  const server = new McpServer({
    name: 'erdmini',
    version: '1.0.0',
  });

  function requireAccess(projectId: string, level: 'viewer' | 'editor' | 'owner'): void {
    if (!checkAccess(db, projectId, keyInfo.userId, keyInfo.userRole, level, keyInfo.scopes)) {
      throw new Error(`Access denied: requires '${level}' permission on project ${projectId}`);
    }
  }

  function saveAndNotify(projectId: string, schema: ERDSchema): void {
    saveSchema(db, projectId, schema);
    notifyCollabSchemaChange(projectId, schema, 'mcp');
  }

  // ==================
  // READ TOOLS
  // ==================

  server.tool(
    'list_projects',
    'List all ERD projects accessible to the authenticated user',
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
    'Get the full ERD schema JSON for a project',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }],
      };
    },
  );

  server.tool(
    'get_schema_summary',
    'Get a high-level summary of a project schema (table/column/FK/index counts, groups, domains)',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
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
    'List tables with summary info (no full column data). Optionally filter by group.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      group: z.string().max(256).optional().describe('Filter by group name (exact match)'),
      schema: z.string().max(256).optional().describe('Filter by schema name (exact match)'),
    },
    async ({ projectId, group, schema: schemaFilter }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
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
    'Get full details of a single table by ID or name (columns, foreignKeys, uniqueKeys, indexes)',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).optional().describe('Table ID (provide tableId or tableName)'),
      tableName: z.string().max(256).optional().describe('Table name (provide tableId or tableName)'),
    },
    async ({ projectId, tableId, tableName }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
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

  server.tool(
    'export_ddl',
    'Export DDL SQL for a project schema (supports mysql, postgresql, mariadb, mssql)',
    {
      projectId: z.string().max(256).describe('Project ID'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql']).describe('SQL dialect'),
      includeComments: z.boolean().optional().describe('Include comments in DDL'),
      includeForeignKeys: z.boolean().optional().describe('Include FK constraints'),
      includeIndexes: z.boolean().optional().describe('Include indexes'),
      includeDomains: z.boolean().optional().describe('Include domain comments on columns'),
      upperCaseKeywords: z.boolean().optional().describe('Uppercase SQL keywords'),
    },
    async ({ projectId, dialect, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const options: Partial<DDLExportOptions> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;
      if (opts.includeDomains !== undefined) options.includeDomains = opts.includeDomains;
      if (opts.upperCaseKeywords !== undefined) options.upperCaseKeywords = opts.upperCaseKeywords;

      const ddl = exportDDL(schema, dialect as Dialect, options);
      return { content: [{ type: 'text', text: ddl }] };
    },
  );

  server.tool(
    'lint_schema',
    'Run schema lint validation and return issues',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const issues = lintSchema(schema);
      return {
        content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }],
      };
    },
  );

  server.tool(
    'export_diagram',
    'Export ERD as Mermaid or PlantUML diagram',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['mermaid', 'plantuml']).describe('Diagram format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const diagram = format === 'mermaid' ? exportMermaid(schema) : exportPlantUML(schema);
      return { content: [{ type: 'text', text: diagram }] };
    },
  );

  // ==================
  // WRITE TOOLS
  // ==================

  server.tool(
    'add_table',
    'Add a new table to the ERD schema',
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const result = addTable(schema, opts);
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ tableId: result.tableId, name: opts.name || result.schema.tables.find(t => t.id === result.tableId)?.name }) }],
      };
    },
  );

  server.tool(
    'update_table',
    'Update table properties (name, comment, color, group, schema)',
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      if (!schema.tables.find(t => t.id === tableId)) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      const updated = updateTable(schema, tableId, patch);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Table updated' }] };
    },
  );

  server.tool(
    'delete_table',
    'Delete a table and clean up FK references',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID to delete'),
    },
    async ({ projectId, tableId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      if (!schema.tables.find(t => t.id === tableId)) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      const updated = deleteTable(schema, tableId);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Table deleted' }] };
    },
  );

  server.tool(
    'add_column',
    'Add a column to a table',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      name: z.string().max(256).optional().describe('Column name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).optional().describe('Column type'),
      length: z.number().optional().describe('Column length'),
      scale: z.number().optional().describe('Decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique constraint'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      comment: z.string().max(4096).optional().describe('Column comment'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
    },
    async ({ projectId, tableId, ...colOpts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const result = addColumn(schema, tableId, colOpts as any);
      if (!result) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ columnId: result.columnId }) }],
      };
    },
  );

  server.tool(
    'update_column',
    'Update column properties',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnId: z.string().max(256).describe('Column ID'),
      name: z.string().max(256).optional().describe('New column name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).optional().describe('New column type'),
      length: z.number().optional().describe('New length'),
      scale: z.number().optional().describe('New decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      comment: z.string().max(4096).optional().describe('Column comment'),
    },
    async ({ projectId, tableId, columnId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.columns.find(c => c.id === columnId)) {
        return { content: [{ type: 'text', text: `Column ${columnId} not found` }], isError: true };
      }
      const updated = updateColumn(schema, tableId, columnId, patch as any);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Column updated' }] };
    },
  );

  server.tool(
    'delete_column',
    'Delete a column and clean up FK/UQ references',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableId: z.string().max(256).describe('Table ID'),
      columnId: z.string().max(256).describe('Column ID to delete'),
    },
    async ({ projectId, tableId, columnId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.columns.find(c => c.id === columnId)) {
        return { content: [{ type: 'text', text: `Column ${columnId} not found` }], isError: true };
      }
      const updated = deleteColumn(schema, tableId, columnId);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Column deleted' }] };
    },
  );

  server.tool(
    'add_foreign_key',
    'Add a foreign key relationship between tables',
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
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
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ fkId: result.fkId }) }],
      };
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
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const table = schema.tables.find(t => t.id === tableId);
      if (!table) {
        return { content: [{ type: 'text', text: `Table ${tableId} not found` }], isError: true };
      }
      if (!table.foreignKeys.find(fk => fk.id === fkId)) {
        return { content: [{ type: 'text', text: `Foreign key ${fkId} not found` }], isError: true };
      }
      const updated = deleteForeignKey(schema, tableId, fkId);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Foreign key deleted' }] };
    },
  );

  server.tool(
    'update_group_color',
    'Set or clear the color of a table group',
    {
      projectId: z.string().max(256).describe('Project ID'),
      group: z.string().max(256).describe('Group name'),
      color: z.string().max(32).optional().describe('CSS color value (e.g. "#ff6600"). Omit or empty string to clear'),
    },
    async ({ projectId, group, color }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const groupColors = { ...(schema.groupColors ?? {}) };
      if (color) {
        groupColors[group] = color;
      } else {
        delete groupColors[group];
      }
      const updated: typeof schema = { ...schema, groupColors, updatedAt: new Date().toISOString() };
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: color ? `Group "${group}" color set to ${color}` : `Group "${group}" color cleared` }] };
    },
  );

  server.tool(
    'import_ddl',
    'Import DDL SQL to create/update tables in a project',
    {
      projectId: z.string().max(256).describe('Project ID'),
      sql: z.string().max(1048576).describe('DDL SQL statements'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql']).optional().describe('SQL dialect (default: mysql)'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, sql, dialect, replace }) => {
      requireAccess(projectId, 'editor');
      const result = await importDDL(sql, (dialect || 'mysql') as Dialect);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      let schema = getSchema(db, projectId);
      if (!schema || replace) {
        schema = {
          version: '1',
          tables: result.tables,
          domains: [],
          memos: [],
          groupColors: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const existingNames = new Set(schema.tables.map(t => t.name.toLowerCase()));
        const newTables = result.tables.filter(t => !existingNames.has(t.name.toLowerCase()));
        schema.tables = [...schema.tables, ...newTables];
        schema.updatedAt = new Date().toISOString();
      }

      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} table(s)`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );

  // ==================
  // MEMO TOOLS
  // ==================

  server.tool(
    'list_memos',
    'List all memos in a project with summary info',
    {
      projectId: z.string().max(256).describe('Project ID'),
      schema: z.string().max(256).optional().describe('Filter by schema namespace'),
    },
    async ({ projectId, schema: schemaFilter }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      let memoList = schema.memos ?? [];
      if (schemaFilter !== undefined) {
        memoList = memoList.filter(m => (m.schema || '') === schemaFilter);
      }
      const memos = memoList.map(m => ({
        id: m.id,
        schema: m.schema || null,
        content: m.content.length > 100 ? m.content.slice(0, 100) + '...' : m.content,
        color: m.color ?? 'yellow',
        locked: m.locked ?? false,
        position: m.position,
        width: m.width,
        height: m.height,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(memos, null, 2) }] };
    },
  );

  server.tool(
    'add_memo',
    'Add a new sticky memo to the ERD canvas',
    {
      projectId: z.string().max(256).describe('Project ID'),
      content: z.string().max(10000).optional().describe('Memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange']).optional().describe('Memo color'),
      schema: z.string().max(256).optional().describe('Schema namespace to assign this memo to'),
      x: z.number().optional().describe('X position on canvas'),
      y: z.number().optional().describe('Y position on canvas'),
      width: z.number().optional().describe('Memo width (default: 200)'),
      height: z.number().optional().describe('Memo height (default: 150)'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const result = addMemo(schema, opts);
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ memoId: result.memoId }) }],
      };
    },
  );

  server.tool(
    'update_memo',
    'Update memo properties (content, color, position, size, locked)',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
      content: z.string().max(10000).optional().describe('New memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange', '']).optional().describe('New color (empty string to reset to yellow)'),
      x: z.number().optional().describe('New X position'),
      y: z.number().optional().describe('New Y position'),
      width: z.number().optional().describe('New width'),
      height: z.number().optional().describe('New height'),
      locked: z.boolean().optional().describe('Lock/unlock the memo'),
    },
    async ({ projectId, memoId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = updateMemo(schema, memoId, patch);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo updated' }] };
    },
  );

  server.tool(
    'delete_memo',
    'Delete a memo from the ERD canvas',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID to delete'),
    },
    async ({ projectId, memoId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = deleteMemo(schema, memoId);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo deleted' }] };
    },
  );

  // ==================
  // DOMAIN TOOLS
  // ==================

  server.tool(
    'list_domains',
    'List all column domains in a project with usage counts',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      // Compute usage count per domain
      const usageMap = new Map<string, number>();
      for (const t of schema.tables) {
        for (const c of t.columns) {
          if (c.domainId) usageMap.set(c.domainId, (usageMap.get(c.domainId) ?? 0) + 1);
        }
      }
      const result = (schema.domains ?? []).map(d => ({
        ...d,
        usageCount: usageMap.get(d.id) ?? 0,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_domain',
    'Get full details of a domain by ID or name, including linked columns',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).optional().describe('Domain ID (provide domainId or domainName)'),
      domainName: z.string().max(256).optional().describe('Domain name (provide domainId or domainName)'),
    },
    async ({ projectId, domainId, domainName }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      if (!domainId && !domainName) {
        return { content: [{ type: 'text', text: 'Provide either domainId or domainName' }], isError: true };
      }
      const domain = domainId
        ? (schema.domains ?? []).find(d => d.id === domainId)
        : (schema.domains ?? []).find(d => d.name.toLowerCase() === domainName!.toLowerCase());
      if (!domain) {
        return { content: [{ type: 'text', text: `Domain not found: ${domainId || domainName}` }], isError: true };
      }
      // Find linked columns
      const linkedColumns: { tableName: string; columnName: string; columnId: string }[] = [];
      for (const t of schema.tables) {
        for (const c of t.columns) {
          if (c.domainId === domain.id) {
            linkedColumns.push({ tableName: t.name, columnName: c.name, columnId: c.id });
          }
        }
      }
      const effectiveValues = resolveEffectiveDomain(domain.id, schema.domains ?? []);
      const childDomains = (schema.domains ?? [])
        .filter(d => d.parentId === domain.id)
        .map(d => ({ id: d.id, name: d.name }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...domain, linkedColumns, effectiveValues, children: childDomains }, null, 2) }],
      };
    },
  );

  server.tool(
    'add_domain',
    'Add a new column domain (reusable column template)',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Domain name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).describe('Column type'),
      length: z.number().optional().describe('Column length'),
      scale: z.number().optional().describe('Decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL (default: false)'),
      primaryKey: z.boolean().optional().describe('Primary key (default: false)'),
      unique: z.boolean().optional().describe('Unique constraint (default: false)'),
      autoIncrement: z.boolean().optional().describe('Auto increment (default: false)'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      comment: z.string().max(4096).optional().describe('Domain comment'),
      group: z.string().max(256).optional().describe('Domain group name'),
      description: z.string().max(10000).optional().describe('Multi-line description (markdown)'),
      alias: z.string().max(256).optional().describe('Alias / display name'),
      dataStandard: z.string().max(1024).optional().describe('External standard reference'),
      example: z.string().max(1024).optional().describe('Example value'),
      validRange: z.string().max(1024).optional().describe('Valid range description'),
      owner: z.string().max(256).optional().describe('Owner / team'),
      tags: z.array(z.string().max(128)).max(50).optional().describe('Search tags'),
      parentId: z.string().max(256).optional().describe('Parent domain ID for hierarchy'),
    },
    async ({ projectId, name, type, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const domainFields: Omit<ColumnDomain, 'id'> = {
        name,
        type: type as any,
        nullable: opts.nullable ?? false,
        primaryKey: opts.primaryKey ?? false,
        unique: opts.unique ?? false,
        autoIncrement: opts.autoIncrement ?? false,
        length: opts.length,
        scale: opts.scale,
        defaultValue: opts.defaultValue,
        check: opts.check,
        enumValues: opts.enumValues,
        comment: opts.comment,
        group: opts.group,
        description: opts.description,
        alias: opts.alias,
        dataStandard: opts.dataStandard,
        example: opts.example,
        validRange: opts.validRange,
        owner: opts.owner,
        tags: opts.tags,
        parentId: opts.parentId,
      };
      const result = addDomain(schema, domainFields);
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ domainId: result.domainId, name }) }],
      };
    },
  );

  server.tool(
    'update_domain',
    'Update domain properties and propagate changes to linked columns',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID'),
      name: z.string().max(256).optional().describe('New domain name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).optional().describe('New column type'),
      length: z.number().optional().describe('New length'),
      scale: z.number().optional().describe('New decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      comment: z.string().max(4096).optional().describe('Domain comment'),
      group: z.string().max(256).optional().describe('Domain group name'),
      description: z.string().max(10000).optional().describe('Multi-line description (markdown)'),
      alias: z.string().max(256).optional().describe('Alias / display name'),
      dataStandard: z.string().max(1024).optional().describe('External standard reference'),
      example: z.string().max(1024).optional().describe('Example value'),
      validRange: z.string().max(1024).optional().describe('Valid range description'),
      owner: z.string().max(256).optional().describe('Owner / team'),
      tags: z.array(z.string().max(128)).max(50).optional().describe('Search tags'),
      parentId: z.string().max(256).optional().describe('Parent domain ID for hierarchy'),
    },
    async ({ projectId, domainId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = updateDomain(schema, domainId, patch as any);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain updated (changes propagated to linked columns)' }] };
    },
  );

  server.tool(
    'delete_domain',
    'Delete a domain and unlink all columns that reference it',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID to delete'),
    },
    async ({ projectId, domainId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = deleteDomain(schema, domainId);
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain deleted (linked columns unlinked)' }] };
    },
  );

  server.tool(
    'suggest_domains',
    'Analyze unlinked columns and suggest potential domain candidates based on type/name similarity',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const suggestions = suggestDomains(schema);
      if (suggestions.length === 0) {
        return { content: [{ type: 'text', text: 'No domain suggestions — all columns are unique or already linked to domains.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] };
    },
  );

  server.tool(
    'domain_coverage',
    'Get domain coverage statistics for a project (total columns, linked columns, coverage percentage, group breakdown)',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const stats = computeCoverageStats(schema);
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  server.tool(
    'export_domain_dictionary',
    'Export a domain data dictionary in markdown or html format',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['markdown', 'html']).describe('Output format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchema(db, projectId);
      if (!schema) {
        return { content: [{ type: 'text', text: 'Project schema not found' }], isError: true };
      }
      const ctx = { schema, projectName: projectId };
      const result = format === 'markdown'
        ? exportDictionaryMarkdown(ctx)
        : exportDictionaryHtml(ctx);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  return server;
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';

import type { ResolvedApiKey } from '$lib/server/auth/api-key';
import { logAudit } from '$lib/server/audit';
import { checkAccess, getSchema, saveSchema, listUserProjects } from './db-helpers';
import { addTable, updateTable, deleteTable, deleteTables, addColumn, updateColumn, deleteColumn, addForeignKey, deleteForeignKey, addMemo, updateMemo, deleteMemo, addDomain, updateDomain, deleteDomain, suggestDomains, updateForeignKey, addUniqueKey, deleteUniqueKey, addIndex, deleteIndex, moveColumn, duplicateTable, attachMemo, detachMemo, renameGroup, renameSchema, addSchemaNamespace, deleteSchemaNamespace } from './schema-ops';
import { exportDDL, type DDLExportOptions } from '$lib/utils/ddl-export';
import { exportPrisma } from '$lib/utils/prisma-export';
import { importPrisma } from '$lib/utils/prisma-import';
import { exportDBML } from '$lib/utils/dbml-export';
import { importDBML } from '$lib/utils/dbml-import';
import { lintSchema } from '$lib/utils/schema-lint';
import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';
import { importDDL } from '$lib/utils/ddl-import';
import type { ColumnDomain, Dialect, ERDSchema, ReferentialAction, Table } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';
import { generateId } from '$lib/utils/common';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { notifyCollabSchemaChange } from '$lib/server/collab-notify';
import { exportDictionaryMarkdown, exportDictionaryHtml } from '$lib/utils/domain-dictionary';
import { computeCoverageStats } from '$lib/utils/domain-analysis';
import { resolveEffectiveDomain, getDescendantIds } from '$lib/utils/domain-hierarchy';
import { computeLayout, type LayoutType } from '$lib/utils/auto-layout';
import { diffSchemas } from '$lib/utils/schema-diff';
import { generateMigrationSQL } from '$lib/utils/migration-sql';
import { TABLE_TEMPLATES } from '$lib/utils/table-templates';

export function createMcpServer(
  db: Database.Database,
  keyInfo: ResolvedApiKey,
): McpServer {
  const server = new McpServer({
    name: 'erdmini',
    version: '1.0.0',
  });

  function mergeOrReplaceSchema(
    projectId: string,
    importedTables: Table[],
    replace?: boolean,
  ): ERDSchema {
    const existing = getSchema(db, projectId);
    if (!existing || replace) {
      return {
        version: '1',
        tables: importedTables,
        domains: [],
        memos: [],
        groupColors: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const existingNames = new Set(existing.tables.map(t => t.name.toLowerCase()));
    const newTables = importedTables.filter(t => !existingNames.has(t.name.toLowerCase()));
    return { ...existing, tables: [...existing.tables, ...newTables], updatedAt: new Date().toISOString() };
  }

  function requireAccess(projectId: string, level: 'viewer' | 'editor' | 'owner'): void {
    if (!checkAccess(db, projectId, keyInfo.userId, keyInfo.userRole, level, keyInfo.scopes)) {
      throw new Error(`Access denied: requires '${level}' permission on project ${projectId}`);
    }
  }

  function getSchemaOrFail(projectId: string): ERDSchema {
    const schema = getSchema(db, projectId);
    if (!schema) throw new Error('Project schema not found');
    return schema;
  }

  function saveAndNotify(projectId: string, schema: ERDSchema): void {
    saveSchema(db, projectId, schema);
    notifyCollabSchemaChange(projectId, schema, 'mcp');
  }

  function mcpAudit(action: string, projectId: string, detail?: Record<string, unknown>): void {
    logAudit({
      action,
      category: 'mcp',
      userId: keyInfo.userId,
      username: keyInfo.displayName,
      resourceType: 'schema',
      resourceId: projectId,
      detail,
      source: 'mcp',
    });
  }

  // ==================
  // READ TOOLS
  // ==================

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

  server.tool(
    'export_ddl',
    'Export DDL SQL (CREATE TABLE statements) for the project. Returns raw SQL text. Supports 7 dialects with options for comments, FK constraints, indexes, domain annotations, and keyword casing.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']).describe('SQL dialect'),
      includeComments: z.boolean().optional().describe('Include comments in DDL'),
      includeForeignKeys: z.boolean().optional().describe('Include FK constraints'),
      includeIndexes: z.boolean().optional().describe('Include indexes'),
      includeDomains: z.boolean().optional().describe('Include domain comments on columns'),
      upperCaseKeywords: z.boolean().optional().describe('Uppercase SQL keywords'),
    },
    async ({ projectId, dialect, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
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
    'export_diagram',
    'Export ERD as Mermaid or PlantUML text diagram. Returns diagram source code that can be rendered by diagram tools.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['mermaid', 'plantuml']).describe('Diagram format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const diagram = format === 'mermaid' ? exportMermaid(schema) : exportPlantUML(schema);
      return { content: [{ type: 'text', text: diagram }] };
    },
  );

  // ==================
  // WRITE TOOLS
  // ==================

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
      // Validate column IDs exist
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

  server.tool(
    'import_ddl',
    'Import DDL SQL (CREATE TABLE statements) to create tables. By default merges with existing tables (skips tables with same name). Set replace=true to replace entire schema. Supports 7 SQL dialects.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      sql: z.string().max(1048576).describe('DDL SQL statements'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']).optional().describe('SQL dialect (default: mysql)'),
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

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_ddl', projectId, { dialect: dialect || 'mysql', tableCount: result.tables.length, replace: !!replace });
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
    'List all memos with summary (id, content preview, position, color, attachedTableId). Optionally filter by schema namespace.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      schema: z.string().max(256).optional().describe('Filter by schema namespace'),
    },
    async ({ projectId, schema: schemaFilter }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
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
    'Add a sticky note memo to the canvas. Returns {memoId}. Use attach_memo to pin it to a table afterward.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      content: z.string().max(10000).optional().describe('Memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange']).optional().describe('Memo color'),
      schema: z.string().max(256).optional().describe('Schema namespace to assign this memo to'),
      x: z.number().min(-100000).max(100000).optional().describe('X position on canvas'),
      y: z.number().min(-100000).max(100000).optional().describe('Y position on canvas'),
      width: z.number().min(0).max(10000).optional().describe('Memo width (default: 200)'),
      height: z.number().min(0).max(10000).optional().describe('Memo height (default: 150)'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addMemo(schema, opts);
      mcpAudit('add_memo', projectId);
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ memoId: result.memoId }) }],
      };
    },
  );

  server.tool(
    'update_memo',
    'Update memo properties. Only provided fields are changed. Set locked=true to prevent UI editing.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
      content: z.string().max(10000).optional().describe('New memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange', '']).optional().describe('New color (empty string to reset to yellow)'),
      x: z.number().min(-100000).max(100000).optional().describe('New X position'),
      y: z.number().min(-100000).max(100000).optional().describe('New Y position'),
      width: z.number().min(0).max(10000).optional().describe('New width'),
      height: z.number().min(0).max(10000).optional().describe('New height'),
      locked: z.boolean().optional().describe('Lock/unlock the memo'),
    },
    async ({ projectId, memoId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = updateMemo(schema, memoId, patch);
      mcpAudit('update_memo', projectId, { memoId });
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
      const schema = getSchemaOrFail(projectId);
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = deleteMemo(schema, memoId);
      mcpAudit('delete_memo', projectId, { memoId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo deleted' }] };
    },
  );

  // ==================
  // DOMAIN TOOLS
  // ==================

  server.tool(
    'list_domains',
    'List all column domains (reusable column templates) with usage counts showing how many columns are linked to each domain.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
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
    'Get domain details by ID or name: type, constraints, linked columns, effective values (with hierarchy inheritance), child domains.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).optional().describe('Domain ID (provide domainId or domainName)'),
      domainName: z.string().max(256).optional().describe('Domain name (provide domainId or domainName)'),
    },
    async ({ projectId, domainId, domainName }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
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
    'Create a reusable column domain (template). Returns {domainId, name}. Domains define type, constraints, and metadata that propagate to linked columns. Set parentId for domain hierarchy.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Domain name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).describe('Column type'),
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
      const schema = getSchemaOrFail(projectId);
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
      mcpAudit('add_domain', projectId, { name });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ domainId: result.domainId, name }) }],
      };
    },
  );

  server.tool(
    'update_domain',
    'Update domain properties. Changes automatically propagate to all linked columns and child domains in the hierarchy.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID'),
      name: z.string().max(256).optional().describe('New domain name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('New column type'),
      length: z.number().min(0).max(65535).optional().describe('New length'),
      scale: z.number().min(0).max(30).optional().describe('New decimal scale'),
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
      const schema = getSchemaOrFail(projectId);
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = updateDomain(schema, domainId, patch as any);
      mcpAudit('update_domain', projectId, { domainId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain updated (changes propagated to linked columns)' }] };
    },
  );

  server.tool(
    'delete_domain',
    'Delete a domain. All linked columns are unlinked. Child domains are re-parented to the deleted domain\'s parent.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID to delete'),
    },
    async ({ projectId, domainId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = deleteDomain(schema, domainId);
      mcpAudit('delete_domain', projectId, { domainId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain deleted (linked columns unlinked)' }] };
    },
  );

  server.tool(
    'suggest_domains',
    'Analyze unlinked columns and suggest domain candidates. Groups columns by matching (type, length, scale, baseName) that appear 2+ times. Sorted by frequency.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const suggestions = suggestDomains(schema);
      if (suggestions.length === 0) {
        return { content: [{ type: 'text', text: 'No domain suggestions — all columns are unique or already linked to domains.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] };
    },
  );

  server.tool(
    'domain_coverage',
    'Get domain coverage statistics: total columns, linked columns, coverage percentage, and per-group breakdown.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const stats = computeCoverageStats(schema);
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  server.tool(
    'export_domain_dictionary',
    'Export a domain data dictionary listing all domains with their types, constraints, descriptions, and linked columns. Available in markdown or HTML format.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['markdown', 'html']).describe('Output format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const ctx = { schema, projectName: projectId };
      const result = format === 'markdown'
        ? exportDictionaryMarkdown(ctx)
        : exportDictionaryHtml(ctx);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  // ==================
  // SNAPSHOT TOOLS
  // ==================

  server.tool(
    'list_snapshots',
    'List all named snapshots (save points) for a project. Returns {id, name, description, createdAt}. Use snapshot IDs with compare_snapshots or export_migration_sql.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const rows = db.prepare(
        'SELECT id, name, description, created_at FROM schema_snapshots WHERE project_id = ? ORDER BY created_at DESC'
      ).all(projectId) as { id: string; name: string; description: string | null; created_at: number }[];
      return {
        content: [{ type: 'text', text: JSON.stringify(rows.map((r) => ({
          id: r.id, name: r.name, description: r.description || undefined, createdAt: r.created_at,
        })), null, 2) }],
      };
    },
  );

  server.tool(
    'create_snapshot',
    'Save the current schema state as a named snapshot. Use before making large changes so you can compare or roll back later.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Snapshot name'),
      description: z.string().max(1024).optional().describe('Snapshot description'),
    },
    async ({ projectId, name, description }) => {
      requireAccess(projectId, 'editor');
      const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM schema_snapshots WHERE project_id = ?').get(projectId) as { count: number };
      if (snapshotCount.count >= 50) {
        return { content: [{ type: 'text', text: 'Snapshot limit reached (50). Delete old snapshots before creating new ones.' }], isError: true };
      }
      const schema = getSchemaOrFail(projectId);
      const id = generateId();
      const now = Date.now();
      db.prepare(
        'INSERT INTO schema_snapshots (id, project_id, name, description, data, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, name, description || null, JSON.stringify(schema), now, keyInfo.userId);
      mcpAudit('create_snapshot', projectId, { snapshotId: id, name });
      return { content: [{ type: 'text', text: JSON.stringify({ id, name, createdAt: now }) }] };
    },
  );

  server.tool(
    'restore_snapshot',
    'Restore a project schema from a snapshot, replacing the current schema entirely. This is irreversible — consider creating a snapshot of the current state first.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      snapshotId: z.string().max(256).describe('Snapshot ID'),
    },
    async ({ projectId, snapshotId }) => {
      requireAccess(projectId, 'editor');
      const row = db.prepare(
        'SELECT data FROM schema_snapshots WHERE project_id = ? AND id = ?'
      ).get(projectId, snapshotId) as { data: string } | undefined;
      if (!row) {
        return { content: [{ type: 'text', text: 'Snapshot not found' }], isError: true };
      }
      const schema = JSON.parse(row.data) as ERDSchema;
      saveAndNotify(projectId, schema);
      mcpAudit('restore_snapshot', projectId, { snapshotId });
      return { content: [{ type: 'text', text: 'Snapshot restored' }] };
    },
  );

  server.tool(
    'delete_snapshot',
    'Delete a named snapshot',
    {
      projectId: z.string().max(256).describe('Project ID'),
      snapshotId: z.string().max(256).describe('Snapshot ID'),
    },
    async ({ projectId, snapshotId }) => {
      requireAccess(projectId, 'editor');
      db.prepare('DELETE FROM schema_snapshots WHERE project_id = ? AND id = ?').run(projectId, snapshotId);
      mcpAudit('delete_snapshot', projectId, { snapshotId });
      return { content: [{ type: 'text', text: 'Snapshot deleted' }] };
    },
  );

  // ==================
  // ADDITIONAL WRITE TOOLS
  // ==================

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
    'attach_memo',
    'Pin a memo to a table so it moves together when the table is dragged on the canvas.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
      tableId: z.string().max(256).describe('Table ID to attach to'),
    },
    async ({ projectId, memoId, tableId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = attachMemo(schema, memoId, tableId);
      mcpAudit('attach_memo', projectId, { memoId, tableId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo attached to table' }] };
    },
  );

  server.tool(
    'detach_memo',
    'Unpin a memo from its attached table so it becomes a free-floating memo.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
    },
    async ({ projectId, memoId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = detachMemo(schema, memoId);
      mcpAudit('detach_memo', projectId, { memoId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo detached from table' }] };
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
    'rename_schema',
    'Rename a schema namespace. All tables and memos assigned to the old name are updated to the new name.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      oldName: z.string().max(256).describe('Current schema namespace name'),
      newName: z.string().max(256).describe('New schema namespace name'),
    },
    async ({ projectId, oldName, newName }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = renameSchema(schema, oldName, newName);
      if (!result) {
        return { content: [{ type: 'text', text: 'Invalid or duplicate schema name' }], isError: true };
      }
      mcpAudit('rename_schema', projectId, { oldName, newName });
      saveAndNotify(projectId, result);
      return { content: [{ type: 'text', text: `Schema renamed: "${oldName}" → "${newName}"` }] };
    },
  );

  // ==================
  // PRISMA TOOLS
  // ==================

  server.tool(
    'export_prisma',
    'Export as Prisma schema (.prisma format) with models, relations, enums, and indexes.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      includeComments: z.boolean().optional().describe('Include comments as /// doc comments'),
      includeForeignKeys: z.boolean().optional().describe('Include relation fields'),
      includeIndexes: z.boolean().optional().describe('Include @@index declarations'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const options: Record<string, boolean> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;

      const prisma = exportPrisma(schema, options);
      return { content: [{ type: 'text', text: prisma }] };
    },
  );

  server.tool(
    'import_prisma',
    'Import Prisma schema source code. Parses models, enums, @relation, @id, @unique, @@index. By default merges; set replace=true to replace entire schema.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      source: z.string().max(1048576).describe('Prisma schema source code'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, source, replace }) => {
      requireAccess(projectId, 'editor');
      const result = importPrisma(source);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_prisma', projectId, { tableCount: result.tables.length, replace: !!replace });
      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} model(s) from Prisma schema`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );

  // ==================
  // DBML TOOLS
  // ==================

  server.tool(
    'export_dbml',
    'Export as DBML (Database Markup Language) format. Options to include comments, foreign key Ref statements, and index blocks.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      includeComments: z.boolean().optional().describe('Include comments and notes'),
      includeForeignKeys: z.boolean().optional().describe('Include Ref statements'),
      includeIndexes: z.boolean().optional().describe('Include Indexes blocks'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const options: Record<string, boolean> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;

      const dbml = exportDBML(schema, options);
      return { content: [{ type: 'text', text: dbml }] };
    },
  );

  server.tool(
    'import_dbml',
    'Import DBML source code. Parses Table, Column, Enum, Ref, Indexes blocks. By default merges; set replace=true to replace entire schema.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      source: z.string().max(1048576).describe('DBML source code'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, source, replace }) => {
      requireAccess(projectId, 'editor');
      const result = importDBML(source);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_dbml', projectId, { tableCount: result.tables.length, replace: !!replace });
      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} table(s) from DBML`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );

  // ==================
  // BULK TOOLS
  // ==================

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

  // ==================
  // SCHEMA NAMESPACE TOOLS
  // ==================

  server.tool(
    'add_schema',
    'Add a new schema namespace (e.g. "public", "auth", "billing"). Use update_table to assign tables to it. Use list_schemas to see existing namespaces.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Schema namespace name'),
    },
    async ({ projectId, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = addSchemaNamespace(schema, name);
      if (!updated) {
        return { content: [{ type: 'text', text: `Schema namespace '${name}' already exists` }], isError: true };
      }
      mcpAudit('add_schema', projectId, { name });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Schema namespace '${name}' added` }] };
    },
  );

  server.tool(
    'delete_schema',
    'Delete a schema namespace. Tables and memos in it become unassigned (not deleted). Use rename_schema to rename instead.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Schema namespace name to delete'),
    },
    async ({ projectId, name }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.schemas ?? []).includes(name)) {
        return { content: [{ type: 'text', text: `Schema namespace '${name}' not found` }], isError: true };
      }
      const updated = deleteSchemaNamespace(schema, name);
      mcpAudit('delete_schema', projectId, { name });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: `Schema namespace '${name}' deleted` }] };
    },
  );

  // ==================
  // SEARCH / ANALYSIS TOOLS
  // ==================

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

  // ==================
  // SNAPSHOT COMPARISON TOOLS
  // ==================

  server.tool(
    'compare_snapshots',
    'Diff two snapshots or a snapshot vs current schema. Use "current" as snapshotId to compare against the live schema. Returns added/removed/modified tables with column-level details.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      snapshotId: z.string().max(256).describe('First snapshot ID (or "current" for current schema)'),
      snapshotId2: z.string().max(256).describe('Second snapshot ID (or "current" for current schema)'),
    },
    async ({ projectId, snapshotId, snapshotId2 }) => {
      requireAccess(projectId, 'viewer');

      const loadSnapshot = (id: string): ERDSchema => {
        if (id === 'current') return getSchemaOrFail(projectId);
        const row = db.prepare(
          'SELECT data FROM schema_snapshots WHERE id = ? AND project_id = ?'
        ).get(id, projectId) as { data: string } | undefined;
        if (!row) throw new Error(`Snapshot ${id} not found`);
        return JSON.parse(row.data) as ERDSchema;
      };

      const prev = loadSnapshot(snapshotId);
      const curr = loadSnapshot(snapshotId2);
      const diff = diffSchemas(prev, curr);

      return {
        content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }],
      };
    },
  );

  server.tool(
    'export_migration_sql',
    'Generate ALTER TABLE migration DDL between two snapshots (or snapshot vs "current"). Produces CREATE/DROP TABLE, ADD/DROP/ALTER COLUMN, FK, and index statements. Supports all 7 SQL dialects.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      snapshotId: z.string().max(256).describe('Base snapshot ID (or "current")'),
      snapshotId2: z.string().max(256).describe('Target snapshot ID (or "current")'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']).optional().describe('SQL dialect (default: mysql)'),
    },
    async ({ projectId, snapshotId, snapshotId2, dialect }) => {
      requireAccess(projectId, 'viewer');

      const loadSnapshot = (id: string): ERDSchema => {
        if (id === 'current') return getSchemaOrFail(projectId);
        const row = db.prepare(
          'SELECT data FROM schema_snapshots WHERE id = ? AND project_id = ?'
        ).get(id, projectId) as { data: string } | undefined;
        if (!row) throw new Error(`Snapshot ${id} not found`);
        return JSON.parse(row.data) as ERDSchema;
      };

      const prev = loadSnapshot(snapshotId);
      const curr = loadSnapshot(snapshotId2);
      const diff = diffSchemas(prev, curr);
      const sql = generateMigrationSQL(diff, (dialect || 'mysql') as Dialect, undefined, curr.tables);

      if (!sql.trim()) {
        return { content: [{ type: 'text', text: 'No differences found — no migration SQL needed' }] };
      }
      return { content: [{ type: 'text', text: sql }] };
    },
  );

  // ==================
  // TABLE TEMPLATES
  // ==================

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
        withPk: false, // template includes its own PK
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

  // ==================
  // BULK SCHEMA UPDATE
  // ==================

  server.tool(
    'bulk_update_table_schema',
    'Change the schema namespace for multiple tables at once. Pass null/empty string to remove schema assignment.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      tableIds: z.array(z.string().max(256)).min(1).max(500).describe('Array of table IDs'),
      schema: z.string().max(256).nullable().describe('Schema namespace name (null to remove)'),
    },
    async ({ projectId, tableIds, schema: schemaName }) => {
      requireAccess(projectId, 'editor');
      let schema = getSchemaOrFail(projectId);
      const updated: string[] = [];

      for (const tableId of tableIds) {
        const table = schema.tables.find(t => t.id === tableId);
        if (table) {
          table.schema = schemaName || undefined;
          updated.push(tableId);
        }
      }

      if (updated.length === 0) {
        return { content: [{ type: 'text', text: 'No matching tables found' }], isError: true };
      }

      mcpAudit('bulk_update_table_schema', projectId, { count: updated.length, schema: schemaName });
      saveAndNotify(projectId, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ updated: updated.length, schema: schemaName || null }) }],
      };
    },
  );

  return server;
}

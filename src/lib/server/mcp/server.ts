import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';

import type { ResolvedApiKey } from '$lib/server/auth/api-key';
import { checkAccess, getSchema, saveSchema, listUserProjects } from './db-helpers';
import { addTable, updateTable, deleteTable, addColumn, updateColumn, deleteColumn, addForeignKey, deleteForeignKey } from './schema-ops';
import { exportDDL, type DDLExportOptions } from '$lib/utils/ddl-export';
import { lintSchema } from '$lib/utils/schema-lint';
import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';
import { importDDL } from '$lib/utils/ddl-import';
import type { Dialect, ERDSchema, ReferentialAction } from '$lib/types/erd';
import { TABLE_COLOR_IDS } from '$lib/constants/table-colors';
import { notifyCollabSchemaChange } from '$lib/server/collab-notify';

export function createMcpServer(
  db: Database.Database,
  keyInfo: ResolvedApiKey,
): McpServer {
  const server = new McpServer({
    name: 'erdmini',
    version: '1.0.0',
  });

  function requireAccess(projectId: string, level: 'viewer' | 'editor' | 'owner'): void {
    if (!checkAccess(db, projectId, keyInfo.userId, keyInfo.userRole, level)) {
      throw new Error(`Access denied: requires '${level}' permission on project ${projectId}`);
    }
  }

  function saveAndNotify(projectId: string, schema: ERDSchema): void {
    saveSchema(db, projectId, schema);
    notifyCollabSchemaChange(projectId, schema);
  }

  // ==================
  // READ TOOLS
  // ==================

  server.tool(
    'list_projects',
    'List all ERD projects accessible to the authenticated user',
    {},
    async () => {
      const projects = listUserProjects(db, keyInfo.userId, keyInfo.userRole);
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
      };
    },
  );

  server.tool(
    'get_schema',
    'Get the full ERD schema JSON for a project',
    { projectId: z.string().describe('Project ID') },
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
    'export_ddl',
    'Export DDL SQL for a project schema (supports mysql, postgresql, mariadb, mssql)',
    {
      projectId: z.string().describe('Project ID'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql']).describe('SQL dialect'),
      includeComments: z.boolean().optional().describe('Include comments in DDL'),
      includeForeignKeys: z.boolean().optional().describe('Include FK constraints'),
      includeIndexes: z.boolean().optional().describe('Include indexes'),
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
      if (opts.upperCaseKeywords !== undefined) options.upperCaseKeywords = opts.upperCaseKeywords;

      const ddl = exportDDL(schema, dialect as Dialect, options);
      return { content: [{ type: 'text', text: ddl }] };
    },
  );

  server.tool(
    'lint_schema',
    'Run schema lint validation and return issues',
    { projectId: z.string().describe('Project ID') },
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
      projectId: z.string().describe('Project ID'),
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
      projectId: z.string().describe('Project ID'),
      name: z.string().optional().describe('Table name (auto-generated if omitted)'),
      comment: z.string().optional().describe('Table comment'),
      color: z.enum(TABLE_COLOR_IDS as unknown as [string, ...string[]]).optional().describe('Table header color'),
      group: z.string().optional().describe('Table group name'),
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
    'Update table properties (name, comment, color, group)',
    {
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID'),
      name: z.string().optional().describe('New table name'),
      comment: z.string().optional().describe('New comment (empty string to clear)'),
      color: z.enum([...TABLE_COLOR_IDS, ''] as unknown as [string, ...string[]]).optional().describe('Table header color (empty string to clear)'),
      group: z.string().optional().describe('New group name (empty string to clear)'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID to delete'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID'),
      name: z.string().optional().describe('Column name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).optional().describe('Column type'),
      length: z.number().optional().describe('Column length'),
      scale: z.number().optional().describe('Decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique constraint'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().optional().describe('Default value expression'),
      comment: z.string().optional().describe('Column comment'),
      enumValues: z.array(z.string()).optional().describe('ENUM values'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID'),
      columnId: z.string().describe('Column ID'),
      name: z.string().optional().describe('New column name'),
      type: z.enum(['INT', 'BIGINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'ENUM']).optional().describe('New column type'),
      length: z.number().optional().describe('New length'),
      scale: z.number().optional().describe('New decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().optional().describe('Default value expression'),
      comment: z.string().optional().describe('Column comment'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID'),
      columnId: z.string().describe('Column ID to delete'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Source table ID'),
      columnIds: z.array(z.string()).describe('Source column IDs'),
      referencedTableId: z.string().describe('Referenced table ID'),
      referencedColumnIds: z.array(z.string()).describe('Referenced column IDs'),
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
      projectId: z.string().describe('Project ID'),
      tableId: z.string().describe('Table ID'),
      fkId: z.string().describe('Foreign key ID to delete'),
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
    'import_ddl',
    'Import DDL SQL to create/update tables in a project',
    {
      projectId: z.string().describe('Project ID'),
      sql: z.string().describe('DDL SQL statements'),
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

  return server;
}

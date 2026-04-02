import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';

import type { ResolvedApiKey } from '$lib/server/auth/api-key';
import { logAudit } from '$lib/server/audit';
import { checkAccess, getSchema, saveSchema, listUserProjects } from './db-helpers';
import { notifyCollabSchemaChange } from '$lib/server/collab-notify';
import type { ERDSchema, Table } from '$lib/types/erd';
import type { McpToolContext } from './tools/types';

import { registerReadTools } from './tools/read-tools';
import { registerTableTools } from './tools/table-tools';
import { registerColumnTools } from './tools/column-tools';
import { registerFkTools } from './tools/fk-tools';
import { registerConstraintTools } from './tools/constraint-tools';
import { registerMemoTools } from './tools/memo-tools';
import { registerDomainTools } from './tools/domain-tools';
import { registerSchemaNsTools } from './tools/schema-ns-tools';
import { registerSnapshotTools } from './tools/snapshot-tools';
import { registerImportTools } from './tools/import-tools';
import { registerExportTools } from './tools/export-tools';
import { registerAnalysisTools } from './tools/analysis-tools';
import { registerTemplateTools } from './tools/template-tools';
import { registerBulkTools } from './tools/bulk-tools';
import { registerDbObjectTools } from './tools/db-object-tools';

export function createMcpServer(
  db: Database.Database,
  keyInfo: ResolvedApiKey,
): McpServer {
  const server = new McpServer({
    name: 'erdmini',
    version: '1.0.0',
  });

  const ctx: McpToolContext = {
    db,
    keyInfo,

    requireAccess(projectId: string, level: 'viewer' | 'editor' | 'owner'): void {
      if (!checkAccess(db, projectId, keyInfo.userId, keyInfo.userRole, level, keyInfo.scopes)) {
        throw new Error(`Access denied: requires '${level}' permission on project ${projectId}`);
      }
    },

    getSchemaOrFail(projectId: string): ERDSchema {
      const schema = getSchema(db, projectId);
      if (!schema) throw new Error('Project schema not found');
      return schema;
    },

    saveAndNotify(projectId: string, schema: ERDSchema): void {
      saveSchema(db, projectId, schema);
      notifyCollabSchemaChange(projectId, schema, 'mcp');
    },

    mcpAudit(action: string, projectId: string, detail?: Record<string, unknown>): void {
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
    },

    mergeOrReplaceSchema(
      projectId: string,
      importedTables: Table[],
      replace?: boolean,
    ): ERDSchema {
      const existing = getSchema(db, projectId);
      if (!existing || replace) {
        return {
          version: '1',
          tables: importedTables,
          domains: existing?.domains ?? [],
          memos: existing?.memos ?? [],
          groupColors: existing?.groupColors ?? {},
          schemas: existing?.schemas,
          namingRules: existing?.namingRules,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      const existingNames = new Set(existing.tables.map(t => t.name.toLowerCase()));
      const newTables = importedTables.filter(t => !existingNames.has(t.name.toLowerCase()));
      return { ...existing, tables: [...existing.tables, ...newTables], updatedAt: new Date().toISOString() };
    },
  };

  registerReadTools(server, ctx);
  registerTableTools(server, ctx);
  registerColumnTools(server, ctx);
  registerFkTools(server, ctx);
  registerConstraintTools(server, ctx);
  registerMemoTools(server, ctx);
  registerDomainTools(server, ctx);
  registerSchemaNsTools(server, ctx);
  registerSnapshotTools(server, ctx);
  registerImportTools(server, ctx);
  registerExportTools(server, ctx);
  registerAnalysisTools(server, ctx);
  registerTemplateTools(server, ctx);
  registerBulkTools(server, ctx);
  registerDbObjectTools(server, ctx);

  return server;
}

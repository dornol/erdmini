import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import type { ERDSchema, Table } from '$lib/types/erd';
import type { ResolvedApiKey } from '$lib/server/auth/api-key';

export interface McpToolContext {
  db: Database.Database;
  keyInfo: ResolvedApiKey;
  requireAccess(projectId: string, level: 'viewer' | 'editor' | 'owner'): void;
  getSchemaOrFail(projectId: string): ERDSchema;
  saveAndNotify(projectId: string, schema: ERDSchema): void;
  mcpAudit(action: string, projectId: string, detail?: Record<string, unknown>): void;
  mergeOrReplaceSchema(projectId: string, importedTables: Table[], replace?: boolean): ERDSchema;
}

export type RegisterFn = (server: McpServer, ctx: McpToolContext) => void;

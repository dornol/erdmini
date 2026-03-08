import { z } from 'zod';
import type { Dialect, ERDSchema } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { generateId } from '$lib/utils/common';
import { diffSchemas } from '$lib/utils/schema-diff';
import { generateMigrationSQL } from '$lib/utils/migration-sql';

export const registerSnapshotTools: RegisterFn = (server, ctx) => {
  const { db, keyInfo, requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

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

  function loadSnapshot(projectId: string, id: string): ERDSchema {
    if (id === 'current') return getSchemaOrFail(projectId);
    const row = db.prepare(
      'SELECT data FROM schema_snapshots WHERE id = ? AND project_id = ?'
    ).get(id, projectId) as { data: string } | undefined;
    if (!row) throw new Error(`Snapshot ${id} not found`);
    return JSON.parse(row.data) as ERDSchema;
  }

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
      const prev = loadSnapshot(projectId, snapshotId);
      const curr = loadSnapshot(projectId, snapshotId2);
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
      const prev = loadSnapshot(projectId, snapshotId);
      const curr = loadSnapshot(projectId, snapshotId2);
      const diff = diffSchemas(prev, curr);
      const sql = generateMigrationSQL(diff, (dialect || 'mysql') as Dialect, undefined, curr.tables);

      if (!sql.trim()) {
        return { content: [{ type: 'text', text: 'No differences found — no migration SQL needed' }] };
      }
      return { content: [{ type: 'text', text: sql }] };
    },
  );
};

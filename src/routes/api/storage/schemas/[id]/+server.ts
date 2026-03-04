import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hasProjectAccess } from '$lib/server/auth/permissions';
import { logAudit } from '$lib/server/audit';

function getUserInfo(locals: App.Locals) {
  return {
    id: locals.user?.id ?? 'singleton',
    role: locals.user?.role ?? 'user',
    isLocal: !locals.user,
  };
}

interface SchemaBlob {
  tables?: { id: string; name: string }[];
  memos?: { id: string }[];
}

export const GET: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'viewer')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const row = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(params.id) as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const data = JSON.stringify(body);

  // Load old schema for audit diff
  let oldSchema: SchemaBlob | null = null;
  if (locals.user) {
    const oldRow = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(params.id) as { data: string } | undefined;
    if (oldRow) {
      try { oldSchema = JSON.parse(oldRow.data); } catch { /* ignore */ }
    }
  }

  db.prepare(
    'INSERT INTO schemas (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = datetime(\'now\')'
  ).run(params.id, data);

  // Audit significant schema changes
  if (locals.user && oldSchema) {
    auditSchemaChanges(locals.user, params.id, oldSchema, body);
  }

  return json({ ok: true });
};

function auditSchemaChanges(
  user: { id: string; username: string | null },
  projectId: string,
  oldSchema: SchemaBlob,
  newSchema: SchemaBlob,
) {
  const oldTables = new Map((oldSchema.tables || []).map(t => [t.id, t]));
  const newTables = new Map((newSchema.tables || []).map(t => [t.id, t]));
  const oldMemoIds = new Set((oldSchema.memos || []).map(m => m.id));
  const newMemoIds = new Set((newSchema.memos || []).map(m => m.id));
  const base = { userId: user.id, username: user.username, category: 'schema', resourceId: projectId, source: 'web' as const };

  // Tables created
  for (const [id, t] of newTables) {
    if (!oldTables.has(id)) {
      logAudit({ ...base, action: 'create_table', resourceType: 'table', detail: { tableId: id, tableName: t.name } });
    }
  }
  // Tables deleted
  for (const [id, t] of oldTables) {
    if (!newTables.has(id)) {
      logAudit({ ...base, action: 'delete_table', resourceType: 'table', detail: { tableId: id, tableName: t.name } });
    }
  }
  // Tables renamed
  for (const [id, t] of newTables) {
    const old = oldTables.get(id);
    if (old && old.name !== t.name) {
      logAudit({ ...base, action: 'rename_table', resourceType: 'table', detail: { tableId: id, oldName: old.name, newName: t.name } });
    }
  }
  // Memos created
  for (const id of newMemoIds) {
    if (!oldMemoIds.has(id)) {
      logAudit({ ...base, action: 'create_memo', resourceType: 'memo', detail: { memoId: id } });
    }
  }
  // Memos deleted
  for (const id of oldMemoIds) {
    if (!newMemoIds.has(id)) {
      logAudit({ ...base, action: 'delete_memo', resourceType: 'memo', detail: { memoId: id } });
    }
  }
}

export const DELETE: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  db.prepare('DELETE FROM schemas WHERE project_id = ?').run(params.id);
  db.prepare('DELETE FROM project_permissions WHERE project_id = ?').run(params.id);
  return json({ ok: true });
};

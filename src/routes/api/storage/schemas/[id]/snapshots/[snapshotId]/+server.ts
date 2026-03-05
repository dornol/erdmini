import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hasProjectAccess } from '$lib/server/auth/permissions';

function getUserInfo(locals: App.Locals) {
  return {
    id: locals.user?.id ?? 'singleton',
    role: locals.user?.role ?? 'user',
    isLocal: !locals.user,
  };
}

export const GET: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'viewer')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const row = db.prepare(
    'SELECT id, name, description, data, created_at FROM schema_snapshots WHERE project_id = ? AND id = ?'
  ).get(params.id, params.snapshotId) as { id: string; name: string; description: string | null; data: string; created_at: number } | undefined;

  if (!row) {
    return new Response(null, { status: 404 });
  }

  return json({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    snap: row.data,
    createdAt: row.created_at,
  });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  db.prepare('DELETE FROM schema_snapshots WHERE project_id = ? AND id = ?').run(params.id, params.snapshotId);
  return json({ ok: true });
};

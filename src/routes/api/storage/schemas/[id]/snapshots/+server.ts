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

  const rows = db.prepare(
    'SELECT id, name, description, data, created_at FROM schema_snapshots WHERE project_id = ? ORDER BY created_at DESC'
  ).all(params.id) as { id: string; name: string; description: string | null; data: string; created_at: number }[];

  return json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || undefined,
    snap: r.data,
    createdAt: r.created_at,
  })));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  db.prepare(
    'INSERT INTO schema_snapshots (id, project_id, name, description, data, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(body.id, params.id, body.name, body.description || null, body.snap, body.createdAt, user.id);

  return json({ ok: true });
};

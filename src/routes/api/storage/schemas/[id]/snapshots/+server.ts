import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { getUserInfo, checkProjectAccess } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'viewer');
  if (err) return err;

  const rows = db.prepare(
    'SELECT id, name, description, data, created_at, is_auto FROM schema_snapshots WHERE project_id = ? ORDER BY created_at DESC'
  ).all(params.id) as { id: string; name: string; description: string | null; data: string; created_at: number; is_auto: number }[];

  return json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || undefined,
    snap: r.data,
    createdAt: r.created_at,
    ...(r.is_auto ? { isAuto: true } : {}),
  })));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'editor');
  if (err) return err;

  const body = await request.json();
  if (!body || typeof body !== 'object' || typeof body.id !== 'string' || typeof body.name !== 'string' || typeof body.snap !== 'string') {
    return json({ error: 'Invalid snapshot: id, name, and snap are required strings' }, { status: 400 });
  }
  const user = getUserInfo(locals);
  db.prepare(
    'INSERT INTO schema_snapshots (id, project_id, name, description, data, created_at, created_by, is_auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(body.id, params.id, body.name, body.description || null, body.snap, body.createdAt, user.id, body.isAuto ? 1 : 0);

  return json({ ok: true });
};

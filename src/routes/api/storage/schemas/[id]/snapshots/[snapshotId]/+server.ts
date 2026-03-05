import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { checkProjectAccess } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'viewer');
  if (err) return err;

  const row = db.prepare(
    'SELECT id, name, description, data, created_at, is_auto FROM schema_snapshots WHERE project_id = ? AND id = ?'
  ).get(params.id, params.snapshotId) as { id: string; name: string; description: string | null; data: string; created_at: number; is_auto: number } | undefined;

  if (!row) {
    return new Response(null, { status: 404 });
  }

  return json({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    snap: row.data,
    createdAt: row.created_at,
    ...(row.is_auto ? { isAuto: true } : {}),
  });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'editor');
  if (err) return err;

  db.prepare('DELETE FROM schema_snapshots WHERE project_id = ? AND id = ?').run(params.id, params.snapshotId);
  return json({ ok: true });
};

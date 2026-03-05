import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { checkProjectAccess } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'viewer');
  if (err) return err;

  const row = db.prepare('SELECT data FROM canvas_states WHERE project_id = ?').get(params.id) as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'editor');
  if (err) return err;

  const body = await request.json();
  const data = JSON.stringify(body);
  db.prepare(
    'INSERT INTO canvas_states (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data'
  ).run(params.id, data);
  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'owner');
  if (err) return err;

  db.prepare('DELETE FROM canvas_states WHERE project_id = ?').run(params.id);
  return json({ ok: true });
};

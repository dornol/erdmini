import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

export const GET: RequestHandler = ({ params }) => {
  const row = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(params.id) as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const data = JSON.stringify(body);
  db.prepare(
    'INSERT INTO schemas (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = datetime(\'now\')'
  ).run(params.id, data);
  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params }) => {
  db.prepare('DELETE FROM schemas WHERE project_id = ?').run(params.id);
  return json({ ok: true });
};

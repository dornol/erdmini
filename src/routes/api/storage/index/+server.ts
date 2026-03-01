import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

export const GET: RequestHandler = () => {
  const row = db.prepare('SELECT data FROM project_index WHERE id = ?').get('singleton') as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const data = JSON.stringify(body);
  db.prepare(
    'INSERT INTO project_index (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).run('singleton', data);
  return json({ ok: true });
};

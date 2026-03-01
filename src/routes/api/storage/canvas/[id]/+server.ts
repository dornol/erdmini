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

  const row = db.prepare('SELECT data FROM canvas_states WHERE project_id = ?').get(params.id) as { data: string } | undefined;
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
  db.prepare(
    'INSERT INTO canvas_states (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data'
  ).run(params.id, data);
  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  db.prepare('DELETE FROM canvas_states WHERE project_id = ?').run(params.id);
  return json({ ok: true });
};

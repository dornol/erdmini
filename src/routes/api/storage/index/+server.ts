import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { ensureOwnerPermission } from '$lib/server/auth/permissions';

function getUserId(locals: App.Locals): string {
  return locals.user?.id ?? 'singleton';
}

export const GET: RequestHandler = ({ locals }) => {
  const userId = getUserId(locals);
  const id = `user_${userId}`;
  const row = db.prepare('SELECT data FROM project_index WHERE id = ?').get(id) as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const userId = getUserId(locals);
  const body = await request.json();

  // Detect new projects — compare with existing index
  if (userId !== 'singleton' && body.projects) {
    const existingRow = db.prepare('SELECT data FROM project_index WHERE user_id = ?').get(userId) as { data: string } | undefined;
    const existingIds = new Set<string>();
    if (existingRow) {
      try {
        const existing = JSON.parse(existingRow.data);
        if (existing.projects) {
          for (const p of existing.projects) existingIds.add(p.id);
        }
      } catch { /* ignore */ }
    }
    for (const proj of body.projects) {
      if (!existingIds.has(proj.id)) {
        ensureOwnerPermission(db, proj.id, userId);
      }
    }
  }

  const data = JSON.stringify(body);
  const id = `user_${userId}`;
  db.prepare(
    'INSERT INTO project_index (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).run(id, userId, data);
  return json({ ok: true });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { ensureOwnerPermission } from '$lib/server/auth/permissions';
import { requirePermission } from '$lib/server/auth/guards';

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

    // Check permission if creating truly new projects (not shared ones)
    const newProjectIds = body.projects
      .filter((p: { id: string }) => !existingIds.has(p.id))
      .map((p: { id: string }) => p.id);

    if (newProjectIds.length > 0) {
      // Shared projects already have a schema row — only block genuinely new projects
      const hasNewOwnProject = newProjectIds.some((id: string) => {
        const existing = db.prepare('SELECT 1 FROM schemas WHERE project_id = ?').get(id);
        return !existing;
      });
      if (hasNewOwnProject) {
        const permErr = requirePermission(locals, 'canCreateProject');
        if (permErr) return permErr;
      }
    }

    for (const proj of body.projects) {
      if (!existingIds.has(proj.id)) {
        // Only grant owner permission for genuinely new projects (no schema row yet).
        // Shared projects already have a schema row — don't promote to owner.
        const hasSchema = db.prepare('SELECT 1 FROM schemas WHERE project_id = ?').get(proj.id);
        if (!hasSchema) {
          ensureOwnerPermission(db, proj.id, userId);
        }
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

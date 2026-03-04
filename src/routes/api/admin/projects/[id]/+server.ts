import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { randomUUID } from 'crypto';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// GET /api/admin/projects/[id] — get project members
export const GET: RequestHandler = ({ locals, params }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const members = db.prepare(
    `SELECT pp.id, pp.user_id, pp.permission, pp.created_at,
            u.display_name, u.username, u.email
     FROM project_permissions pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.project_id = ?
     ORDER BY CASE pp.permission WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END`
  ).all(params.id);

  return json(members);
};

// PATCH /api/admin/projects/[id] — transfer ownership
export const PATCH: RequestHandler = async ({ request, locals, params }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { action, newOwnerId } = await request.json();

  if (action !== 'transfer' || !newOwnerId) {
    return json({ error: 'Invalid action' }, { status: 400 });
  }

  const projectId = params.id;

  // Verify new owner exists
  const newOwner = db.prepare('SELECT id FROM users WHERE id = ?').get(newOwnerId) as { id: string } | undefined;
  if (!newOwner) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  // Find current owner
  const currentOwner = db.prepare(
    "SELECT user_id FROM project_permissions WHERE project_id = ? AND permission = 'owner'"
  ).get(projectId) as { user_id: string } | undefined;

  const transferTx = db.transaction(() => {
    // Demote current owner to editor
    if (currentOwner) {
      db.prepare(
        "UPDATE project_permissions SET permission = 'editor' WHERE project_id = ? AND user_id = ?"
      ).run(projectId, currentOwner.user_id);
    }

    // Upsert new owner
    const existing = db.prepare(
      'SELECT id FROM project_permissions WHERE project_id = ? AND user_id = ?'
    ).get(projectId, newOwnerId) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE project_permissions SET permission = 'owner' WHERE project_id = ? AND user_id = ?"
      ).run(projectId, newOwnerId);
    } else {
      db.prepare(
        "INSERT INTO project_permissions (id, project_id, user_id, permission) VALUES (?, ?, ?, 'owner')"
      ).run(randomUUID(), projectId, newOwnerId);
    }
  });

  transferTx();

  return json({ success: true });
};

// DELETE /api/admin/projects/[id] — delete project
export const DELETE: RequestHandler = ({ locals, params }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const projectId = params.id;

  const deleteTx = db.transaction(() => {
    // Delete permissions
    db.prepare('DELETE FROM project_permissions WHERE project_id = ?').run(projectId);

    // Delete schema
    db.prepare('DELETE FROM schemas WHERE project_id = ?').run(projectId);

    // Delete canvas state
    db.prepare('DELETE FROM canvas_states WHERE project_id = ?').run(projectId);

    // Remove from project_index JSON data
    const rows = db.prepare('SELECT id, data FROM project_index').all() as { id: string; data: string }[];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        const before = parsed.projects?.length ?? 0;
        parsed.projects = (parsed.projects ?? []).filter((p: { id: string }) => p.id !== projectId);
        if (parsed.projects.length < before) {
          // Update activeProjectId if it was the deleted project
          if (parsed.activeProjectId === projectId) {
            parsed.activeProjectId = parsed.projects[0]?.id ?? '';
          }
          db.prepare('UPDATE project_index SET data = ? WHERE id = ?').run(JSON.stringify(parsed), row.id);
        }
      } catch {
        // Skip malformed
      }
    }
  });

  deleteTx();

  return json({ success: true });
};

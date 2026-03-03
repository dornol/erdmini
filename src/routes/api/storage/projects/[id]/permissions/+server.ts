import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hasProjectAccess } from '$lib/server/auth/permissions';
import { randomUUID } from 'crypto';
import type { ProjectPermissionRow, UserRow } from '$lib/types/auth';

function getUserInfo(locals: App.Locals) {
  if (!locals.user) return null;
  return { id: locals.user.id, role: locals.user.role };
}

export const GET: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!hasProjectAccess(db, params.id, user.id, user.role, 'viewer')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = db.prepare(`
    SELECT pp.id, pp.project_id, pp.user_id, pp.permission, pp.created_at,
           u.display_name, u.username, u.email
    FROM project_permissions pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.project_id = ?
    ORDER BY
      CASE pp.permission WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
      pp.created_at
  `).all(params.id) as (ProjectPermissionRow & Pick<UserRow, 'display_name' | 'username' | 'email'>)[];

  return json(rows.map(r => ({
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    permission: r.permission,
    displayName: r.display_name,
    username: r.username,
    email: r.email,
  })));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  // Only owner (or admin) can share
  if (!hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Only project owner can share' }, { status: 403 });
  }

  const { userId, permission } = await request.json();
  if (!userId || !permission) {
    return json({ error: 'userId and permission required' }, { status: 400 });
  }
  if (!['owner', 'editor', 'viewer'].includes(permission)) {
    return json({ error: 'Permission must be owner, editor, or viewer' }, { status: 400 });
  }

  // Check target user exists
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  // Cannot share to yourself
  if (userId === user.id) {
    return json({ error: 'Cannot share to yourself' }, { status: 400 });
  }

  // Check if there's already a permission (not owner)
  const existing = db.prepare(
    'SELECT id, permission FROM project_permissions WHERE project_id = ? AND user_id = ?'
  ).get(params.id, userId) as Pick<ProjectPermissionRow, 'id' | 'permission'> | undefined;

  if (existing) {
    if (existing.permission === 'owner' && permission !== 'owner') {
      // Prevent demoting the last owner
      const ownerCount = (db.prepare(
        "SELECT COUNT(*) as cnt FROM project_permissions WHERE project_id = ? AND permission = 'owner'"
      ).get(params.id) as { cnt: number }).cnt;
      if (ownerCount <= 1) {
        return json({ error: 'Cannot demote last owner' }, { status: 400 });
      }
    }
    // Update existing permission
    db.prepare('UPDATE project_permissions SET permission = ? WHERE id = ?').run(permission, existing.id);
    return json({ ok: true, updated: true });
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO project_permissions (id, project_id, user_id, permission) VALUES (?, ?, ?, ?)'
  ).run(id, params.id, userId, permission);

  return json({ ok: true, id }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Only project owner can remove shares' }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return json({ error: 'userId required' }, { status: 400 });
  }

  // Cannot remove last owner
  const perm = db.prepare(
    'SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?'
  ).get(params.id, userId) as Pick<ProjectPermissionRow, 'permission'> | undefined;
  if (perm?.permission === 'owner') {
    const ownerCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM project_permissions WHERE project_id = ? AND permission = 'owner'"
    ).get(params.id) as { cnt: number }).cnt;
    if (ownerCount <= 1) {
      return json({ error: 'Cannot remove last owner' }, { status: 400 });
    }
  }

  db.prepare(
    'DELETE FROM project_permissions WHERE project_id = ? AND user_id = ?'
  ).run(params.id, userId);

  return json({ ok: true });
};

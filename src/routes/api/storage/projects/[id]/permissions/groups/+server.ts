import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hasProjectAccess } from '$lib/server/auth/permissions';
import { generateId } from '$lib/utils/common';
import type { GroupProjectPermissionRow, GroupRow } from '$lib/types/auth';

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
    SELECT gpp.id, gpp.group_id, gpp.project_id, gpp.permission, gpp.created_at,
           g.name as group_name, g.description as group_description,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
    FROM group_project_permissions gpp
    JOIN groups g ON g.id = gpp.group_id
    WHERE gpp.project_id = ?
    ORDER BY gpp.created_at
  `).all(params.id) as (GroupProjectPermissionRow & { group_name: string; group_description: string | null; member_count: number })[];

  return json(rows.map(r => ({
    id: r.id,
    groupId: r.group_id,
    projectId: r.project_id,
    permission: r.permission,
    groupName: r.group_name,
    groupDescription: r.group_description,
    memberCount: r.member_count,
  })));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Only project owner can share' }, { status: 403 });
  }

  const { groupId, permission } = await request.json();
  if (!groupId || !permission) {
    return json({ error: 'groupId and permission required' }, { status: 400 });
  }
  if (!['owner', 'editor', 'viewer'].includes(permission)) {
    return json({ error: 'Permission must be owner, editor, or viewer' }, { status: 400 });
  }

  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId) as Pick<GroupRow, 'id'> | undefined;
  if (!group) return json({ error: 'Group not found' }, { status: 404 });

  const existing = db.prepare(
    'SELECT id FROM group_project_permissions WHERE group_id = ? AND project_id = ?'
  ).get(groupId, params.id) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE group_project_permissions SET permission = ? WHERE id = ?').run(permission, existing.id);
    return json({ ok: true, updated: true });
  }

  const id = generateId();
  db.prepare(
    'INSERT INTO group_project_permissions (id, group_id, project_id, permission) VALUES (?, ?, ?, ?)'
  ).run(id, groupId, params.id, permission);

  return json({ ok: true, id }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!hasProjectAccess(db, params.id, user.id, user.role, 'owner')) {
    return json({ error: 'Only project owner can remove group shares' }, { status: 403 });
  }

  const { groupId } = await request.json();
  if (!groupId) return json({ error: 'groupId required' }, { status: 400 });

  db.prepare(
    'DELETE FROM group_project_permissions WHERE group_id = ? AND project_id = ?'
  ).run(groupId, params.id);

  return json({ ok: true });
};

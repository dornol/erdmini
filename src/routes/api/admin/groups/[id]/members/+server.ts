import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { logAudit } from '$lib/server/audit';
import { generateId } from '$lib/utils/common';
import type { UserRow } from '$lib/types/auth';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(params.id);
  if (!group) return json({ error: 'Group not found' }, { status: 404 });

  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.display_name
  `).all(params.id) as Pick<UserRow, 'id' | 'username' | 'display_name' | 'email'>[];

  return json(members);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(params.id) as { id: string; name: string } | undefined;
  if (!group) return json({ error: 'Group not found' }, { status: 404 });

  const { userId } = await request.json();
  if (!userId) return json({ error: 'userId required' }, { status: 400 });

  const user = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(userId) as { id: string; display_name: string } | undefined;
  if (!user) return json({ error: 'User not found' }, { status: 404 });

  const existing = db.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(params.id, userId);
  if (existing) return json({ error: 'User already in group' }, { status: 409 });

  const id = generateId();
  db.prepare('INSERT INTO group_members (id, group_id, user_id) VALUES (?, ?, ?)').run(id, params.id, userId);

  logAudit({
    action: 'create', category: 'group',
    userId: locals.user!.id, username: locals.user!.username,
    resourceType: 'group_member', resourceId: id,
    detail: { groupId: params.id, groupName: group.name, memberId: userId, memberName: user.display_name },
  });

  return json({ ok: true, id }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { userId } = await request.json();
  if (!userId) return json({ error: 'userId required' }, { status: 400 });

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(params.id, userId);

  logAudit({
    action: 'delete', category: 'group',
    userId: locals.user!.id, username: locals.user!.username,
    resourceType: 'group_member', resourceId: `${params.id}:${userId}`,
    detail: { groupId: params.id, removedUserId: userId },
  });

  return json({ ok: true });
};

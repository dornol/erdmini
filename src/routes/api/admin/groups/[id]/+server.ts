import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { logAudit } from '$lib/server/audit';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { name, description } = await request.json();

  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(params.id);
  if (!group) return json({ error: 'Group not found' }, { status: 404 });

  if (name !== undefined) {
    if (!name?.trim()) return json({ error: 'Group name required' }, { status: 400 });
    const dup = db.prepare('SELECT id FROM groups WHERE name = ? AND id != ?').get(name.trim(), params.id);
    if (dup) return json({ error: 'Group name already exists' }, { status: 409 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description?.trim() || null); }

  if (updates.length > 0) {
    values.push(params.id);
    db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  logAudit({
    action: 'update', category: 'group',
    userId: locals.user!.id, username: locals.user!.username,
    resourceType: 'group', resourceId: params.id,
    detail: { name, description },
  });

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(params.id) as { id: string; name: string } | undefined;
  if (!group) return json({ error: 'Group not found' }, { status: 404 });

  db.prepare('DELETE FROM groups WHERE id = ?').run(params.id);

  logAudit({
    action: 'delete', category: 'group',
    userId: locals.user!.id, username: locals.user!.username,
    resourceType: 'group', resourceId: params.id,
    detail: { name: group.name },
  });

  return json({ ok: true });
};

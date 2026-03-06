import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { logAudit } from '$lib/server/audit';
import { generateId } from '$lib/utils/common';
import type { GroupRow } from '$lib/types/auth';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const rows = db.prepare(`
    SELECT g.id, g.name, g.description, g.created_by, g.source, g.source_provider_id, g.created_at,
           u.display_name as creator_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
    FROM groups g
    LEFT JOIN users u ON u.id = g.created_by
    ORDER BY g.created_at
  `).all() as (GroupRow & { creator_name: string | null; member_count: number })[];

  return json(rows);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { name, description } = await request.json();
  if (!name?.trim()) {
    return json({ error: 'Group name required' }, { status: 400 });
  }

  const existing = db.prepare('SELECT id FROM groups WHERE name = ?').get(name.trim());
  if (existing) {
    return json({ error: 'Group name already exists' }, { status: 409 });
  }

  const id = generateId();
  db.prepare(
    'INSERT INTO groups (id, name, description, created_by) VALUES (?, ?, ?, ?)'
  ).run(id, name.trim(), description?.trim() || null, locals.user!.id);

  logAudit({
    action: 'create', category: 'group',
    userId: locals.user!.id, username: locals.user!.username,
    resourceType: 'group', resourceId: id,
    detail: { name: name.trim() },
  });

  return json({ id, name: name.trim(), description: description?.trim() || null }, { status: 201 });
};

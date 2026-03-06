import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import type { GroupRow } from '$lib/types/auth';

export const GET: RequestHandler = ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 1) {
    return json([]);
  }

  const pattern = `%${q}%`;
  const groups = db.prepare(`
    SELECT g.id, g.name, g.description,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
    FROM groups g
    WHERE g.name LIKE ? OR g.description LIKE ?
    LIMIT 10
  `).all(pattern, pattern) as (Pick<GroupRow, 'id' | 'name' | 'description'> & { member_count: number })[];

  return json(groups);
};

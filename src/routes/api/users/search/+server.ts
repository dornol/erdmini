import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import type { UserRow } from '$lib/types/auth';

export const GET: RequestHandler = ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 1) {
    return json([]);
  }

  const pattern = `%${q}%`;
  const users = db.prepare(`
    SELECT id, username, display_name, email
    FROM users
    WHERE id != ? AND (
      username LIKE ? OR display_name LIKE ? OR email LIKE ?
    )
    LIMIT 10
  `).all(locals.user.id, pattern, pattern, pattern) as Pick<UserRow, 'id' | 'username' | 'display_name' | 'email'>[];

  return json(users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
  })));
};

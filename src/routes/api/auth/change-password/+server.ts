import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import type { UserRow } from '$lib/types/auth';

export const PUT: RequestHandler = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow | undefined;
  if (!row || !row.password_hash) {
    return json({ error: 'Password change not available for this account' }, { status: 400 });
  }

  const valid = await verifyPassword(row.password_hash, currentPassword);
  if (!valid) {
    return json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  if (!newPassword || newPassword.length < 4) {
    return json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, user.id);

  return json({ ok: true });
};

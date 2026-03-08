import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import { createSession, deleteUserSessions, SESSION_MAX_AGE_DAYS } from '$lib/server/auth/session';
import { logAudit } from '$lib/server/audit';
import { unauthorized, err } from '$lib/server/api-helpers';
import type { UserRow } from '$lib/types/auth';

export const PUT: RequestHandler = async ({ locals, request, cookies, url }) => {
  const user = (locals as any).user;
  if (!user) {
    return unauthorized();
  }

  const { currentPassword, newPassword } = await request.json();

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow | undefined;
  if (!row || !row.password_hash) {
    return err('Password change not available for this account');
  }

  const valid = await verifyPassword(row.password_hash, currentPassword);
  if (!valid) {
    return unauthorized('Current password is incorrect');
  }

  if (!newPassword || newPassword.length < 4) {
    return err('Password must be at least 4 characters');
  }

  const newHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, user.id);

  // Invalidate all existing sessions and create a new one
  deleteUserSessions(db, user.id);
  const session = createSession(db, user.id);
  cookies.set('erdmini_session', session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: url.protocol === 'https:',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
  });

  logAudit({ action: 'change_password', category: 'auth', userId: user.id, username: user.username, source: 'web' });

  return json({ ok: true });
};

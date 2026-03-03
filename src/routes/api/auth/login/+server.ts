import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/session';
import type { UserRow } from '$lib/types/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { username, password } = await request.json();

  if (!username || !password) {
    return json({ error: 'Username and password required' }, { status: 400 });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get(username) as UserRow | undefined;

  if (!user || !user.password_hash) {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const session = createSession(db, user.id);

  cookies.set('erdmini_session', session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Set true in production with HTTPS
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
    },
  });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/session';
import type { UserRow } from '$lib/types/auth';

// Pre-computed hash for timing attack mitigation: always run argon2 even if user not found
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$g9Xz09nwac+Z2hYEff2CBA$OrsbZAtzn4YIAEPHQyLkD4tfwmYBX2Nf+nBb3XFGNf4';

const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

function checkLoginRate(ip: string): boolean {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + WINDOW_MS };
    loginAttempts.set(ip, entry);
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginAttempts) {
    if (now > val.resetTime) loginAttempts.delete(key);
  }
}, 5 * 60 * 1000);

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!checkLoginRate(ip)) {
    return json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return json({ error: 'Username and password required' }, { status: 400 });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get(username) as UserRow | undefined;

  // Always run argon2 verify to prevent timing-based user enumeration
  const hashToVerify = (user && user.password_hash) ? user.password_hash : DUMMY_HASH;
  const valid = await verifyPassword(hashToVerify, password);

  if (!user || !user.password_hash || !valid) {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const session = createSession(db, user.id);

  cookies.set('erdmini_session', session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
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

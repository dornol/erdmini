import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/session';
import { logAudit } from '$lib/server/audit';
import { RateLimiter } from '$lib/server/auth/rate-limiter';
import type { UserRow } from '$lib/types/auth';

// Pre-computed hash for timing attack mitigation: always run argon2 even if user not found
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$g9Xz09nwac+Z2hYEff2CBA$OrsbZAtzn4YIAEPHQyLkD4tfwmYBX2Nf+nBb3XFGNf4';

const loginLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 60_000, maxMapSize: 1000 });

// Periodic cleanup to prevent memory leak
setInterval(() => loginLimiter.cleanup(), 5 * 60 * 1000);

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!loginLimiter.check(ip)) {
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
    logAudit({ action: 'login_failed', category: 'auth', detail: { username }, ip });
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (user.status === 'pending') {
    logAudit({ action: 'login_blocked', category: 'auth', userId: user.id, username: user.username, detail: { reason: 'pending' }, ip });
    return json({ error: 'pending_approval' }, { status: 403 });
  }

  const session = createSession(db, user.id);

  cookies.set('erdmini_session', session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: url.protocol === 'https:',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  logAudit({ action: 'login', category: 'auth', userId: user.id, username: user.username, ip, source: 'web' });

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

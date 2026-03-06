import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { authenticateLdap, findOrCreateLdapUser } from '$lib/server/auth/ldap';
import { createSession } from '$lib/server/auth/session';
import { syncUserGroups, extractCN } from '$lib/server/auth/group-sync';
import { logAudit } from '$lib/server/audit';
import { RateLimiter } from '$lib/server/auth/rate-limiter';
import type { LdapProviderRow } from '$lib/types/auth';

const ldapLoginLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 60_000, maxMapSize: 1000 });

setInterval(() => ldapLoginLimiter.cleanup(), 5 * 60 * 1000);

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!ldapLoginLimiter.check(ip)) {
    return json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
  }

  const { providerId, username, password } = await request.json();

  if (!providerId || !username || !password) {
    return json({ error: 'providerId, username, password required' }, { status: 400 });
  }

  const provider = db.prepare(
    'SELECT * FROM ldap_providers WHERE id = ? AND enabled = 1'
  ).get(providerId) as LdapProviderRow | undefined;

  if (!provider) {
    return json({ error: 'LDAP provider not found or disabled' }, { status: 404 });
  }

  const authResult = await authenticateLdap(provider, username, password);

  if (!authResult) {
    logAudit({ action: 'ldap_login_failed', category: 'auth', detail: { username, provider: provider.display_name, reason: provider.allowed_group_dns ? 'invalid_credentials_or_not_in_allowed_group' : 'invalid_credentials' }, ip });
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const role = authResult.isAdmin ? 'admin' : 'user';
  const result = findOrCreateLdapUser(
    db,
    provider.id,
    authResult.dn,
    authResult.email,
    authResult.displayName,
    role,
    provider.auto_create_users === 1,
  );

  if (!result) {
    logAudit({ action: 'ldap_login_failed', category: 'auth', detail: { username, provider: provider.display_name, error: 'auto_registration_disabled' }, ip });
    return json({ error: 'auto_registration_disabled' }, { status: 403 });
  }

  if (result.created) {
    logAudit({ action: 'ldap_register', category: 'auth', userId: result.userId, username, detail: { provider: provider.display_name, status: result.status } });
  }

  if (result.status === 'pending') {
    return json({ error: 'pending_approval' }, { status: 403 });
  }

  // Sync groups from LDAP
  if (provider.sync_groups && authResult.groups.length > 0) {
    const groupNames = authResult.groups.map(dn => extractCN(dn));
    syncUserGroups(db, result.userId, groupNames, 'ldap', provider.id);
  }

  const session = createSession(db, result.userId);

  cookies.set('erdmini_session', session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: url.protocol === 'https:',
    maxAge: 30 * 24 * 60 * 60,
  });

  logAudit({ action: 'ldap_login', category: 'auth', userId: result.userId, username, detail: { provider: provider.display_name }, ip, source: 'web' });

  // Fetch user info for response
  const user = db.prepare(
    'SELECT id, username, display_name, email, role FROM users WHERE id = ?'
  ).get(result.userId) as { id: string; username: string | null; display_name: string; email: string | null; role: string };

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

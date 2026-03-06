import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { UserRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';
import { getDefaultPermissions } from '$lib/server/site-settings';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const users = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
            u.created_at, u.updated_at,
            u.can_create_project, u.can_create_api_key, u.can_create_embed,
            CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END as has_local_auth,
            GROUP_CONCAT(DISTINCT op.display_name) as oidc_provider_names,
            GROUP_CONCAT(DISTINCT lp.display_name) as ldap_provider_names
     FROM users u
     LEFT JOIN oidc_identities oi ON oi.user_id = u.id
     LEFT JOIN oidc_providers op ON op.id = oi.provider_id
     LEFT JOIN ldap_identities li ON li.user_id = u.id
     LEFT JOIN ldap_providers lp ON lp.id = li.provider_id
     GROUP BY u.id
     ORDER BY u.created_at`
  ).all() as (Omit<UserRow, 'password_hash'> & { has_local_auth: number; oidc_provider_names: string | null; ldap_provider_names: string | null; can_create_project: number; can_create_api_key: number; can_create_embed: number })[];

  // Fetch group memberships for all users
  const groupMemberships = db.prepare(`
    SELECT gm.user_id, g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id
  `).all() as { user_id: string; name: string }[];
  const userGroups = new Map<string, string[]>();
  for (const gm of groupMemberships) {
    if (!userGroups.has(gm.user_id)) userGroups.set(gm.user_id, []);
    userGroups.get(gm.user_id)!.push(gm.name);
  }

  const result = users.map(u => ({
    ...u,
    has_local_auth: u.has_local_auth === 1,
    can_create_project: u.can_create_project === 1,
    can_create_api_key: u.can_create_api_key === 1,
    can_create_embed: u.can_create_embed === 1,
    oidc_providers: u.oidc_provider_names ? u.oidc_provider_names.split(',') : [],
    ldap_providers: u.ldap_provider_names ? u.ldap_provider_names.split(',') : [],
    groups: userGroups.get(u.id) ?? [],
    oidc_provider_names: undefined,
    ldap_provider_names: undefined,
  }));

  return json(result);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { username, displayName, email, password, role } = await request.json();

  if (!username || !password || !displayName) {
    return json({ error: 'username, displayName, password required' }, { status: 400 });
  }

  if (password.length < 4) {
    return json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  if (role && !['admin', 'user'].includes(role)) {
    return json({ error: 'Invalid role value' }, { status: 400 });
  }

  // Check uniqueness
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return json({ error: 'Username already exists' }, { status: 409 });
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const defaults = getDefaultPermissions(db);

  db.prepare(
    `INSERT INTO users (id, username, display_name, email, password_hash, role, can_create_project, can_create_api_key, can_create_embed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, username, displayName, email || null, passwordHash, role || 'user', defaults.canCreateProject, defaults.canCreateApiKey, defaults.canCreateEmbed);

  logAudit({ action: 'create', category: 'user', userId: locals.user!.id, username: locals.user!.username, resourceType: 'user', resourceId: id, detail: { newUsername: username, role: role || 'user' } });

  return json({ id, username, displayName, email, role: role || 'user' }, { status: 201 });
};

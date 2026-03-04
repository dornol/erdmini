import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { UserRow } from '$lib/types/auth';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const users = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
            u.created_at, u.updated_at,
            CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END as has_local_auth,
            GROUP_CONCAT(DISTINCT op.display_name) as oidc_provider_names
     FROM users u
     LEFT JOIN oidc_identities oi ON oi.user_id = u.id
     LEFT JOIN oidc_providers op ON op.id = oi.provider_id
     GROUP BY u.id
     ORDER BY u.created_at`
  ).all() as (Omit<UserRow, 'password_hash'> & { has_local_auth: number; oidc_provider_names: string | null })[];

  const result = users.map(u => ({
    ...u,
    has_local_auth: u.has_local_auth === 1,
    oidc_providers: u.oidc_provider_names ? u.oidc_provider_names.split(',') : [],
    oidc_provider_names: undefined,
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

  // Check uniqueness
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return json({ error: 'Username already exists' }, { status: 409 });
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, username, display_name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, username, displayName, email || null, passwordHash, role || 'user');

  logAudit({ action: 'create', category: 'user', userId: locals.user!.id, username: locals.user!.username, resourceType: 'user', resourceId: id, detail: { newUsername: username, role: role || 'user' } });

  return json({ id, username, displayName, email, role: role || 'user' }, { status: 201 });
};

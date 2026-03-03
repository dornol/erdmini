import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
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
    'SELECT id, username, display_name, email, role, created_at, updated_at FROM users ORDER BY created_at'
  ).all() as Omit<UserRow, 'password_hash'>[];

  return json(users);
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

  return json({ id, username, displayName, email, role: role || 'user' }, { status: 201 });
};

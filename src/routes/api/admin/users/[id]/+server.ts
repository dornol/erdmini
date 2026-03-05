import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
import { logAudit } from '$lib/server/audit';
import type { UserRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const user = db.prepare(
    'SELECT id, username, display_name, email, role, status, created_at, updated_at FROM users WHERE id = ?'
  ).get(params.id) as Omit<UserRow, 'password_hash'> | undefined;

  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  return json(user);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(params.id) as Pick<UserRow, 'id' | 'role'> | undefined;
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  const body = await request.json();
  const { displayName, email, role, password, status } = body;

  // Prevent demoting the last admin
  if (role && role !== 'admin' && user.role === 'admin') {
    const adminCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'"
    ).get() as { cnt: number };
    if (adminCount.cnt <= 1) {
      return json({ error: 'Cannot demote the last admin' }, { status: 400 });
    }
  }

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email || null);
  }
  if (role !== undefined) {
    updates.push('role = ?');
    values.push(role);
  }
  if (status !== undefined) {
    if (status !== 'active' && status !== 'pending') {
      return json({ error: 'Invalid status value' }, { status: 400 });
    }
    updates.push('status = ?');
    values.push(status);
  }
  if (password) {
    const hash = await hashPassword(password);
    updates.push('password_hash = ?');
    values.push(hash);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (status !== undefined) {
      logAudit({ action: status === 'active' ? 'approve' : 'reject', category: 'user', userId: locals.user!.id, username: locals.user!.username, resourceType: 'user', resourceId: params.id });
    } else {
      const fields = Object.keys(body).filter(k => body[k] !== undefined && k !== 'status');
      logAudit({ action: 'update', category: 'user', userId: locals.user!.id, username: locals.user!.username, resourceType: 'user', resourceId: params.id, detail: { fields } });
    }
  }

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  // Cannot delete yourself
  if (params.id === locals.user!.id) {
    return json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(params.id) as Pick<UserRow, 'id' | 'username' | 'role'> | undefined;
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  // Prevent deleting the last admin
  if (user.role === 'admin') {
    const adminCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'"
    ).get() as { cnt: number };
    if (adminCount.cnt <= 1) {
      return json({ error: 'Cannot delete the last admin' }, { status: 400 });
    }
  }

  // Transfer ownership and delete user atomically
  const adminId = locals.user!.id;
  const deleteUser = db.transaction(() => {
    db.prepare(
      `UPDATE project_permissions SET user_id = ? WHERE user_id = ? AND permission = 'owner'`
    ).run(adminId, params.id);
    db.prepare(
      `UPDATE project_index SET user_id = ? WHERE user_id = ?`
    ).run(adminId, params.id);
    db.prepare('DELETE FROM project_permissions WHERE user_id = ?').run(params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  });
  deleteUser();

  logAudit({ action: 'delete', category: 'user', userId: locals.user!.id, username: locals.user!.username, resourceType: 'user', resourceId: params.id, detail: { deletedUsername: user.username } });

  return json({ ok: true });
};

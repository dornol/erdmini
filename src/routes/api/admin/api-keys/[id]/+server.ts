import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const keyRow = db.prepare('SELECT name FROM api_keys WHERE id = ?').get(params.id) as { name: string } | undefined;

  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(params.id);
  if (result.changes === 0) {
    return json({ error: 'API key not found' }, { status: 404 });
  }

  logAudit({ action: 'delete', category: 'api-key', userId: locals.user!.id, username: locals.user!.username, resourceType: 'api-key', resourceId: params.id, detail: { name: keyRow?.name } });

  return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const key = db.prepare('SELECT id FROM api_keys WHERE id = ?').get(params.id) as { id: string } | undefined;
  if (!key) {
    return json({ error: 'API key not found' }, { status: 404 });
  }

  const { name, scopes, expiresAt } = await request.json();

  // Update name if provided
  if (typeof name === 'string' && name.trim()) {
    db.prepare('UPDATE api_keys SET name = ? WHERE id = ?').run(name.trim(), params.id);
  }

  // Update expiresAt if provided (null to remove expiry)
  if (expiresAt !== undefined) {
    db.prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?').run(expiresAt, params.id);
  }

  // Update scopes if provided
  if (Array.isArray(scopes)) {
    db.prepare('DELETE FROM api_key_scopes WHERE api_key_id = ?').run(params.id);

    if (scopes.length > 0) {
      const insertScope = db.prepare(
        `INSERT INTO api_key_scopes (id, api_key_id, project_id, permission)
         VALUES (?, ?, ?, ?)`
      );
      for (const scope of scopes) {
        if (scope.projectId && scope.permission) {
          insertScope.run(randomUUID(), params.id, scope.projectId, scope.permission);
        }
      }
    }
  }

  const fields = Object.keys({ name, scopes, expiresAt }).filter(k => ({ name, scopes, expiresAt } as Record<string, unknown>)[k] !== undefined);
  logAudit({ action: 'update', category: 'api-key', userId: locals.user!.id, username: locals.user!.username, resourceType: 'api-key', resourceId: params.id, detail: { fields } });

  return json({ success: true });
};

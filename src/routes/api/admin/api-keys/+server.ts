import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { generateApiKey } from '$lib/server/auth/api-key';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { ApiKeyRow, ApiKeyScopeRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';

const VALID_SCOPE_PERMISSIONS = new Set(['viewer', 'editor', 'owner']);

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const keys = db.prepare(
    `SELECT ak.id, ak.user_id, ak.name, ak.created_at, ak.last_used_at, ak.expires_at,
            u.display_name AS user_display_name, u.username
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     ORDER BY ak.created_at DESC`
  ).all() as (Omit<ApiKeyRow, 'key_hash'> & { user_display_name: string; username: string | null })[];

  // Attach scopes to each key
  const scopeStmt = db.prepare(
    'SELECT id, api_key_id, project_id, permission FROM api_key_scopes WHERE api_key_id = ?'
  );
  const result = keys.map(k => ({
    ...k,
    scopes: scopeStmt.all(k.id) as ApiKeyScopeRow[],
  }));

  return json(result);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { name, userId, expiresAt, scopes } = await request.json();

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 });
  }

  const targetUserId = userId || locals.user!.id;

  // Verify target user exists
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  if (expiresAt) {
    const d = new Date(expiresAt);
    if (isNaN(d.getTime())) {
      return json({ error: 'Invalid expiresAt date' }, { status: 400 });
    }
  }

  const id = randomUUID();
  const { key, hash } = generateApiKey();

  db.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, name, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, targetUserId, hash, name, expiresAt || null);

  // Insert scopes if provided
  if (Array.isArray(scopes) && scopes.length > 0) {
    const insertScope = db.prepare(
      `INSERT INTO api_key_scopes (id, api_key_id, project_id, permission)
       VALUES (?, ?, ?, ?)`
    );
    for (const scope of scopes) {
      if (scope.projectId && scope.permission && VALID_SCOPE_PERMISSIONS.has(scope.permission)) {
        insertScope.run(randomUUID(), id, scope.projectId, scope.permission);
      }
    }
  }

  logAudit({ action: 'create', category: 'api-key', userId: locals.user!.id, username: locals.user!.username, resourceType: 'api-key', resourceId: id, detail: { name, targetUserId, scopes: scopes?.length ?? 0 } });

  // Return the raw key only once
  return json({ id, key, name, userId: targetUserId, expiresAt: expiresAt || null }, { status: 201 });
};

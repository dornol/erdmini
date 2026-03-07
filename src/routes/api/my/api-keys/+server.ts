import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { generateApiKey } from '$lib/server/auth/api-key';
import { hasProjectAccess } from '$lib/server/auth/permissions';
import { requirePermission } from '$lib/server/auth/guards';
import { randomUUID } from 'crypto';
import type { ApiKeyRow, ApiKeyScopeRow } from '$lib/types/auth';

const VALID_SCOPE_PERMISSIONS = new Set(['viewer', 'editor']);

function requireUser(locals: App.Locals) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export const GET: RequestHandler = ({ locals }) => {
  const err = requireUser(locals);
  if (err) return err;

  const keys = db.prepare(
    `SELECT id, name, created_at, last_used_at, expires_at
     FROM api_keys WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(locals.user!.id) as Omit<ApiKeyRow, 'key_hash' | 'user_id'>[];

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
  const err = requireUser(locals);
  if (err) return err;

  const permErr = requirePermission(locals, 'canCreateApiKey');
  if (permErr) return permErr;

  const { name, expiresAt, scopes } = await request.json();

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 });
  }

  if (expiresAt) {
    const d = new Date(expiresAt);
    if (isNaN(d.getTime())) {
      return json({ error: 'Invalid expiresAt date' }, { status: 400 });
    }
  }

  const id = randomUUID();
  const { key, hash } = generateApiKey();

  const insertKey = db.transaction(() => {
    db.prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, name, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, locals.user!.id, hash, name, expiresAt || null);

    if (Array.isArray(scopes) && scopes.length > 0) {
      const insertScope = db.prepare(
        `INSERT INTO api_key_scopes (id, api_key_id, project_id, permission)
         VALUES (?, ?, ?, ?)`
      );
      for (const scope of scopes) {
        if (scope.projectId && scope.permission && VALID_SCOPE_PERMISSIONS.has(scope.permission)) {
          if (hasProjectAccess(db, scope.projectId, locals.user!.id, locals.user!.role, 'viewer')) {
            insertScope.run(randomUUID(), id, scope.projectId, scope.permission);
          }
        }
      }
    }
  });

  try {
    insertKey();
  } catch (e: any) {
    return json({ error: e.message || 'Failed to create key' }, { status: 500 });
  }

  return json({ id, key, name, expiresAt: expiresAt || null }, { status: 201 });
};

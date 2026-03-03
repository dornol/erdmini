import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { randomUUID } from 'crypto';

function requireUser(locals: App.Locals) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireUser(locals);
  if (err) return err;

  const result = db.prepare(
    'DELETE FROM api_keys WHERE id = ? AND user_id = ?'
  ).run(params.id, locals.user!.id);

  if (result.changes === 0) {
    return json({ error: 'API key not found' }, { status: 404 });
  }

  return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  const err = requireUser(locals);
  if (err) return err;

  // Verify ownership
  const key = db.prepare(
    'SELECT id FROM api_keys WHERE id = ? AND user_id = ?'
  ).get(params.id, locals.user!.id) as { id: string } | undefined;

  if (!key) {
    return json({ error: 'API key not found' }, { status: 404 });
  }

  const { scopes } = await request.json();

  if (Array.isArray(scopes)) {
    // Replace all scopes
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

  return json({ success: true });
};

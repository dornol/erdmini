import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(params.id);
  if (result.changes === 0) {
    return json({ error: 'API key not found' }, { status: 404 });
  }

  return json({ success: true });
};

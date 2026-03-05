import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { checkProjectAccess } from '$lib/server/auth/guards';
import { auditSchemaChanges, type SchemaBlob } from '$lib/server/audit';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'viewer');
  if (err) return err;

  const row = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(params.id) as { data: string } | undefined;
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return json(JSON.parse(row.data));
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'editor');
  if (err) return err;

  const body = await request.json();
  if (!body || typeof body !== 'object' || !Array.isArray(body.tables)) {
    return json({ error: 'Invalid schema: must be an object with tables array' }, { status: 400 });
  }
  const data = JSON.stringify(body);

  // Load old schema for audit diff
  let oldSchema: SchemaBlob | null = null;
  if (locals.user) {
    const oldRow = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(params.id) as { data: string } | undefined;
    if (oldRow) {
      try { oldSchema = JSON.parse(oldRow.data); } catch { /* ignore */ }
    }
  }

  db.prepare(
    'INSERT INTO schemas (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = datetime(\'now\')'
  ).run(params.id, data);

  // Audit significant schema changes
  if (locals.user && oldSchema) {
    auditSchemaChanges(locals.user, params.id, oldSchema, body);
  }

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.id, 'owner');
  if (err) return err;

  db.prepare('DELETE FROM schemas WHERE project_id = ?').run(params.id);
  db.prepare('DELETE FROM schema_snapshots WHERE project_id = ?').run(params.id);
  db.prepare('DELETE FROM project_permissions WHERE project_id = ?').run(params.id);
  db.prepare('DELETE FROM embed_tokens WHERE project_id = ?').run(params.id);
  return json({ ok: true });
};

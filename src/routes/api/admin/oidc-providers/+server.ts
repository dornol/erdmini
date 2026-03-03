import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { randomUUID } from 'crypto';
import type { OIDCProviderRow } from '$lib/types/auth';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const providers = db.prepare(
    'SELECT * FROM oidc_providers ORDER BY created_at'
  ).all() as OIDCProviderRow[];

  return json(providers);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers } =
    await request.json();

  if (!displayName || !issuerUrl || !clientId || !clientSecret) {
    return json({ error: 'displayName, issuerUrl, clientId, clientSecret required' }, { status: 400 });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO oidc_providers (id, display_name, issuer_url, client_id, client_secret, scopes, enabled, auto_create_users)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    displayName,
    issuerUrl,
    clientId,
    clientSecret,
    scopes || 'openid email profile',
    enabled ? 1 : 0,
    autoCreateUsers ? 1 : 0,
  );

  return json({ id, displayName, issuerUrl }, { status: 201 });
};

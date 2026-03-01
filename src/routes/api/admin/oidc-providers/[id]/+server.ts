import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { clearConfigCache } from '$lib/server/auth/oidc';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers } =
    await request.json();

  db.prepare(
    `UPDATE oidc_providers
     SET display_name = COALESCE(?, display_name),
         issuer_url = COALESCE(?, issuer_url),
         client_id = COALESCE(?, client_id),
         client_secret = COALESCE(?, client_secret),
         scopes = COALESCE(?, scopes),
         enabled = COALESCE(?, enabled),
         auto_create_users = COALESCE(?, auto_create_users)
     WHERE id = ?`
  ).run(
    displayName ?? null,
    issuerUrl ?? null,
    clientId ?? null,
    clientSecret ?? null,
    scopes ?? null,
    enabled ?? null,
    autoCreateUsers ?? null,
    params.id,
  );

  // Clear cached OIDC config
  clearConfigCache(params.id);

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  db.prepare('DELETE FROM oidc_providers WHERE id = ?').run(params.id);
  clearConfigCache(params.id);

  return json({ ok: true });
};

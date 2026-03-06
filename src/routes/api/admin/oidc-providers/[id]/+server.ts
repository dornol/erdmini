import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { clearConfigCache } from '$lib/server/auth/oidc';
import { requireAdmin } from '$lib/server/auth/guards';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers, syncGroups, groupClaim, allowedGroups } =
    await request.json();

  db.prepare(
    `UPDATE oidc_providers
     SET display_name = COALESCE(?, display_name),
         issuer_url = COALESCE(?, issuer_url),
         client_id = COALESCE(?, client_id),
         client_secret = COALESCE(?, client_secret),
         scopes = COALESCE(?, scopes),
         enabled = COALESCE(?, enabled),
         auto_create_users = COALESCE(?, auto_create_users),
         sync_groups = COALESCE(?, sync_groups),
         group_claim = COALESCE(?, group_claim),
         allowed_groups = COALESCE(?, allowed_groups)
     WHERE id = ?`
  ).run(
    displayName ?? null,
    issuerUrl ?? null,
    clientId ?? null,
    clientSecret ?? null,
    scopes ?? null,
    enabled ?? null,
    autoCreateUsers ?? null,
    syncGroups ?? null,
    groupClaim ?? null,
    allowedGroups ?? null,
    params.id,
  );

  // Clear cached OIDC config
  clearConfigCache(params.id);

  const body = { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers, syncGroups, groupClaim, allowedGroups };
  const fields = Object.keys(body).filter(k => (body as Record<string, unknown>)[k] != null);
  logAudit({ action: 'update', category: 'oidc-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: params.id, detail: { fields } });

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const provider = db.prepare('SELECT display_name FROM oidc_providers WHERE id = ?').get(params.id) as { display_name: string } | undefined;

  db.prepare('DELETE FROM oidc_providers WHERE id = ?').run(params.id);
  clearConfigCache(params.id);

  logAudit({ action: 'delete', category: 'oidc-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: params.id, detail: { displayName: provider?.display_name } });

  return json({ ok: true });
};

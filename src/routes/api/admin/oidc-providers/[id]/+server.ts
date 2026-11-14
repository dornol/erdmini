import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { clearConfigCache } from '$lib/server/auth/oidc';
import { requireAdmin } from '$lib/server/auth/guards';
import { validateProviderInput } from '$lib/server/auth/provider-validation';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }
  const validationError = validateProviderInput(body, 'oidc', false);
  if (validationError) return json({ error: validationError }, { status: 400 });
  if (body.displayName !== undefined) body.displayName = body.displayName.trim();
  if (body.issuerUrl !== undefined) body.issuerUrl = body.issuerUrl.trim();
  if (body.clientId !== undefined) body.clientId = body.clientId.trim();
  const { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers, syncGroups, groupClaim, allowedGroups, adminGroups } =
    body;
  if (issuerUrl !== undefined && db.prepare('SELECT id FROM oidc_providers WHERE issuer_url = ? AND id != ?').get(issuerUrl, params.id)) {
    return json({ error: 'A provider with this issuer URL already exists' }, { status: 409 });
  }
  const dbBool = (value: unknown) => typeof value === 'boolean' ? (value ? 1 : 0) : value ?? null;

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
         allowed_groups = COALESCE(?, allowed_groups),
         admin_groups = COALESCE(?, admin_groups)
     WHERE id = ?`
  ).run(
    displayName ?? null,
    issuerUrl ?? null,
    clientId ?? null,
    clientSecret === '' ? null : clientSecret ?? null,
    scopes ?? null,
    dbBool(enabled),
    dbBool(autoCreateUsers),
    dbBool(syncGroups),
    groupClaim ?? null,
    allowedGroups ?? null,
    adminGroups ?? null,
    params.id,
  );

  // Clear cached OIDC config
  clearConfigCache(params.id);

  const auditBody = { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers, syncGroups, groupClaim, allowedGroups, adminGroups };
  const fields = Object.keys(auditBody).filter(k => (auditBody as Record<string, unknown>)[k] != null);
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

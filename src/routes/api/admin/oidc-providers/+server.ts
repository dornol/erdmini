import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { OIDCProviderRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const providers = db.prepare(
    'SELECT * FROM oidc_providers ORDER BY created_at'
  ).all() as OIDCProviderRow[];

  const filtered = providers.map(({ client_secret, ...rest }) => rest);
  return json(filtered);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { displayName, issuerUrl, clientId, clientSecret, scopes, enabled, autoCreateUsers, syncGroups, groupClaim, allowedGroups, adminGroups } =
    await request.json();

  if (!displayName || !issuerUrl || !clientId || !clientSecret) {
    return json({ error: 'displayName, issuerUrl, clientId, clientSecret required' }, { status: 400 });
  }

  const existing = db.prepare('SELECT id FROM oidc_providers WHERE issuer_url = ?').get(issuerUrl) as { id: string } | undefined;
  if (existing) {
    return json({ error: 'A provider with this issuer URL already exists' }, { status: 409 });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO oidc_providers (id, display_name, issuer_url, client_id, client_secret, scopes, enabled, auto_create_users, sync_groups, group_claim, allowed_groups, admin_groups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    displayName,
    issuerUrl,
    clientId,
    clientSecret,
    scopes || 'openid email profile',
    enabled ? 1 : 0,
    autoCreateUsers ? 1 : 0,
    syncGroups ? 1 : 0,
    groupClaim || 'groups',
    allowedGroups || '',
    adminGroups || '',
  );

  logAudit({ action: 'create', category: 'oidc-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: id, detail: { displayName, issuerUrl } });

  return json({ id, displayName, issuerUrl }, { status: 201 });
};

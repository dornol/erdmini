import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { LdapProviderRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';
import { validateProviderInput } from '$lib/server/auth/provider-validation';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const providers = db.prepare(
    'SELECT * FROM ldap_providers ORDER BY created_at'
  ).all() as LdapProviderRow[];

  // Filter out bind_password before returning
  const filtered = providers.map(({ bind_password, ...rest }) => rest);
  return json(filtered);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }
  const validationError = validateProviderInput(body, 'ldap', true);
  if (validationError) return json({ error: validationError }, { status: 400 });
  if (body.displayName !== undefined) body.displayName = body.displayName.trim();
  if (body.serverUrl !== undefined) body.serverUrl = body.serverUrl.trim();
  if (body.bindDn !== undefined) body.bindDn = body.bindDn.trim();
  if (body.userSearchBase !== undefined) body.userSearchBase = body.userSearchBase.trim();
  const {
    displayName, serverUrl, bindDn, bindPassword,
    userSearchBase, userSearchFilter, emailAttribute, displayNameAttribute,
    groupSearchBase, groupSearchFilter, adminGroupDn, allowedGroupDns,
    startTls, enabled, autoCreateUsers, syncGroups,
  } = body;

  if (!displayName || !serverUrl || !bindDn || !bindPassword || !userSearchBase) {
    return json({ error: 'displayName, serverUrl, bindDn, bindPassword, userSearchBase required' }, { status: 400 });
  }

  const existing = db.prepare('SELECT id FROM ldap_providers WHERE server_url = ?').get(serverUrl) as { id: string } | undefined;
  if (existing) {
    return json({ error: 'A provider with this server URL already exists' }, { status: 409 });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ldap_providers (id, display_name, server_url, bind_dn, bind_password,
      user_search_base, user_search_filter, email_attribute, display_name_attribute,
      group_search_base, group_search_filter, admin_group_dn, allowed_group_dns,
      start_tls, enabled, auto_create_users, sync_groups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, displayName, serverUrl, bindDn, bindPassword,
    userSearchBase,
    userSearchFilter || '(uid={{username}})',
    emailAttribute || 'mail',
    displayNameAttribute || 'cn',
    groupSearchBase || null,
    groupSearchFilter || '(member={{userDn}})',
    adminGroupDn || null,
    allowedGroupDns || null,
    startTls ? 1 : 0,
    enabled !== false && enabled !== 0 ? 1 : 0,
    autoCreateUsers !== false && autoCreateUsers !== 0 ? 1 : 0,
    syncGroups ? 1 : 0,
  );

  logAudit({ action: 'create', category: 'ldap-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: id, detail: { displayName, serverUrl } });

  return json({ id, displayName, serverUrl }, { status: 201 });
};

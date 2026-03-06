import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { randomUUID } from 'crypto';
import type { LdapProviderRow } from '$lib/types/auth';
import { requireAdmin } from '$lib/server/auth/guards';

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

  const {
    displayName, serverUrl, bindDn, bindPassword,
    userSearchBase, userSearchFilter, emailAttribute, displayNameAttribute,
    groupSearchBase, groupSearchFilter, adminGroupDn, allowedGroupDns,
    startTls, enabled, autoCreateUsers, syncGroups,
  } = await request.json();

  if (!displayName || !serverUrl || !bindDn || !bindPassword || !userSearchBase) {
    return json({ error: 'displayName, serverUrl, bindDn, bindPassword, userSearchBase required' }, { status: 400 });
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
    enabled !== false ? 1 : 0,
    autoCreateUsers !== false ? 1 : 0,
    syncGroups ? 1 : 0,
  );

  logAudit({ action: 'create', category: 'ldap-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: id, detail: { displayName, serverUrl } });

  return json({ id, displayName, serverUrl }, { status: 201 });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { requireAdmin } from '$lib/server/auth/guards';
import { validateProviderInput } from '$lib/server/auth/provider-validation';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }
  const validationError = validateProviderInput(body, 'ldap', false);
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
  if (serverUrl !== undefined && db.prepare('SELECT id FROM ldap_providers WHERE server_url = ? AND id != ?').get(serverUrl, params.id)) {
    return json({ error: 'A provider with this server URL already exists' }, { status: 409 });
  }
  const dbBool = (value: unknown) => typeof value === 'boolean' ? (value ? 1 : 0) : value ?? null;

  db.prepare(
    `UPDATE ldap_providers
     SET display_name = COALESCE(?, display_name),
         server_url = COALESCE(?, server_url),
         bind_dn = COALESCE(?, bind_dn),
         bind_password = COALESCE(?, bind_password),
         user_search_base = COALESCE(?, user_search_base),
         user_search_filter = COALESCE(?, user_search_filter),
         email_attribute = COALESCE(?, email_attribute),
         display_name_attribute = COALESCE(?, display_name_attribute),
         group_search_base = COALESCE(?, group_search_base),
         group_search_filter = COALESCE(?, group_search_filter),
         admin_group_dn = COALESCE(?, admin_group_dn),
         allowed_group_dns = COALESCE(?, allowed_group_dns),
         start_tls = COALESCE(?, start_tls),
         enabled = COALESCE(?, enabled),
         auto_create_users = COALESCE(?, auto_create_users),
         sync_groups = COALESCE(?, sync_groups)
     WHERE id = ?`
  ).run(
    displayName ?? null,
    serverUrl ?? null,
    bindDn ?? null,
    bindPassword === '' ? null : bindPassword ?? null,
    userSearchBase ?? null,
    userSearchFilter ?? null,
    emailAttribute ?? null,
    displayNameAttribute ?? null,
    groupSearchBase ?? null,
    groupSearchFilter ?? null,
    adminGroupDn ?? null,
    allowedGroupDns ?? null,
    dbBool(startTls),
    dbBool(enabled),
    dbBool(autoCreateUsers),
    dbBool(syncGroups),
    params.id,
  );

  const auditBody = { displayName, serverUrl, bindDn, bindPassword, userSearchBase, userSearchFilter, emailAttribute, displayNameAttribute, groupSearchBase, groupSearchFilter, adminGroupDn, allowedGroupDns, startTls, enabled, autoCreateUsers, syncGroups };
  const fields = Object.keys(auditBody).filter(k => (auditBody as Record<string, unknown>)[k] != null);
  logAudit({ action: 'update', category: 'ldap-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: params.id, detail: { fields } });

  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const provider = db.prepare('SELECT display_name FROM ldap_providers WHERE id = ?').get(params.id) as { display_name: string } | undefined;

  db.prepare('DELETE FROM ldap_providers WHERE id = ?').run(params.id);

  logAudit({ action: 'delete', category: 'ldap-provider', userId: locals.user!.id, username: locals.user!.username, resourceType: 'provider', resourceId: params.id, detail: { displayName: provider?.display_name } });

  return json({ ok: true });
};

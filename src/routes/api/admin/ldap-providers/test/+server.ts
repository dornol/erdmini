import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testLdapConnection } from '$lib/server/auth/ldap';
import { requireAdmin } from '$lib/server/auth/guards';

export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { serverUrl, bindDn, bindPassword, startTls, userSearchBase } = await request.json();

  if (!serverUrl || !bindDn || !bindPassword || !userSearchBase) {
    return json({ error: 'serverUrl, bindDn, bindPassword, userSearchBase required' }, { status: 400 });
  }

  const result = await testLdapConnection({
    server_url: serverUrl,
    bind_dn: bindDn,
    bind_password: bindPassword,
    start_tls: startTls ? 1 : 0,
    user_search_base: userSearchBase,
  });

  return json(result);
};

import { Client } from 'ldapts';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { LdapProviderRow } from '$lib/types/auth';
import { logger } from '$lib/server/logger';
import { getDefaultPermissions } from '$lib/server/site-settings';

export interface LdapAuthResult {
  dn: string;
  email: string | undefined;
  displayName: string | undefined;
  isAdmin: boolean;
  groups: string[];
}

/**
 * Authenticate a user against an LDAP provider.
 * 1. Bind with service account
 * 2. Search for user by username
 * 3. Bind as user to verify password
 * 4. Optionally check group membership for admin role
 */
export async function authenticateLdap(
  provider: LdapProviderRow,
  username: string,
  password: string,
): Promise<LdapAuthResult | null> {
  const client = new Client({ url: provider.server_url });

  try {
    if (provider.start_tls) {
      await client.startTLS({});
    }

    // Bind with service account
    await client.bind(provider.bind_dn, provider.bind_password);

    // Search for user
    const filter = provider.user_search_filter.replace(/\{\{username\}\}/g, username);
    const { searchEntries } = await client.search(provider.user_search_base, {
      scope: 'sub',
      filter,
      attributes: ['dn', provider.email_attribute, provider.display_name_attribute],
    });

    if (searchEntries.length === 0) {
      return null;
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;

    // Unbind service account, bind as user to verify password
    await client.unbind();

    const userClient = new Client({ url: provider.server_url });
    try {
      if (provider.start_tls) {
        await userClient.startTLS({});
      }
      await userClient.bind(userDn, password);
    } catch {
      return null; // Invalid password
    } finally {
      try { await userClient.unbind(); } catch { /* ignore */ }
    }

    // Extract attributes
    const emailAttr = entry[provider.email_attribute];
    const email = Array.isArray(emailAttr) ? String(emailAttr[0]) : emailAttr ? String(emailAttr) : undefined;

    const nameAttr = entry[provider.display_name_attribute];
    const displayName = Array.isArray(nameAttr) ? String(nameAttr[0]) : nameAttr ? String(nameAttr) : undefined;

    // Check group membership (allowed groups + admin group)
    let isAdmin = false;
    let userGroupDns: string[] = [];
    const needGroupCheck = provider.group_search_base &&
      (provider.admin_group_dn || provider.allowed_group_dns || (provider as LdapProviderRow & { sync_groups?: number }).sync_groups);

    if (needGroupCheck) {
      const groupClient = new Client({ url: provider.server_url });
      try {
        if (provider.start_tls) {
          await groupClient.startTLS({});
        }
        await groupClient.bind(provider.bind_dn, provider.bind_password);

        const groupFilter = (provider.group_search_filter || '(member={{userDn}})').replace(/\{\{userDn\}\}/g, userDn);
        const { searchEntries: groups } = await groupClient.search(provider.group_search_base!, {
          scope: 'sub',
          filter: groupFilter,
          attributes: ['dn'],
        });

        userGroupDns = groups.map(g => g.dn);

        // Check allowed groups restriction
        if (provider.allowed_group_dns) {
          const allowedDns = provider.allowed_group_dns.split(',').map(s => s.trim()).filter(Boolean);
          const isAllowed = userGroupDns.some(dn => allowedDns.includes(dn));
          if (!isAllowed) {
            logger.info('auth', 'LDAP user not in allowed groups', { userDn, allowedGroups: allowedDns.length });
            return null;
          }
        }

        // Check admin group
        if (provider.admin_group_dn) {
          isAdmin = userGroupDns.includes(provider.admin_group_dn);
        }
      } catch (e) {
        logger.warn('auth', 'LDAP group search failed', { error: e instanceof Error ? e.message : String(e) });
        // If allowed_group_dns is set but group search fails, deny access for safety
        if (provider.allowed_group_dns) {
          return null;
        }
      } finally {
        try { await groupClient.unbind(); } catch { /* ignore */ }
      }
    }

    return { dn: userDn, email, displayName, isAdmin, groups: userGroupDns };
  } catch (e) {
    logger.error('auth', 'LDAP authentication error', { error: e instanceof Error ? e.message : String(e) });
    return null;
  } finally {
    try { await client.unbind(); } catch { /* ignore */ }
  }
}

/**
 * Find existing LDAP user or create a new one.
 * Follows the same pattern as findOrCreateOIDCUser.
 */
export function findOrCreateLdapUser(
  db: Database.Database,
  providerId: string,
  ldapDn: string,
  email: string | undefined,
  displayName: string | undefined,
  role: 'admin' | 'user',
  autoCreate: boolean,
): { userId: string; status: string; created?: boolean } | null {
  // Check existing identity
  const existing = db.prepare(
    `SELECT li.user_id, u.status
     FROM ldap_identities li
     JOIN users u ON u.id = li.user_id
     WHERE li.provider_id = ? AND li.ldap_dn = ?`
  ).get(providerId, ldapDn) as { user_id: string; status: string } | undefined;

  if (existing) {
    // Update role if admin group mapping changed
    if (role === 'admin') {
      db.prepare('UPDATE users SET role = ? WHERE id = ? AND role != ?').run('admin', existing.user_id, 'admin');
    }
    return { userId: existing.user_id, status: existing.status };
  }

  if (!autoCreate) {
    return null;
  }

  // Determine status: active if auto-create is on
  const status = 'active';

  // Create new user with default permissions
  const userId = randomUUID();
  const name = displayName || email || `ldap_${ldapDn.substring(0, 16)}`;
  const defaults = getDefaultPermissions(db);

  db.prepare(
    `INSERT INTO users (id, display_name, email, role, status, can_create_project, can_create_api_key, can_create_embed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, name, email || null, role, status, defaults.canCreateProject, defaults.canCreateApiKey, defaults.canCreateEmbed);

  // Link identity
  const identityId = randomUUID();
  db.prepare(
    'INSERT INTO ldap_identities (id, user_id, provider_id, ldap_dn) VALUES (?, ?, ?, ?)'
  ).run(identityId, userId, providerId, ldapDn);

  return { userId, status, created: true };
}

/**
 * Test LDAP connection by binding with the service account.
 */
export async function testLdapConnection(
  provider: Pick<LdapProviderRow, 'server_url' | 'bind_dn' | 'bind_password' | 'start_tls' | 'user_search_base'>,
): Promise<{ success: boolean; error?: string }> {
  const client = new Client({ url: provider.server_url });

  try {
    if (provider.start_tls) {
      await client.startTLS({});
    }
    await client.bind(provider.bind_dn, provider.bind_password);

    // Try searching to verify base DN
    await client.search(provider.user_search_base, {
      scope: 'base',
      filter: '(objectClass=*)',
      attributes: ['dn'],
      sizeLimit: 1,
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try { await client.unbind(); } catch { /* ignore */ }
  }
}

import type Database from 'better-sqlite3';
import { generateId } from '$lib/utils/common';
import { logAudit } from '$lib/server/audit';

/**
 * Extract CN (Common Name) from an LDAP Distinguished Name.
 * e.g. "cn=developers,ou=groups,dc=example,dc=com" → "developers"
 */
export function extractCN(dn: string): string {
  const match = dn.match(/^cn=([^,]+)/i);
  return match ? match[1] : dn;
}

/**
 * Synchronize a user's group memberships based on external provider groups.
 *
 * 1. Filter external groups by allowedGroups (if non-empty)
 * 2. Auto-create missing groups in DB
 * 3. Add user to new groups, remove from groups no longer in external list
 *    (only touches groups from the same source+provider)
 */
export function syncUserGroups(
  db: Database.Database,
  userId: string,
  externalGroups: string[],
  source: 'oidc' | 'ldap',
  providerId: string,
  allowedGroups?: string[],
): void {
  // Filter by allowed groups if specified
  let groups = externalGroups;
  if (allowedGroups && allowedGroups.length > 0) {
    const allowedSet = new Set(allowedGroups.map(g => g.toLowerCase()));
    groups = externalGroups.filter(g => allowedSet.has(g.toLowerCase()));
  }

  // Ensure all groups exist in DB
  const groupIds: string[] = [];
  for (const groupName of groups) {
    const existing = db.prepare(
      'SELECT id FROM groups WHERE name = ?'
    ).get(groupName) as { id: string } | undefined;

    if (existing) {
      groupIds.push(existing.id);
    } else {
      const id = generateId();
      db.prepare(
        'INSERT INTO groups (id, name, description, created_by, source, source_provider_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, groupName, null, userId, source, providerId);
      groupIds.push(id);
    }
  }

  // Get current memberships for groups from this source+provider
  const currentMemberships = db.prepare(
    `SELECT gm.group_id FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
     WHERE gm.user_id = ? AND g.source = ? AND g.source_provider_id = ?`
  ).all(userId, source, providerId) as { group_id: string }[];

  const currentGroupIds = new Set(currentMemberships.map(m => m.group_id));
  const targetGroupIds = new Set(groupIds);

  // Add to new groups
  for (const groupId of targetGroupIds) {
    if (!currentGroupIds.has(groupId)) {
      const id = generateId();
      db.prepare(
        'INSERT OR IGNORE INTO group_members (id, group_id, user_id) VALUES (?, ?, ?)'
      ).run(id, groupId, userId);
    }
  }

  // Remove from groups no longer in external list
  for (const groupId of currentGroupIds) {
    if (!targetGroupIds.has(groupId)) {
      db.prepare(
        'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
      ).run(groupId, userId);
    }
  }

  logAudit({
    action: 'sync_groups',
    category: 'group',
    userId,
    detail: { source, providerId, groups, added: groupIds.filter(id => !currentGroupIds.has(id)).length, removed: [...currentGroupIds].filter(id => !targetGroupIds.has(id)).length },
  });
}

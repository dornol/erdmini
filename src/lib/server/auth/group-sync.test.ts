import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track all prepare().run() and prepare().get() and prepare().all() calls with their SQL
const calls: { sql: string; method: string; args: unknown[] }[] = [];
let mockGetReturn: unknown = undefined;
let mockGetReturns: unknown[] = [];
let mockGetCallIndex = 0;
let mockAllReturn: unknown[] = [];

const { mockLogAudit } = vi.hoisted(() => ({
  mockLogAudit: vi.fn(),
}));

const mockPrepare = vi.fn((sql: string) => ({
  get: vi.fn((...args: unknown[]) => {
    calls.push({ sql, method: 'get', args });
    if (mockGetReturns.length > 0) {
      return mockGetReturns[mockGetCallIndex++];
    }
    return mockGetReturn;
  }),
  run: vi.fn((...args: unknown[]) => {
    calls.push({ sql, method: 'run', args });
  }),
  all: vi.fn((...args: unknown[]) => {
    calls.push({ sql, method: 'all', args });
    return mockAllReturn;
  }),
}));

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

vi.mock('$lib/server/audit', () => ({
  logAudit: mockLogAudit,
}));

vi.mock('$lib/utils/common', () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => `mock-id-${++counter}`),
  };
});

import { syncUserGroups, extractCN } from './group-sync';

const mockDb = { prepare: mockPrepare } as any;

// ─── Helpers ─────────────────────────────────────────────────────────
function getCallsByPattern(sqlPattern: string, method?: string) {
  return calls.filter(c =>
    c.sql.includes(sqlPattern) && (method ? c.method === method : true)
  );
}

describe('extractCN', () => {
  it('extracts CN from simple DN', () => {
    expect(extractCN('cn=developers,ou=groups,dc=example,dc=com')).toBe('developers');
  });

  it('extracts CN case-insensitively', () => {
    expect(extractCN('CN=Admins,OU=Groups,DC=corp,DC=com')).toBe('Admins');
  });

  it('returns full string if no CN found', () => {
    expect(extractCN('ou=groups,dc=example,dc=com')).toBe('ou=groups,dc=example,dc=com');
  });

  it('handles CN with spaces', () => {
    expect(extractCN('cn=Dev Team,ou=groups,dc=example,dc=com')).toBe('Dev Team');
  });

  it('handles empty string', () => {
    expect(extractCN('')).toBe('');
  });

  it('handles CN without trailing components (single value)', () => {
    expect(extractCN('cn=onlyvalue')).toBe('onlyvalue');
  });

  it('handles CN with special characters', () => {
    expect(extractCN('cn=grp-dev_01,ou=groups')).toBe('grp-dev_01');
  });

  it('handles CN with dots', () => {
    expect(extractCN('cn=team.backend,ou=groups,dc=corp')).toBe('team.backend');
  });

  it('does not extract CN from non-start position', () => {
    // regex uses ^, so CN not at start returns the full DN
    expect(extractCN('ou=groups,cn=nested,dc=example')).toBe('ou=groups,cn=nested,dc=example');
  });

  it('handles mixed case cn=', () => {
    expect(extractCN('Cn=MixedCase,ou=groups')).toBe('MixedCase');
  });
});

describe('syncUserGroups', () => {
  beforeEach(() => {
    calls.length = 0;
    mockGetReturn = undefined;
    mockGetReturns = [];
    mockGetCallIndex = 0;
    mockAllReturn = [];
    mockPrepare.mockClear();
    mockLogAudit.mockClear();
  });

  // ─── Group creation ──────────────────────────────────────────────

  it('creates new groups and adds memberships', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['developers', 'testers'], 'oidc', 'provider1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(2);

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(2);
  });

  it('reuses existing groups without creating duplicates', () => {
    mockGetReturns = [
      { id: 'existing-group-id' },
      undefined,
    ];
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['developers', 'newgroup'], 'oidc', 'provider1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(1);
    expect(insertGroupCalls[0].args[1]).toBe('newgroup');
  });

  it('sets correct source and source_provider_id on new groups', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['devs'], 'ldap', 'ldap-prov-1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(1);
    const args = insertGroupCalls[0].args;
    // Args: id, name, null(desc), userId, source, source_provider_id
    expect(args[1]).toBe('devs');
    expect(args[2]).toBe(null);
    expect(args[3]).toBe('user1');
    expect(args[4]).toBe('ldap');
    expect(args[5]).toBe('ldap-prov-1');
  });

  it('passes oidc as source correctly', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['team'], 'oidc', 'oidc-prov-1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls[0].args[4]).toBe('oidc');
    expect(insertGroupCalls[0].args[5]).toBe('oidc-prov-1');
  });

  it('handles groups with special characters in name', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['grp-dev_01', 'team.backend', 'R&D'], 'oidc', 'prov1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(3);
    expect(insertGroupCalls.map(c => c.args[1])).toEqual(['grp-dev_01', 'team.backend', 'R&D']);
  });

  // ─── Membership add/remove ──────────────────────────────────────

  it('removes memberships for groups no longer in external list', () => {
    mockGetReturns = [{ id: 'group1' }];
    mockAllReturn = [
      { group_id: 'group1' },
      { group_id: 'old-group-id' },
    ];

    syncUserGroups(mockDb, 'user1', ['developers'], 'oidc', 'provider1');

    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(1);
    expect(deleteMemberCalls[0].args[0]).toBe('old-group-id');
    expect(deleteMemberCalls[0].args[1]).toBe('user1');
  });

  it('does not re-add existing memberships', () => {
    mockGetReturns = [{ id: 'group1' }];
    mockAllReturn = [{ group_id: 'group1' }];

    syncUserGroups(mockDb, 'user1', ['devs'], 'oidc', 'prov1');

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(0);
  });

  it('handles empty external groups (removes all synced memberships)', () => {
    mockAllReturn = [
      { group_id: 'group1' },
      { group_id: 'group2' },
    ];

    syncUserGroups(mockDb, 'user1', [], 'oidc', 'prov1');

    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(2);
    // Both should target user1
    expect(deleteMemberCalls[0].args[1]).toBe('user1');
    expect(deleteMemberCalls[1].args[1]).toBe('user1');
  });

  it('correctly handles simultaneous add, keep, and remove', () => {
    // External: [A, C] → A: keep, B: remove, C: add
    mockGetReturns = [
      { id: 'groupA' }, // A exists
      { id: 'groupC' }, // C exists
    ];
    mockAllReturn = [
      { group_id: 'groupA' }, // currently member of A
      { group_id: 'groupB' }, // currently member of B (should be removed)
    ];

    syncUserGroups(mockDb, 'user1', ['A', 'C'], 'oidc', 'prov1');

    // Should add C membership
    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(1);
    expect(insertMemberCalls[0].args[1]).toBe('groupC'); // group_id
    expect(insertMemberCalls[0].args[2]).toBe('user1');  // user_id

    // Should remove B membership
    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(1);
    expect(deleteMemberCalls[0].args[0]).toBe('groupB');
    expect(deleteMemberCalls[0].args[1]).toBe('user1');
  });

  it('uses INSERT OR IGNORE for membership (idempotent)', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['devs'], 'oidc', 'prov1');

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(1);
    expect(insertMemberCalls[0].sql).toContain('INSERT OR IGNORE');
  });

  // ─── Manual group isolation ─────────────────────────────────────

  it('only queries memberships from the same source and provider', () => {
    mockGetReturns = [{ id: 'group1' }];
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['devs'], 'oidc', 'prov1');

    const membershipQueries = calls.filter(c => c.method === 'all' && c.sql.includes('group_members'));
    expect(membershipQueries.length).toBe(1);
    expect(membershipQueries[0].sql).toContain('g.source = ?');
    expect(membershipQueries[0].sql).toContain('g.source_provider_id = ?');
    expect(membershipQueries[0].args[0]).toBe('user1');
    expect(membershipQueries[0].args[1]).toBe('oidc');
    expect(membershipQueries[0].args[2]).toBe('prov1');
  });

  it('does not modify memberships from a different provider', () => {
    // User has memberships from prov1, but we sync from prov2
    mockGetReturn = undefined;
    mockAllReturn = []; // prov2 returns no existing memberships

    syncUserGroups(mockDb, 'user1', ['newgrp'], 'oidc', 'prov2');

    // Should not delete anything (prov1 memberships are invisible)
    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(0);
  });

  // ─── allowedGroups filtering ────────────────────────────────────

  it('filters by allowedGroups when provided', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['developers', 'marketing', 'sales'], 'oidc', 'provider1', ['developers', 'sales']);

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(2);
    const groupNames = insertGroupCalls.map(c => c.args[1]);
    expect(groupNames).toContain('developers');
    expect(groupNames).toContain('sales');
    expect(groupNames).not.toContain('marketing');
  });

  it('filters allowedGroups case-insensitively', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['Developers', 'Marketing'], 'oidc', 'provider1', ['developers']);

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(1);
    // Preserves original case from external groups
    expect(insertGroupCalls[0].args[1]).toBe('Developers');
  });

  it('allows all groups when allowedGroups is empty array', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['dev', 'ops', 'qa'], 'oidc', 'provider1', []);

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(3);
  });

  it('allows all groups when allowedGroups is undefined', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['dev', 'ops'], 'oidc', 'provider1', undefined);

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(2);
  });

  it('allows all groups when allowedGroups is omitted', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['dev', 'ops'], 'oidc', 'provider1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(2);
  });

  it('results in no groups when all external groups are filtered out', () => {
    mockGetReturn = undefined;
    mockAllReturn = [{ group_id: 'old-synced' }]; // had a synced membership before

    syncUserGroups(mockDb, 'user1', ['marketing', 'hr'], 'oidc', 'prov1', ['engineering']);

    // No groups should be created
    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(0);

    // Old synced membership should be removed
    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(1);
  });

  // ─── Edge cases ─────────────────────────────────────────────────

  it('handles single group', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['solo'], 'ldap', 'prov1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(1);

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(1);
  });

  it('handles many groups', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    const groups = Array.from({ length: 20 }, (_, i) => `group-${i}`);
    syncUserGroups(mockDb, 'user1', groups, 'oidc', 'prov1');

    const insertGroupCalls = getCallsByPattern('INSERT INTO groups', 'run');
    expect(insertGroupCalls.length).toBe(20);

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(20);
  });

  it('no DB writes when external groups match current memberships exactly', () => {
    mockGetReturns = [{ id: 'g1' }, { id: 'g2' }];
    mockAllReturn = [{ group_id: 'g1' }, { group_id: 'g2' }];

    syncUserGroups(mockDb, 'user1', ['A', 'B'], 'oidc', 'prov1');

    const insertMemberCalls = getCallsByPattern('group_members', 'run')
      .filter(c => c.sql.includes('INSERT'));
    expect(insertMemberCalls.length).toBe(0);

    const deleteMemberCalls = getCallsByPattern('DELETE FROM group_members', 'run');
    expect(deleteMemberCalls.length).toBe(0);
  });

  // ─── logAudit verification ──────────────────────────────────────

  it('calls logAudit with correct parameters', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['devs', 'ops'], 'oidc', 'prov1');

    expect(mockLogAudit).toHaveBeenCalledOnce();
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.action).toBe('sync_groups');
    expect(auditCall.category).toBe('group');
    expect(auditCall.userId).toBe('user1');
    expect(auditCall.detail.source).toBe('oidc');
    expect(auditCall.detail.providerId).toBe('prov1');
    expect(auditCall.detail.groups).toEqual(['devs', 'ops']);
  });

  it('reports correct added count in audit', () => {
    mockGetReturns = [{ id: 'g1' }, { id: 'g2' }];
    mockAllReturn = [{ group_id: 'g1' }]; // already in g1

    syncUserGroups(mockDb, 'user1', ['A', 'B'], 'oidc', 'prov1');

    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.detail.added).toBe(1); // g2 is new
    expect(auditCall.detail.removed).toBe(0);
  });

  it('reports correct removed count in audit', () => {
    mockGetReturns = [{ id: 'g1' }];
    mockAllReturn = [{ group_id: 'g1' }, { group_id: 'g2' }, { group_id: 'g3' }];

    syncUserGroups(mockDb, 'user1', ['A'], 'oidc', 'prov1');

    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.detail.added).toBe(0);
    expect(auditCall.detail.removed).toBe(2); // g2, g3 removed
  });

  it('reports both added and removed in audit for mixed changes', () => {
    mockGetReturns = [{ id: 'g1' }, { id: 'g3' }];
    mockAllReturn = [{ group_id: 'g1' }, { group_id: 'g2' }]; // keep g1, remove g2, add g3

    syncUserGroups(mockDb, 'user1', ['A', 'C'], 'oidc', 'prov1');

    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.detail.added).toBe(1);   // g3
    expect(auditCall.detail.removed).toBe(1); // g2
  });

  it('audit shows filtered groups when allowedGroups is applied', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['dev', 'hr', 'ops'], 'oidc', 'prov1', ['dev', 'ops']);

    const auditCall = mockLogAudit.mock.calls[0][0];
    // groups in audit should be the filtered list
    expect(auditCall.detail.groups).toEqual(['dev', 'ops']);
  });

  it('calls logAudit even when no changes are needed', () => {
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', [], 'oidc', 'prov1');

    expect(mockLogAudit).toHaveBeenCalledOnce();
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.detail.added).toBe(0);
    expect(auditCall.detail.removed).toBe(0);
  });

  // ─── Group lookup queries ───────────────────────────────────────

  it('queries groups by exact name', () => {
    mockGetReturn = undefined;
    mockAllReturn = [];

    syncUserGroups(mockDb, 'user1', ['My Group'], 'oidc', 'prov1');

    const lookupCalls = calls.filter(c =>
      c.method === 'get' && c.sql.includes('SELECT id FROM groups WHERE name = ?')
    );
    expect(lookupCalls.length).toBe(1);
    expect(lookupCalls[0].args[0]).toBe('My Group');
  });
});

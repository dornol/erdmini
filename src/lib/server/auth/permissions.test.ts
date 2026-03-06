import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockRun, mockAll, mockPrepare } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockRun = vi.fn();
  const mockAll = vi.fn().mockReturnValue([]);
  const mockPrepare = vi.fn((_sql: string) => ({ get: mockGet, run: mockRun, all: mockAll }));
  return { mockGet, mockRun, mockAll, mockPrepare };
});

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

import { getProjectPermission, hasProjectAccess, ensureOwnerPermission } from './permissions';

const mockDb = { prepare: mockPrepare } as any;

describe('getProjectPermission', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockPrepare.mockClear();
  });

  it('returns owner for admin regardless of DB state', () => {
    const result = getProjectPermission(mockDb, 'proj1', 'admin-user', 'admin');
    expect(result).toBe('owner');
    // Should not query DB for admin
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('returns permission from DB for regular user', () => {
    mockGet.mockReturnValue({ permission: 'editor' });
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('editor');
  });

  it('returns null when no permission row exists', () => {
    mockGet.mockReturnValue(undefined);
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBeNull();
  });

  it('returns viewer permission', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('viewer');
  });

  it('returns owner permission for project owner', () => {
    mockGet.mockReturnValue({ permission: 'owner' });
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('owner');
  });
});

describe('hasProjectAccess', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockPrepare.mockClear();
  });

  it('admin always has access at any level', () => {
    expect(hasProjectAccess(mockDb, 'proj1', 'admin', 'admin', 'viewer')).toBe(true);
    expect(hasProjectAccess(mockDb, 'proj1', 'admin', 'admin', 'editor')).toBe(true);
    expect(hasProjectAccess(mockDb, 'proj1', 'admin', 'admin', 'owner')).toBe(true);
  });

  it('viewer can access viewer-level', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(true);
  });

  it('viewer cannot access editor-level', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(false);
  });

  it('viewer cannot access owner-level', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'owner')).toBe(false);
  });

  it('editor can access viewer and editor level', () => {
    mockGet.mockReturnValue({ permission: 'editor' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(true);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(true);
  });

  it('editor cannot access owner-level', () => {
    mockGet.mockReturnValue({ permission: 'editor' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'owner')).toBe(false);
  });

  it('owner can access all levels', () => {
    mockGet.mockReturnValue({ permission: 'owner' });
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(true);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(true);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'owner')).toBe(true);
  });

  it('no permission row denies all access', () => {
    mockGet.mockReturnValue(undefined);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(false);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(false);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'owner')).toBe(false);
  });
});

describe('getProjectPermission — group permissions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockPrepare.mockClear();
  });

  it('returns group permission when no direct permission exists', () => {
    mockGet.mockReturnValue(undefined); // no direct permission
    mockAll.mockReturnValue([{ permission: 'editor' }]); // group grants editor
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('editor');
  });

  it('returns higher of direct vs group permission (group wins)', () => {
    mockGet.mockReturnValue({ permission: 'viewer' }); // direct: viewer
    mockAll.mockReturnValue([{ permission: 'editor' }]); // group: editor
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('editor');
  });

  it('returns higher of direct vs group permission (direct wins)', () => {
    mockGet.mockReturnValue({ permission: 'owner' }); // direct: owner
    mockAll.mockReturnValue([{ permission: 'viewer' }]); // group: viewer
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('owner');
  });

  it('picks highest among multiple group permissions', () => {
    mockGet.mockReturnValue(undefined); // no direct
    mockAll.mockReturnValue([
      { permission: 'viewer' },
      { permission: 'editor' },
      { permission: 'viewer' },
    ]);
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('editor');
  });

  it('returns null when no direct and no group permissions', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([]);
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBeNull();
  });

  it('group owner permission grants owner access', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([{ permission: 'owner' }]);
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('owner');
  });

  it('group viewer + direct viewer stays viewer', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    mockAll.mockReturnValue([{ permission: 'viewer' }]);
    const result = getProjectPermission(mockDb, 'proj1', 'user1', 'user');
    expect(result).toBe('viewer');
  });
});

describe('hasProjectAccess — group permissions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockPrepare.mockClear();
  });

  it('group editor can access editor-level', () => {
    mockGet.mockReturnValue(undefined); // no direct
    mockAll.mockReturnValue([{ permission: 'editor' }]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(true);
  });

  it('group viewer cannot access editor-level', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([{ permission: 'viewer' }]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(false);
  });

  it('direct viewer + group editor grants editor-level access', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    mockAll.mockReturnValue([{ permission: 'editor' }]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'editor')).toBe(true);
  });

  it('group permission enables viewer access for collab join', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([{ permission: 'viewer' }]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(true);
  });

  it('no direct and no group permissions denies access', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'viewer')).toBe(false);
  });

  it('multiple groups — highest wins for access check', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([
      { permission: 'viewer' },
      { permission: 'owner' },
    ]);
    expect(hasProjectAccess(mockDb, 'proj1', 'u1', 'user', 'owner')).toBe(true);
  });
});

describe('ensureOwnerPermission', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('inserts owner permission with correct id format', () => {
    ensureOwnerPermission(mockDb, 'proj1', 'user1');
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith('perm_user1_proj1', 'proj1', 'user1');
  });

  it('uses INSERT OR IGNORE to avoid duplicates', () => {
    ensureOwnerPermission(mockDb, 'proj1', 'user1');
    const sql = mockPrepare.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT OR IGNORE');
    expect(sql).toContain("'owner'");
  });
});

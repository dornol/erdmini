import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPrepare } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPrepare = vi.fn((_sql: string) => ({ get: mockGet, run: vi.fn(), all: vi.fn().mockReturnValue([]) }));
  return { mockGet, mockPrepare };
});

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

import { requireAdmin, getUserInfo, checkProjectAccess, requirePermission } from './guards';

const mockDb = { prepare: mockPrepare } as any;

function makeLocals(overrides: Partial<App.Locals['user']> & { user?: null } = {}): App.Locals {
  if (overrides.user === null) return {} as App.Locals;
  return {
    user: {
      id: 'u1',
      username: 'testuser',
      displayName: 'Test User',
      email: null,
      role: 'user',
      status: 'active',
      canCreateProject: true,
      canCreateApiKey: true,
      canCreateEmbed: true,
      ...overrides,
    },
  } as App.Locals;
}

describe('requireAdmin', () => {
  it('returns null for admin user', () => {
    expect(requireAdmin(makeLocals({ role: 'admin' }))).toBeNull();
  });

  it('returns 403 for regular user', () => {
    const result = requireAdmin(makeLocals({ role: 'user' }));
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 403 when no user (local mode)', () => {
    const result = requireAdmin(makeLocals({ user: null }));
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });
});

describe('getUserInfo', () => {
  it('returns user info for logged-in user', () => {
    const info = getUserInfo(makeLocals({ id: 'user-123', role: 'admin' }));
    expect(info.id).toBe('user-123');
    expect(info.role).toBe('admin');
    expect(info.isLocal).toBe(false);
  });

  it('returns singleton for local mode (no user)', () => {
    const info = getUserInfo(makeLocals({ user: null }));
    expect(info.id).toBe('singleton');
    expect(info.role).toBe('user');
    expect(info.isLocal).toBe(true);
  });
});

describe('checkProjectAccess', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPrepare.mockClear();
  });

  it('bypasses check in local mode', () => {
    const result = checkProjectAccess(mockDb, makeLocals({ user: null }), 'proj1', 'editor');
    expect(result).toBeNull();
  });

  it('returns null when user has sufficient access', () => {
    mockGet.mockReturnValue({ permission: 'owner' });
    const result = checkProjectAccess(mockDb, makeLocals(), 'proj1', 'editor');
    expect(result).toBeNull();
  });

  it('returns 403 when user lacks access', () => {
    mockGet.mockReturnValue({ permission: 'viewer' });
    const result = checkProjectAccess(mockDb, makeLocals(), 'proj1', 'editor');
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });
});

describe('requirePermission', () => {
  it('returns 401 when no user', () => {
    const result = requirePermission(makeLocals({ user: null }), 'canCreateProject');
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });

  it('admin always passes', () => {
    const result = requirePermission(
      makeLocals({ role: 'admin', canCreateProject: false }),
      'canCreateProject',
    );
    expect(result).toBeNull();
  });

  it('returns null when user has the permission', () => {
    expect(requirePermission(makeLocals({ canCreateProject: true }), 'canCreateProject')).toBeNull();
    expect(requirePermission(makeLocals({ canCreateApiKey: true }), 'canCreateApiKey')).toBeNull();
    expect(requirePermission(makeLocals({ canCreateEmbed: true }), 'canCreateEmbed')).toBeNull();
  });

  it('returns 403 when user lacks canCreateProject', () => {
    const result = requirePermission(makeLocals({ canCreateProject: false }), 'canCreateProject');
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 403 when user lacks canCreateApiKey', () => {
    const result = requirePermission(makeLocals({ canCreateApiKey: false }), 'canCreateApiKey');
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 403 when user lacks canCreateEmbed', () => {
    const result = requirePermission(makeLocals({ canCreateEmbed: false }), 'canCreateEmbed');
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });
});

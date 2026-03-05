import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockRun, mockPrepare, mockEnv } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockRun = vi.fn();
  const mockPrepare = vi.fn(() => ({ get: mockGet, run: mockRun }));
  const mockEnv: Record<string, string> = {};
  return { mockGet, mockRun, mockPrepare, mockEnv };
});

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

vi.mock('$env/dynamic/private', () => ({
  env: mockEnv,
}));

import { createSession, validateSession, deleteSession, deleteUserSessions } from './session';

const mockDb = { prepare: mockPrepare } as any;

describe('createSession', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockPrepare.mockClear();
    delete mockEnv.SESSION_MAX_AGE_DAYS;
  });

  it('creates session with 64-char hex id', () => {
    const session = createSession(mockDb, 'user1');
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
    expect(session.user_id).toBe('user1');
  });

  it('sets expiry based on SESSION_MAX_AGE_DAYS default (30)', () => {
    const before = Date.now();
    const session = createSession(mockDb, 'user1');
    const expiresAt = new Date(session.expires_at).getTime();
    const expectedMin = before + 29 * 24 * 60 * 60 * 1000;
    const expectedMax = before + 31 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  it('inserts session into DB', () => {
    const session = createSession(mockDb, 'user1');
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(session.id, 'user1', session.expires_at);
  });

  it('generates unique session ids', () => {
    const s1 = createSession(mockDb, 'user1');
    const s2 = createSession(mockDb, 'user1');
    expect(s1.id).not.toBe(s2.id);
  });

  it('sets created_at to current time', () => {
    const before = Date.now();
    const session = createSession(mockDb, 'user1');
    const createdAt = new Date(session.created_at).getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before - 1000);
    expect(createdAt).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('validateSession', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('returns user and session for valid active session', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    mockGet.mockReturnValue({
      session_id: 'sess1',
      user_id: 'user1',
      expires_at: futureDate,
      session_created_at: '2024-01-01T00:00:00Z',
      uid: 'user1',
      username: 'testuser',
      display_name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
    });

    const result = validateSession(mockDb, 'sess1');
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe('user1');
    expect(result!.user.username).toBe('testuser');
    expect(result!.user.displayName).toBe('Test User');
    expect(result!.user.email).toBe('test@example.com');
    expect(result!.user.role).toBe('user');
    expect(result!.user.status).toBe('active');
    expect(result!.session.id).toBe('sess1');
  });

  it('returns null for non-existent session', () => {
    mockGet.mockReturnValue(undefined);
    expect(validateSession(mockDb, 'nonexistent')).toBeNull();
  });

  it('deletes and returns null for expired session', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    mockGet.mockReturnValue({
      session_id: 'expired',
      user_id: 'user1',
      expires_at: pastDate,
      session_created_at: '2024-01-01T00:00:00Z',
      uid: 'user1',
      username: 'test',
      display_name: 'Test',
      email: null,
      role: 'user',
      status: 'active',
    });

    const result = validateSession(mockDb, 'expired');
    expect(result).toBeNull();
    // Should delete the expired session
    expect(mockRun).toHaveBeenCalledWith('expired');
  });

  it('blocks pending users and deletes all their sessions', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    mockGet.mockReturnValue({
      session_id: 'sess1',
      user_id: 'pending-user',
      expires_at: futureDate,
      session_created_at: '2024-01-01T00:00:00Z',
      uid: 'pending-user',
      username: 'pending',
      display_name: 'Pending',
      email: null,
      role: 'user',
      status: 'pending',
    });

    const result = validateSession(mockDb, 'sess1');
    expect(result).toBeNull();
    // Should delete ALL sessions for the pending user
    expect(mockRun).toHaveBeenCalledWith('pending-user');
  });

  it('returns admin user correctly', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    mockGet.mockReturnValue({
      session_id: 'admin-sess',
      user_id: 'admin1',
      expires_at: futureDate,
      session_created_at: '2024-01-01T00:00:00Z',
      uid: 'admin1',
      username: 'admin',
      display_name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
    });

    const result = validateSession(mockDb, 'admin-sess');
    expect(result!.user.role).toBe('admin');
  });
});

describe('deleteSession', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('deletes session by id', () => {
    deleteSession(mockDb, 'sess-to-delete');
    expect(mockRun).toHaveBeenCalledWith('sess-to-delete');
  });
});

describe('deleteUserSessions', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('deletes all sessions for a user', () => {
    deleteUserSessions(mockDb, 'user1');
    expect(mockRun).toHaveBeenCalledWith('user1');
    const sql = mockPrepare.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM sessions');
    expect(sql).toContain('user_id');
  });
});

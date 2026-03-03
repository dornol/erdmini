import { describe, it, expect, vi } from 'vitest';
import { resolveApiKey, hashApiKey, generateApiKey } from './api-key';

function createMockDb(data: {
  keyRow?: Record<string, unknown> | undefined;
  scopeRows?: Record<string, unknown>[];
}) {
  const runFn = vi.fn();
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('api_keys ak')) {
        return { get: () => data.keyRow, all: () => [], run: runFn };
      }
      if (sql.includes('api_key_scopes')) {
        return { get: () => undefined, all: () => data.scopeRows ?? [], run: runFn };
      }
      return { get: () => undefined, all: () => [], run: runFn };
    }),
    _runFn: runFn,
  };
}

describe('resolveApiKey', () => {
  it('returns null for empty key', () => {
    const db = createMockDb({});
    expect(resolveApiKey(db, '')).toBeNull();
  });

  it('returns null for key without erd_ prefix', () => {
    const db = createMockDb({});
    expect(resolveApiKey(db, 'invalid_key_here')).toBeNull();
  });

  it('returns null when key not found in db', () => {
    const db = createMockDb({ keyRow: undefined });
    expect(resolveApiKey(db, 'erd_' + 'a'.repeat(64))).toBeNull();
  });

  it('returns null for expired key', () => {
    const db = createMockDb({
      keyRow: {
        key_id: 'k1', user_id: 'u1', expires_at: '2020-01-01T00:00:00Z',
        role: 'user', display_name: 'Test', status: 'active',
      },
    });
    expect(resolveApiKey(db, 'erd_' + 'a'.repeat(64))).toBeNull();
  });

  it('returns null for pending user', () => {
    const db = createMockDb({
      keyRow: {
        key_id: 'k1', user_id: 'u1', expires_at: null,
        role: 'user', display_name: 'Test', status: 'pending',
      },
    });
    expect(resolveApiKey(db, 'erd_' + 'a'.repeat(64))).toBeNull();
  });

  it('resolves valid key for active user', () => {
    const db = createMockDb({
      keyRow: {
        key_id: 'k1', user_id: 'u1', expires_at: null,
        role: 'user', display_name: 'Test User', status: 'active',
      },
      scopeRows: [],
    });
    const result = resolveApiKey(db, 'erd_' + 'a'.repeat(64));
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u1');
    expect(result!.userRole).toBe('user');
    expect(result!.displayName).toBe('Test User');
    expect(result!.scopes).toBeNull();
  });

  it('resolves key with scopes', () => {
    const db = createMockDb({
      keyRow: {
        key_id: 'k1', user_id: 'u1', expires_at: null,
        role: 'admin', display_name: 'Admin', status: 'active',
      },
      scopeRows: [
        { project_id: 'p1', permission: 'editor' },
        { project_id: 'p2', permission: 'viewer' },
      ],
    });
    const result = resolveApiKey(db, 'erd_' + 'b'.repeat(64));
    expect(result).not.toBeNull();
    expect(result!.scopes).toHaveLength(2);
    expect(result!.scopes![0]).toEqual({ projectId: 'p1', permission: 'editor' });
  });

  it('updates last_used_at on valid resolve', () => {
    const db = createMockDb({
      keyRow: {
        key_id: 'k1', user_id: 'u1', expires_at: null,
        role: 'user', display_name: 'Test', status: 'active',
      },
    });
    resolveApiKey(db, 'erd_' + 'c'.repeat(64));
    expect(db._runFn).toHaveBeenCalled();
  });
});

describe('generateApiKey', () => {
  it('generates key with erd_ prefix', () => {
    const { key, hash } = generateApiKey();
    expect(key.startsWith('erd_')).toBe(true);
    expect(key.length).toBe(4 + 64); // prefix + 64 hex
    expect(hash).toBe(hashApiKey(key));
  });
});

describe('hashApiKey', () => {
  it('returns consistent hash for same input', () => {
    const key = 'erd_test123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('returns different hash for different input', () => {
    expect(hashApiKey('erd_aaa')).not.toBe(hashApiKey('erd_bbb'));
  });
});

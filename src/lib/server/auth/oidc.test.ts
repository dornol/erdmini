import { describe, it, expect, vi } from 'vitest';
import { findOrCreateOIDCUser } from './oidc';

// Mock DB: tracks inserted rows and responds to queries
function createMockDb(options: {
  existingIdentity?: { user_id: string; status: string };
} = {}) {
  const inserts: { sql: string; args: unknown[] }[] = [];

  const db = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      return {
        get: (...args: unknown[]) => {
          if (sql.includes('oidc_identities') && sql.includes('provider_id')) {
            return options.existingIdentity ?? undefined;
          }
          return undefined;
        },
        run: (...args: unknown[]) => {
          inserts.push({ sql, args });
        },
        all: () => [],
      };
    }),
    _inserts: inserts,
  };

  return db;
}

describe('findOrCreateOIDCUser', () => {
  it('returns existing identity with status', () => {
    const db = createMockDb({
      existingIdentity: { user_id: 'u1', status: 'active' },
    });

    const result = findOrCreateOIDCUser(
      db as any, 'provider1', 'sub123', 'user@test.com', 'Test User', true
    );

    expect(result).toEqual({ userId: 'u1', status: 'active' });
    expect(db._inserts).toHaveLength(0); // no inserts
  });

  it('returns existing pending identity on re-login (idempotent)', () => {
    const db = createMockDb({
      existingIdentity: { user_id: 'u1', status: 'pending' },
    });

    const result = findOrCreateOIDCUser(
      db as any, 'provider1', 'sub123', 'user@test.com', 'Test User', false
    );

    expect(result).toEqual({ userId: 'u1', status: 'pending' });
    expect(db._inserts).toHaveLength(0);
  });

  it('creates active user when autoCreate=true and no existing identity', () => {
    const db = createMockDb({});

    const result = findOrCreateOIDCUser(
      db as any, 'provider1', 'sub456', 'new@test.com', 'New User', true
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe('active');
    expect(result!.userId).toBeTruthy();
    // Should have 2 inserts: user + identity
    expect(db._inserts).toHaveLength(2);
    expect(db._inserts[0].sql).toContain('users');
    expect(db._inserts[0].args).toContain('active');
    expect(db._inserts[1].sql).toContain('oidc_identities');
  });

  it('creates pending user when autoCreate=false and no existing identity', () => {
    const db = createMockDb({});

    const result = findOrCreateOIDCUser(
      db as any, 'provider1', 'sub789', 'pending@test.com', 'Pending User', false
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe('pending');
    expect(result!.userId).toBeTruthy();
    // Should have 2 inserts: user + identity
    expect(db._inserts).toHaveLength(2);
    expect(db._inserts[0].sql).toContain('users');
    expect(db._inserts[0].args).toContain('pending');
  });

  it('uses email as display name when name is not provided', () => {
    const db = createMockDb({});

    findOrCreateOIDCUser(
      db as any, 'provider1', 'sub000', 'fallback@test.com', undefined, true
    );

    // The display name arg in the users INSERT should be the email
    const userInsert = db._inserts.find(i => i.sql.includes('users'));
    expect(userInsert).toBeTruthy();
    expect(userInsert!.args).toContain('fallback@test.com');
  });

  it('uses oidc_sub prefix when neither name nor email provided', () => {
    const db = createMockDb({});

    findOrCreateOIDCUser(
      db as any, 'provider1', 'abcdefgh1234', undefined, undefined, true
    );

    const userInsert = db._inserts.find(i => i.sql.includes('users'));
    expect(userInsert).toBeTruthy();
    // display name should be oidc_abcdefgh (first 8 chars of sub)
    expect(userInsert!.args).toContain('oidc_abcdefgh');
  });
});

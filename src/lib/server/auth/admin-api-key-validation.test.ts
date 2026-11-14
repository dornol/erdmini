import { describe, expect, it } from 'vitest';
import { validateAdminApiKeyInput } from './admin-api-key-validation';

describe('admin API key request validation', () => {
  it('accepts admin owner scopes and explicit removal of expiry or all restrictions', () => {
    expect(validateAdminApiKeyInput({ name: ' Owner key ', userId: 'user', scopes: [{ projectId: 'p', permission: 'owner' }], expiresAt: '2030-01-01' }, true)).toBeNull();
    expect(validateAdminApiKeyInput({ expiresAt: null, scopes: [] }, false)).toBeNull();
    expect(validateAdminApiKeyInput({}, false)).toBeNull();
  });

  it('rejects malformed bodies and metadata before any database mutation', () => {
    for (const body of [null, [], 'key', {}, { name: '' }, { name: ' ' }, { name: 42 }, { name: 'key', userId: {} }, { name: 'key', expiresAt: 42 }, { name: 'key', expiresAt: 'bad-date' }]) {
      expect(validateAdminApiKeyInput(body, true)).not.toBeNull();
    }
    expect(validateAdminApiKeyInput({ name: ' ' }, false)).not.toBeNull();
    expect(validateAdminApiKeyInput({ name: 'valid', expiresAt: {} }, false)).not.toBeNull();
  });

  it('rejects an entire scope list when any entry is malformed, unsupported or duplicates a project', () => {
    const valid = { projectId: 'p', permission: 'viewer' };
    for (const scopes of [null, {}, [null], [valid, { projectId: 'q', permission: 'superuser' }], [valid, { projectId: 42, permission: 'editor' }], [valid, { projectId: '', permission: 'editor' }], [valid, { projectId: 'p', permission: 'editor' }]]) {
      expect(validateAdminApiKeyInput({ scopes }, false)).not.toBeNull();
    }
  });
});

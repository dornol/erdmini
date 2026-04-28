import { describe, it, expect } from 'vitest';
import { isPublicPath } from './public-paths';

describe('isPublicPath — slash-bounded matching', () => {
  it('rejects look-alike paths the old startsWith check would have leaked', () => {
    expect(isPublicPath('/login-fake')).toBe(false);
    expect(isPublicPath('/loginadmin')).toBe(false);
    expect(isPublicPath('/embedded-page')).toBe(false);
    expect(isPublicPath('/embed-evil')).toBe(false);
    expect(isPublicPath('/api/auth/ldap-evil')).toBe(false);
    expect(isPublicPath('/api/auth/oidc-evil')).toBe(false);
    expect(isPublicPath('/mcp-stuff')).toBe(false);
    expect(isPublicPath('/llms.txt.bak')).toBe(false);
    expect(isPublicPath('/dictionary/share-evil')).toBe(false);
  });

  it('admits exact matches and legitimate sub-paths', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/mcp')).toBe(true);
    expect(isPublicPath('/robots.txt')).toBe(true);
    expect(isPublicPath('/embed/abc123')).toBe(true);
    expect(isPublicPath('/dictionary/share/tok')).toBe(true);
    expect(isPublicPath('/api/auth/oidc/callback')).toBe(true);
    expect(isPublicPath('/api/auth/oidc/login/myprovider')).toBe(true);
    expect(isPublicPath('/api/auth/ldap/login')).toBe(true);
    expect(isPublicPath('/api/embed/view/tok')).toBe(true);
    expect(isPublicPath('/api/dictionary/share/tok')).toBe(true);
  });

  it('rejects unrelated routes', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/api/admin/users')).toBe(false);
    expect(isPublicPath('/api/storage/index')).toBe(false);
  });
});

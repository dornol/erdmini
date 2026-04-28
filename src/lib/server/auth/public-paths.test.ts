import { describe, it, expect } from 'vitest';

// Mirrors PUBLIC_PATHS in src/hooks.server.ts. Keep in sync if that list changes.
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/oidc',
  '/api/auth/ldap',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/mcp',
  '/embed',
  '/api/embed/view',
  '/dictionary/share',
  '/api/dictionary/share',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

describe('isPublicPath — slash-bounded matching', () => {
  it('rejects look-alike paths that the old startsWith check would have leaked', () => {
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

  it('still admits exact matches and legitimate sub-paths', () => {
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

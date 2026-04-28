export const PUBLIC_PATHS = [
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
] as const;

/** Slash-bounded match so "/login" never admits "/login-something". */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

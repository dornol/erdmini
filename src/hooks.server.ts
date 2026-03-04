import { env } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';

// Public paths that don't require auth
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/oidc', '/robots.txt', '/sitemap.xml', '/llms.txt', '/mcp'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
  const isServerMode = env.PUBLIC_STORAGE_MODE === 'server';

  // In local mode, no auth needed
  if (!isServerMode) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  // Dynamic import to avoid loading server deps in static mode
  const db = (await import('$lib/server/db')).default;
  const { setupAdmin } = await import('$lib/server/auth/setup');
  const { validateSession } = await import('$lib/server/auth/session');
  const { startAuditCleanupScheduler } = await import('$lib/server/audit');

  // Ensure admin user exists (async password hashing)
  await setupAdmin(db);

  // Start daily audit log cleanup (idempotent)
  startAuditCleanupScheduler();

  // Check session cookie
  const sessionId = event.cookies.get('erdmini_session');
  if (sessionId) {
    const result = validateSession(db, sessionId);
    if (result) {
      event.locals.user = result.user;
      event.locals.session = result.session;
    } else {
      event.cookies.delete('erdmini_session', { path: '/' });
      event.locals.user = null;
      event.locals.session = null;
    }
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  // Protect routes — redirect unauthenticated users to login
  if (!event.locals.user && !isPublicPath(event.url.pathname)) {
    if (event.url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
  }

  const response = await resolve(event);

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};

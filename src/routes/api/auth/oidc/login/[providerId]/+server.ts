import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { buildAuthorizationUrl, OIDC_STATE_COOKIE, OIDC_STATE_MAX_AGE } from '$lib/server/auth/oidc';
import type { OIDCProviderRow } from '$lib/types/auth';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { appPath, cookiePath } from '$lib/utils/paths';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
  const provider = db.prepare(
    'SELECT * FROM oidc_providers WHERE id = ? AND enabled = 1'
  ).get(params.providerId) as OIDCProviderRow | undefined;

  if (!provider) {
    return new Response('Provider not found', { status: 404 });
  }

  const appUrl = env.PUBLIC_APP_URL || pubEnv.PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl}/api/auth/oidc/callback`;

  let authUrl: string;
  try {
    authUrl = await buildAuthorizationUrl(db, provider, redirectUri);
  } catch (error) {
    logger.warn('auth', 'OIDC authorization start failed', { error: error instanceof Error ? error.message : String(error) });
    throw redirect(303, appPath('/login?error=auth_failed'));
  }
  cookies.set(OIDC_STATE_COOKIE, new URL(authUrl).searchParams.get('state')!, {
    path: cookiePath(),
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: OIDC_STATE_MAX_AGE,
  });
  throw redirect(302, authUrl);
};

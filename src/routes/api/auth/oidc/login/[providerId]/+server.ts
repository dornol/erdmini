import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { buildAuthorizationUrl } from '$lib/server/auth/oidc';
import type { OIDCProviderRow } from '$lib/types/auth';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';

export const GET: RequestHandler = async ({ params, url }) => {
  const provider = db.prepare(
    'SELECT * FROM oidc_providers WHERE id = ? AND enabled = 1'
  ).get(params.providerId) as OIDCProviderRow | undefined;

  if (!provider) {
    return new Response('Provider not found', { status: 404 });
  }

  const appUrl = env.PUBLIC_APP_URL || pubEnv.PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl}/api/auth/oidc/callback`;

  const authUrl = await buildAuthorizationUrl(db, provider, redirectUri);
  throw redirect(302, authUrl);
};

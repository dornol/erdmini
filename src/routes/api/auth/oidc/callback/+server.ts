import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { handleCallback, findOrCreateOIDCUser, cleanupExpiredStates } from '$lib/server/auth/oidc';
import { createSession } from '$lib/server/auth/session';
import type { OIDCProviderRow, OIDCStateRow } from '$lib/types/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const desc = url.searchParams.get('error_description') || error;
    return new Response(`OIDC Error: ${desc}`, { status: 400 });
  }

  if (!state) {
    return new Response('Missing state parameter', { status: 400 });
  }

  // Look up state to find provider
  const stateRow = db.prepare(
    'SELECT * FROM oidc_states WHERE state = ?'
  ).get(state) as OIDCStateRow | undefined;

  if (!stateRow) {
    return new Response('Invalid or expired state', { status: 400 });
  }

  const provider = db.prepare(
    'SELECT * FROM oidc_providers WHERE id = ?'
  ).get(stateRow.provider_id) as OIDCProviderRow | undefined;

  if (!provider) {
    return new Response('Provider not found', { status: 400 });
  }

  try {
    const { sub, email, name } = await handleCallback(db, provider, url);

    const userId = findOrCreateOIDCUser(
      db,
      provider.id,
      sub,
      email,
      name,
      provider.auto_create_users === 1,
    );

    if (!userId) {
      return new Response('Auto-registration disabled. Contact admin.', { status: 403 });
    }

    const session = createSession(db, userId);

    cookies.set('erdmini_session', session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 30 * 24 * 60 * 60,
    });

    // Cleanup expired states occasionally
    cleanupExpiredStates(db);

    throw redirect(302, '/');
  } catch (e) {
    // Re-throw redirects
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 302) {
      throw e;
    }
    console.error('OIDC callback error:', e);
    return new Response(`Authentication failed: ${(e as Error).message}`, { status: 400 });
  }
};

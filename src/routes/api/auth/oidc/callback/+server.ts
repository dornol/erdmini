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
    throw redirect(303, '/login?error=auth_failed');
  }

  if (!state) {
    throw redirect(303, '/login?error=auth_failed');
  }

  // Look up state to find provider
  const stateRow = db.prepare(
    'SELECT * FROM oidc_states WHERE state = ?'
  ).get(state) as OIDCStateRow | undefined;

  if (!stateRow) {
    throw redirect(303, '/login?error=auth_failed');
  }

  const provider = db.prepare(
    'SELECT * FROM oidc_providers WHERE id = ?'
  ).get(stateRow.provider_id) as OIDCProviderRow | undefined;

  if (!provider) {
    throw redirect(303, '/login?error=auth_failed');
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
      throw redirect(303, '/login?error=auto_registration_disabled');
    }

    const session = createSession(db, userId);

    cookies.set('erdmini_session', session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 30 * 24 * 60 * 60,
    });

    // Cleanup expired states occasionally
    cleanupExpiredStates(db);

    throw redirect(302, '/');
  } catch (e) {
    // Re-throw redirects (302, 303, etc.)
    if (e && typeof e === 'object' && 'status' in e) {
      const status = (e as { status: number }).status;
      if (status >= 300 && status < 400) {
        throw e;
      }
    }
    console.error('OIDC callback error:', e);
    throw redirect(303, '/login?error=auth_failed');
  }
};

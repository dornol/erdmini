import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { handleCallback, findOrCreateOIDCUser, cleanupExpiredStates } from '$lib/server/auth/oidc';
import { createSession } from '$lib/server/auth/session';
import { logAudit } from '$lib/server/audit';
import { logger } from '$lib/server/logger';
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

    const result = findOrCreateOIDCUser(
      db,
      provider.id,
      sub,
      email,
      name,
      provider.auto_create_users === 1,
    );

    if (!result) {
      logAudit({ action: 'oidc_login_failed', category: 'auth', detail: { provider: provider.display_name, error: 'auto_registration_disabled' } });
      throw redirect(303, '/login?error=auto_registration_disabled');
    }

    if (result.created) {
      logAudit({ action: 'oidc_register', category: 'auth', userId: result.userId, username: email ?? name ?? sub, detail: { provider: provider.display_name, status: result.status } });
    }

    if (result.status === 'pending') {
      throw redirect(303, '/login?error=pending_approval');
    }

    const session = createSession(db, result.userId);

    cookies.set('erdmini_session', session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 30 * 24 * 60 * 60,
    });

    logAudit({ action: 'oidc_login', category: 'auth', userId: result.userId, username: email ?? name, detail: { provider: provider.display_name } });

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
    logger.error('auth', 'OIDC callback error', { error: e instanceof Error ? e.message : String(e) });
    logAudit({ action: 'oidc_login_failed', category: 'auth', detail: { provider: provider.display_name, error: String(e) } });
    throw redirect(303, '/login?error=auth_failed');
  }
};

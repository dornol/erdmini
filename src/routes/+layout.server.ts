import { env } from '$env/dynamic/public';
import { PUBLIC_SITE_URL } from '$env/static/public';
import type { LayoutServerLoad } from './$types';

const siteUrl = PUBLIC_SITE_URL || 'https://erdmini.dornol.dev';

export const load: LayoutServerLoad = async ({ locals }) => {
  const isServerMode = env.PUBLIC_STORAGE_MODE === 'server';

  if (!isServerMode) {
    return { user: null, isServerMode: false, oidcProviders: [], siteUrl };
  }

  // Load enabled OIDC providers for login page
  let oidcProviders: { id: string; display_name: string }[] = [];
  try {
    const db = (await import('$lib/server/db')).default;
    oidcProviders = db.prepare(
      'SELECT id, display_name FROM oidc_providers WHERE enabled = 1'
    ).all() as { id: string; display_name: string }[];
  } catch {
    // DB not available
  }

  return {
    user: locals.user,
    isServerMode: true,
    oidcProviders,
    siteUrl,
  };
};

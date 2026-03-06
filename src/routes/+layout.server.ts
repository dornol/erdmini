import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const siteUrl = env.PUBLIC_SITE_URL || 'https://erdmini.dornol.dev';
  const isServerMode = env.PUBLIC_STORAGE_MODE === 'server';

  if (!isServerMode) {
    return { user: null, isServerMode: false, oidcProviders: [], ldapProviders: [], siteUrl, siteSettings: null };
  }

  // Load enabled OIDC and LDAP providers for login page
  let oidcProviders: { id: string; display_name: string }[] = [];
  let ldapProviders: { id: string; display_name: string }[] = [];
  let siteSettings: { site_name: string; login_message: string; logo_url: string } | null = null;
  try {
    const db = (await import('$lib/server/db')).default;
    oidcProviders = db.prepare(
      'SELECT id, display_name FROM oidc_providers WHERE enabled = 1'
    ).all() as { id: string; display_name: string }[];
    ldapProviders = db.prepare(
      'SELECT id, display_name FROM ldap_providers WHERE enabled = 1'
    ).all() as { id: string; display_name: string }[];

    const { getSiteSettings } = await import('$lib/server/site-settings');
    siteSettings = getSiteSettings();
  } catch {
    // DB not available
  }

  return {
    user: locals.user,
    isServerMode: true,
    oidcProviders,
    ldapProviders,
    siteUrl,
    siteSettings,
  };
};

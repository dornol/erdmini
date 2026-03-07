import db from './db';

export interface SiteSettings {
  site_name: string;
  login_message: string;
  logo_url: string;
  default_can_create_project: string;
  default_can_create_api_key: string;
  default_can_create_embed: string;
}

const DEFAULTS: SiteSettings = {
  site_name: 'erdmini',
  login_message: '',
  logo_url: '',
  default_can_create_project: '1',
  default_can_create_api_key: '1',
  default_can_create_embed: '1',
};

const VALID_KEYS = new Set<keyof SiteSettings>(Object.keys(DEFAULTS) as (keyof SiteSettings)[]);

let _cache: SiteSettings | null = null;

export function getSiteSettings(): SiteSettings {
  if (_cache) return _cache;

  const rows = db.prepare('SELECT key, value FROM site_settings').all() as { key: string; value: string }[];
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    if (VALID_KEYS.has(row.key as keyof SiteSettings)) {
      (settings as any)[row.key] = row.value;
    }
  }
  _cache = settings;
  return settings;
}

/**
 * Read default permission flags for new user creation.
 * Works with any db instance (for use in oidc/ldap modules that receive db as parameter).
 */
export function getDefaultPermissions(dbInstance: { prepare: (sql: string) => { all: (...args: any[]) => any[] } }): { canCreateProject: number; canCreateApiKey: number; canCreateEmbed: number } {
  const rows = dbInstance.prepare(
    "SELECT key, value FROM site_settings WHERE key IN ('default_can_create_project', 'default_can_create_api_key', 'default_can_create_embed')"
  ).all() as { key: string; value: string }[];

  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    canCreateProject: map.get('default_can_create_project') === '0' ? 0 : 1,
    canCreateApiKey: map.get('default_can_create_api_key') === '0' ? 0 : 1,
    canCreateEmbed: map.get('default_can_create_embed') === '0' ? 0 : 1,
  };
}

function validateLogoUrl(url: string): boolean {
  if (!url) return true; // empty = reset
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    if (parsed.protocol === 'data:' || parsed.protocol === 'javascript:') return false;
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function updateSiteSettings(updates: Partial<SiteSettings>): SiteSettings {
  if (updates.logo_url !== undefined && !validateLogoUrl(updates.logo_url)) {
    throw new Error('Invalid logo_url: must be a valid URL or path');
  }

  const upsert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (VALID_KEYS.has(key as keyof SiteSettings)) {
        upsert.run(key, value ?? '');
      }
    }
  });
  tx();
  _cache = null; // invalidate cache
  return getSiteSettings();
}

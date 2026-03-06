import db from './db';

export interface SiteSettings {
  site_name: string;
  login_message: string;
  logo_url: string;
}

const DEFAULTS: SiteSettings = {
  site_name: 'erdmini',
  login_message: '',
  logo_url: '',
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

export function updateSiteSettings(updates: Partial<SiteSettings>): SiteSettings {
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

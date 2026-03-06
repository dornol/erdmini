import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Inline implementation to test without DB singleton dependency
interface SiteSettings {
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

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE site_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO site_settings (key, value) VALUES ('site_name', 'erdmini');
    INSERT INTO site_settings (key, value) VALUES ('login_message', '');
    INSERT INTO site_settings (key, value) VALUES ('logo_url', '');
  `);
  return db;
}

function getSiteSettings(db: InstanceType<typeof Database>): SiteSettings {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as { key: string; value: string }[];
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    if (VALID_KEYS.has(row.key as keyof SiteSettings)) {
      (settings as any)[row.key] = row.value;
    }
  }
  return settings;
}

function updateSiteSettings(db: InstanceType<typeof Database>, updates: Partial<SiteSettings>): SiteSettings {
  const upsert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (VALID_KEYS.has(key as keyof SiteSettings)) {
        upsert.run(key, value ?? '');
      }
    }
  });
  tx();
  return getSiteSettings(db);
}

describe('site-settings', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('getSiteSettings', () => {
    it('returns defaults from fresh DB', () => {
      const settings = getSiteSettings(db);
      expect(settings).toEqual({
        site_name: 'erdmini',
        login_message: '',
        logo_url: '',
      });
    });

    it('returns updated values', () => {
      db.prepare("UPDATE site_settings SET value = 'My App' WHERE key = 'site_name'").run();
      const settings = getSiteSettings(db);
      expect(settings.site_name).toBe('My App');
    });

    it('ignores unknown keys in DB', () => {
      db.prepare("INSERT INTO site_settings (key, value) VALUES ('unknown_key', 'value')").run();
      const settings = getSiteSettings(db);
      expect(settings).toEqual({
        site_name: 'erdmini',
        login_message: '',
        logo_url: '',
      });
      expect((settings as any).unknown_key).toBeUndefined();
    });
  });

  describe('updateSiteSettings', () => {
    it('updates site_name', () => {
      const result = updateSiteSettings(db, { site_name: 'My ERD Tool' });
      expect(result.site_name).toBe('My ERD Tool');
      expect(result.login_message).toBe('');
      expect(result.logo_url).toBe('');
    });

    it('updates login_message', () => {
      const result = updateSiteSettings(db, { login_message: 'Welcome to our tool' });
      expect(result.login_message).toBe('Welcome to our tool');
    });

    it('updates logo_url', () => {
      const result = updateSiteSettings(db, { logo_url: 'https://example.com/logo.png' });
      expect(result.logo_url).toBe('https://example.com/logo.png');
    });

    it('updates multiple fields at once', () => {
      const result = updateSiteSettings(db, {
        site_name: 'Custom App',
        login_message: 'Hello',
        logo_url: 'https://example.com/img.svg',
      });
      expect(result).toEqual({
        site_name: 'Custom App',
        login_message: 'Hello',
        logo_url: 'https://example.com/img.svg',
      });
    });

    it('ignores unknown keys', () => {
      const result = updateSiteSettings(db, { site_name: 'Test', unknown_field: 'bad' } as any);
      expect(result.site_name).toBe('Test');
      expect((result as any).unknown_field).toBeUndefined();
      // Verify not inserted into DB
      const row = db.prepare("SELECT * FROM site_settings WHERE key = 'unknown_field'").get();
      expect(row).toBeUndefined();
    });

    it('handles null values as empty string', () => {
      updateSiteSettings(db, { site_name: 'Test' });
      const result = updateSiteSettings(db, { site_name: null as any });
      expect(result.site_name).toBe('');
    });

    it('preserves other fields when updating one', () => {
      updateSiteSettings(db, { site_name: 'Custom', login_message: 'Hi' });
      const result = updateSiteSettings(db, { logo_url: 'https://img.png' });
      expect(result.site_name).toBe('Custom');
      expect(result.login_message).toBe('Hi');
      expect(result.logo_url).toBe('https://img.png');
    });

    it('handles empty update object', () => {
      const result = updateSiteSettings(db, {});
      expect(result).toEqual(DEFAULTS);
    });
  });
});

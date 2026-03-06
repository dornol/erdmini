import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { AuthUser } from '$lib/types/auth';

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

function getDefaultPermissions(db: InstanceType<typeof Database>): { canCreateProject: number; canCreateApiKey: number; canCreateEmbed: number } {
  const rows = db.prepare(
    "SELECT key, value FROM site_settings WHERE key IN ('default_can_create_project', 'default_can_create_api_key', 'default_can_create_embed')"
  ).all() as { key: string; value: string }[];
  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    canCreateProject: map.get('default_can_create_project') === '0' ? 0 : 1,
    canCreateApiKey: map.get('default_can_create_api_key') === '0' ? 0 : 1,
    canCreateEmbed: map.get('default_can_create_embed') === '0' ? 0 : 1,
  };
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

  describe('getDefaultPermissions', () => {
    it('returns all enabled when no settings exist', () => {
      const perms = getDefaultPermissions(db);
      expect(perms).toEqual({ canCreateProject: 1, canCreateApiKey: 1, canCreateEmbed: 1 });
    });

    it('returns all enabled when settings are "1"', () => {
      db.exec(`
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_project', '1');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_api_key', '1');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_embed', '1');
      `);
      const perms = getDefaultPermissions(db);
      expect(perms).toEqual({ canCreateProject: 1, canCreateApiKey: 1, canCreateEmbed: 1 });
    });

    it('returns disabled when settings are "0"', () => {
      db.exec(`
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_project', '0');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_api_key', '0');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_embed', '0');
      `);
      const perms = getDefaultPermissions(db);
      expect(perms).toEqual({ canCreateProject: 0, canCreateApiKey: 0, canCreateEmbed: 0 });
    });

    it('handles mixed settings', () => {
      db.exec(`
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_project', '1');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_api_key', '0');
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_embed', '1');
      `);
      const perms = getDefaultPermissions(db);
      expect(perms).toEqual({ canCreateProject: 1, canCreateApiKey: 0, canCreateEmbed: 1 });
    });

    it('treats unknown values as enabled (not "0")', () => {
      db.exec(`
        INSERT INTO site_settings (key, value) VALUES ('default_can_create_project', 'yes');
      `);
      const perms = getDefaultPermissions(db);
      expect(perms.canCreateProject).toBe(1);
    });
  });
});

// Test requirePermission logic (without importing SvelteKit json)
describe('requirePermission logic', () => {
  function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      id: 'u1', username: 'test', displayName: 'Test', email: null,
      role: 'user', status: 'active',
      canCreateProject: true, canCreateApiKey: true, canCreateEmbed: true,
      ...overrides,
    };
  }

  function checkPermission(user: AuthUser | null, perm: 'canCreateProject' | 'canCreateApiKey' | 'canCreateEmbed'): 'ok' | 'denied' | 'unauth' {
    if (!user) return 'unauth';
    if (user.role === 'admin') return 'ok';
    if (!user[perm]) return 'denied';
    return 'ok';
  }

  it('allows admin regardless of flags', () => {
    const user = makeUser({ role: 'admin', canCreateProject: false });
    expect(checkPermission(user, 'canCreateProject')).toBe('ok');
  });

  it('allows user with permission', () => {
    const user = makeUser({ canCreateProject: true });
    expect(checkPermission(user, 'canCreateProject')).toBe('ok');
  });

  it('denies user without permission', () => {
    const user = makeUser({ canCreateProject: false });
    expect(checkPermission(user, 'canCreateProject')).toBe('denied');
  });

  it('returns unauth for null user', () => {
    expect(checkPermission(null, 'canCreateProject')).toBe('unauth');
  });

  it('checks each permission independently', () => {
    const user = makeUser({ canCreateProject: true, canCreateApiKey: false, canCreateEmbed: true });
    expect(checkPermission(user, 'canCreateProject')).toBe('ok');
    expect(checkPermission(user, 'canCreateApiKey')).toBe('denied');
    expect(checkPermission(user, 'canCreateEmbed')).toBe('ok');
  });
});

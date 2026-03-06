-- Per-user permission flags (admin bypasses all)
ALTER TABLE users ADD COLUMN can_create_project INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN can_create_api_key INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN can_create_embed INTEGER NOT NULL DEFAULT 1;

-- Default permission settings for new users (via OIDC/LDAP/admin creation)
INSERT INTO site_settings (key, value) VALUES ('default_can_create_project', '1');
INSERT INTO site_settings (key, value) VALUES ('default_can_create_api_key', '1');
INSERT INTO site_settings (key, value) VALUES ('default_can_create_embed', '1');

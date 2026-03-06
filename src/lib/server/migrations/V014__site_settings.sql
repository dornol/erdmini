CREATE TABLE site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default branding values
INSERT INTO site_settings (key, value) VALUES ('site_name', 'erdmini');
INSERT INTO site_settings (key, value) VALUES ('login_message', '');
INSERT INTO site_settings (key, value) VALUES ('logo_url', '');

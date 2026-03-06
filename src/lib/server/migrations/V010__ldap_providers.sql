CREATE TABLE ldap_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  bind_dn TEXT NOT NULL,
  bind_password TEXT NOT NULL,
  user_search_base TEXT NOT NULL,
  user_search_filter TEXT NOT NULL DEFAULT '(uid={{username}})',
  email_attribute TEXT NOT NULL DEFAULT 'mail',
  display_name_attribute TEXT NOT NULL DEFAULT 'cn',
  group_search_base TEXT,
  group_search_filter TEXT DEFAULT '(member={{userDn}})',
  admin_group_dn TEXT,
  allowed_group_dns TEXT,
  start_tls INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_create_users INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ldap_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES ldap_providers(id) ON DELETE CASCADE,
  ldap_dn TEXT NOT NULL,
  UNIQUE(provider_id, ldap_dn)
);
CREATE INDEX idx_ldap_identities_user ON ldap_identities(user_id);

CREATE TABLE IF NOT EXISTS project_index (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schemas (
  project_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canvas_states (
  project_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oidc_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  issuer_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  scopes TEXT DEFAULT 'openid email profile',
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_create_users INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oidc_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  email TEXT,
  UNIQUE(provider_id, subject)
);

CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS api_key_scopes (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'viewer',
  UNIQUE(api_key_id, project_id)
);

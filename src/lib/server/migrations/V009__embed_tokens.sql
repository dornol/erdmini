CREATE TABLE embed_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX idx_embed_tokens_project ON embed_tokens(project_id);
CREATE INDEX idx_embed_tokens_token ON embed_tokens(token);

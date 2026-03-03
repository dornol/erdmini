-- Add api_key_scopes table if missing (may have been skipped during baseline detection)
CREATE TABLE IF NOT EXISTS api_key_scopes (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'viewer',
  UNIQUE(api_key_id, project_id)
);

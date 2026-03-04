CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  detail TEXT,
  ip TEXT,
  source TEXT
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_category ON audit_logs(category);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

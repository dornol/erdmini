-- Add missing indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_project_permissions_user_id ON project_permissions(user_id);

CREATE TABLE schema_snapshots (
    id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    PRIMARY KEY (project_id, id)
);

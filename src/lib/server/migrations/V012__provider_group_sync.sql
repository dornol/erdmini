-- OIDC: group sync settings
ALTER TABLE oidc_providers ADD COLUMN sync_groups INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oidc_providers ADD COLUMN group_claim TEXT DEFAULT 'groups';
ALTER TABLE oidc_providers ADD COLUMN allowed_groups TEXT DEFAULT '';

-- LDAP: group sync settings (group_search_base etc. already exist)
ALTER TABLE ldap_providers ADD COLUMN sync_groups INTEGER NOT NULL DEFAULT 0;

-- Groups: external source tracking
ALTER TABLE groups ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE groups ADD COLUMN source_provider_id TEXT DEFAULT NULL;

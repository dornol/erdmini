-- OIDC: admin group mapping (comma-separated group names that grant admin role)
ALTER TABLE oidc_providers ADD COLUMN admin_groups TEXT DEFAULT '';

export interface AuthUser {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'pending';
  canCreateProject: boolean;
  canCreateApiKey: boolean;
  canCreateEmbed: boolean;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface UserRow {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  can_create_project: number;
  can_create_api_key: number;
  can_create_embed: number;
}

export interface OIDCProviderRow {
  id: string;
  display_name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  enabled: number;
  auto_create_users: number;
  sync_groups: number;
  group_claim: string;
  allowed_groups: string;
  admin_groups: string;
  created_at: string;
}

export interface OIDCIdentityRow {
  id: string;
  user_id: string;
  provider_id: string;
  subject: string;
  email: string | null;
}

export interface OIDCStateRow {
  state: string;
  provider_id: string;
  code_verifier: string;
  redirect_uri: string;
  expires_at: string;
}

export interface LdapProviderRow {
  id: string;
  display_name: string;
  server_url: string;
  bind_dn: string;
  bind_password: string;
  user_search_base: string;
  user_search_filter: string;
  email_attribute: string;
  display_name_attribute: string;
  group_search_base: string | null;
  group_search_filter: string | null;
  admin_group_dn: string | null;
  allowed_group_dns: string | null;
  start_tls: number;
  enabled: number;
  auto_create_users: number;
  sync_groups: number;
  created_at: string;
}

export interface LdapIdentityRow {
  id: string;
  user_id: string;
  provider_id: string;
  ldap_dn: string;
}

export type ProjectPermissionLevel = 'owner' | 'editor' | 'viewer';

export interface ProjectPermissionRow {
  id: string;
  project_id: string;
  user_id: string;
  permission: ProjectPermissionLevel;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface ApiKeyScope {
  projectId: string;
  permission: 'viewer' | 'editor';
}

export interface ApiKeyScopeRow {
  id: string;
  api_key_id: string;
  project_id: string;
  permission: string;
}

export interface ProjectPermission {
  id: string;
  projectId: string;
  userId: string;
  permission: ProjectPermissionLevel;
  displayName?: string;
  username?: string | null;
  email?: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  source: string;
  source_provider_id: string | null;
  created_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
}

export interface GroupProjectPermissionRow {
  id: string;
  group_id: string;
  project_id: string;
  permission: string;
  created_at: string;
}

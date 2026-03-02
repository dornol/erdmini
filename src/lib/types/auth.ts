export interface AuthUser {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  role: 'admin' | 'user';
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
  created_at: string;
  updated_at: string;
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

export interface ProjectPermission {
  id: string;
  projectId: string;
  userId: string;
  permission: ProjectPermissionLevel;
  displayName?: string;
  username?: string | null;
  email?: string | null;
}

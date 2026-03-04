<script lang="ts">
  import { onMount } from 'svelte';
  import type { UserRow, OIDCProviderRow, ApiKeyRow, ApiKeyScopeRow } from '$lib/types/auth';
  import { authStore } from '$lib/store/auth.svelte';
  import * as m from '$lib/paraglide/messages';

  type UserInfo = Omit<UserRow, 'password_hash'> & { has_local_auth: boolean; oidc_providers: string[] };
  type ApiKeyInfo = Omit<ApiKeyRow, 'key_hash'> & { user_display_name: string; username: string | null; scopes: ApiKeyScopeRow[] };

  type ProjectInfo = {
    id: string;
    name: string;
    updatedAt: string;
    ownerId: string | null;
    ownerName: string | null;
    memberCount: number;
  };
  type ProjectMember = {
    id: string;
    user_id: string;
    permission: string;
    created_at: string;
    display_name: string;
    username: string | null;
    email: string | null;
  };
  type BackupStats = {
    dbSizeBytes: number;
    userCount: number;
    projectCount: number;
    migrationVersion: number;
  };

  let users = $state<UserInfo[]>([]);
  let providers = $state<OIDCProviderRow[]>([]);
  let apiKeys = $state<ApiKeyInfo[]>([]);
  let activeTab = $state<'users' | 'oidc' | 'api-keys' | 'projects' | 'backup' | 'audit-log'>('users');

  // Projects
  let projects = $state<ProjectInfo[]>([]);
  let expandedProject = $state<string | null>(null);
  let projectMembers = $state<ProjectMember[]>([]);
  let projectError = $state('');
  let projectSuccess = $state('');
  let transferUserId = $state('');

  // Backup
  let backupStats = $state<BackupStats | null>(null);
  let backupLoading = $state(false);
  let restoreLoading = $state(false);
  let backupError = $state('');
  let backupSuccess = $state('');

  // Audit Log
  type AuditLogRow = {
    id: number;
    timestamp: string;
    user_id: string | null;
    username: string | null;
    action: string;
    category: string;
    resource_type: string | null;
    resource_id: string | null;
    detail: string | null;
    ip: string | null;
    source: string | null;
  };
  let auditLogs = $state<AuditLogRow[]>([]);
  let auditTotal = $state(0);
  let auditCategory = $state('');
  let auditAction = $state('');
  let auditLoading = $state(false);
  let auditLoaded = $state(false);
  let expandedAuditId = $state<number | null>(null);
  let auditStats = $state<{ totalCount: number; oldestTimestamp: string | null; retentionDays: number } | null>(null);
  let auditPurgeMsg = $state('');

  // New user form
  let newUser = $state({ username: '', displayName: '', email: '', password: '', role: 'user' });
  let userError = $state('');
  let userSuccess = $state('');

  // New provider form
  let newProvider = $state({
    displayName: '',
    issuerUrl: '',
    clientId: '',
    clientSecret: '',
    scopes: 'openid email profile',
    enabled: true,
    autoCreateUsers: true,
  });
  let providerError = $state('');
  let providerSuccess = $state('');

  // API Key form
  let newApiKey = $state({ name: '', expiresAt: '' });
  let newApiKeyScopes = $state<{ projectId: string; permission: 'viewer' | 'editor' }[]>([]);
  let apiKeyScopeMode = $state<'all' | 'scoped'>('all');
  let apiKeyError = $state('');
  let apiKeySuccess = $state('');
  let createdKey = $state<string | null>(null);
  let keyCopied = $state(false);

  // Edit API Key
  let editingKeyId = $state<string | null>(null);
  let editKeyForm = $state({ name: '', expiresAt: '' });
  let editKeyScopes = $state<{ projectId: string; permission: 'viewer' | 'editor' }[]>([]);
  let editKeyScopeMode = $state<'all' | 'scoped'>('all');

  function startEditApiKey(key: ApiKeyInfo) {
    editingKeyId = key.id;
    editKeyForm = { name: key.name, expiresAt: key.expires_at ? new Date(key.expires_at).toISOString().slice(0, 10) : '' };
    editKeyScopeMode = key.scopes && key.scopes.length > 0 ? 'scoped' : 'all';
    editKeyScopes = key.scopes ? key.scopes.map(s => ({ projectId: s.project_id, permission: s.permission as 'viewer' | 'editor' })) : [];
  }

  async function saveApiKey() {
    if (!editingKeyId) return;
    apiKeyError = '';
    const body: Record<string, unknown> = {
      name: editKeyForm.name,
      expiresAt: editKeyForm.expiresAt || null,
    };
    if (editKeyScopeMode === 'scoped' && editKeyScopes.length > 0) {
      body.scopes = editKeyScopes;
    } else if (editKeyScopeMode === 'all') {
      body.scopes = [];
    }
    const res = await fetch(`/api/admin/api-keys/${editingKeyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      apiKeyError = data.error || 'Failed to update API key';
      return;
    }
    apiKeySuccess = `API key "${editKeyForm.name}" updated`;
    editingKeyId = null;
    await loadApiKeys();
  }

  let adminCount = $derived(users.filter(u => u.role === 'admin').length);
  let pendingCount = $derived(users.filter(u => u.status === 'pending').length);
  let showPendingOnly = $state(false);
  let filteredUsers = $derived(showPendingOnly ? users.filter(u => u.status === 'pending') : users);

  function isLastAdmin(user: UserInfo): boolean {
    return user.role === 'admin' && adminCount <= 1;
  }

  function isSelf(user: UserInfo): boolean {
    return user.id === authStore.user?.id;
  }

  // Edit user
  let editingUser = $state<string | null>(null);
  let editUserForm = $state({ displayName: '', email: '', role: 'user', status: 'active', password: '' });

  function startEditUser(user: UserInfo) {
    editingUser = user.id;
    editUserForm = {
      displayName: user.display_name,
      email: user.email ?? '',
      role: user.role,
      status: user.status,
      password: '',
    };
  }

  async function saveUser() {
    if (!editingUser) return;
    userError = '';
    const body: Record<string, string> = {
      displayName: editUserForm.displayName,
      email: editUserForm.email,
      role: editUserForm.role,
      status: editUserForm.status,
    };
    if (editUserForm.password) body.password = editUserForm.password;
    const res = await fetch(`/api/admin/users/${editingUser}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      userError = data.error || 'Failed to update user';
      return;
    }
    editingUser = null;
    await loadUsers();
  }

  async function deleteUser(id: string, username: string | null) {
    if (!confirm(`Delete user "${username ?? id}"? Owned projects will be transferred to you.`)) return;
    userError = '';
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      userError = data.error || 'Failed to delete user';
      return;
    }
    userSuccess = `User "${username ?? id}" deleted`;
    await loadUsers();
  }

  async function approveUser(id: string) {
    userError = '';
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    if (!res.ok) {
      const data = await res.json();
      userError = data.error || 'Failed to approve user';
      return;
    }
    await loadUsers();
  }

  async function rejectUser(id: string, username: string | null) {
    if (!confirm(`Reject and delete user "${username ?? id}"?`)) return;
    userError = '';
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      userError = data.error || 'Failed to reject user';
      return;
    }
    await loadUsers();
  }

  // Edit provider
  let editingProvider = $state<string | null>(null);
  let editForm = $state({
    displayName: '',
    issuerUrl: '',
    clientId: '',
    clientSecret: '',
    scopes: '',
    enabled: true,
    autoCreateUsers: true,
  });

  onMount(async () => {
    await Promise.all([loadUsers(), loadProviders(), loadApiKeys()]);
  });

  // Project functions
  async function loadProjects() {
    projectError = '';
    const res = await fetch('/api/admin/projects');
    if (res.ok) projects = await res.json();
  }

  async function toggleProjectMembers(projectId: string) {
    if (expandedProject === projectId) {
      expandedProject = null;
      return;
    }
    expandedProject = projectId;
    transferUserId = '';
    const res = await fetch(`/api/admin/projects/${projectId}`);
    if (res.ok) projectMembers = await res.json();
  }

  async function transferOwnership(projectId: string, projectName: string) {
    if (!transferUserId) return;
    const targetUser = users.find(u => u.id === transferUserId);
    if (!confirm(m.admin_projects_transfer_confirm({ name: projectName, user: targetUser?.display_name ?? transferUserId }))) return;
    projectError = '';
    const res = await fetch(`/api/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'transfer', newOwnerId: transferUserId }),
    });
    if (!res.ok) {
      const data = await res.json();
      projectError = data.error || 'Failed to transfer';
      return;
    }
    projectSuccess = `Ownership transferred`;
    transferUserId = '';
    expandedProject = null;
    await loadProjects();
  }

  async function deleteProject(projectId: string, projectName: string) {
    const input = prompt(m.admin_projects_delete_confirm({ name: projectName }));
    if (input !== projectName) return;
    projectError = '';
    const res = await fetch(`/api/admin/projects/${projectId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      projectError = data.error || 'Failed to delete project';
      return;
    }
    projectSuccess = `Project "${projectName}" deleted`;
    expandedProject = null;
    await loadProjects();
  }

  // Backup functions
  async function loadBackupStats() {
    backupError = '';
    const res = await fetch('/api/admin/backup?stats=1');
    if (res.ok) backupStats = await res.json();
  }

  async function downloadBackup() {
    backupLoading = true;
    backupError = '';
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) {
        backupError = 'Failed to download backup';
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'erdmini-backup.db';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      backupLoading = false;
    }
  }

  async function restoreBackup(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!confirm(m.admin_restore_confirm())) {
      input.value = '';
      return;
    }

    restoreLoading = true;
    backupError = '';
    backupSuccess = '';
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        backupError = data.error || m.admin_restore_failed();
        return;
      }
      backupSuccess = m.admin_restore_success();
      setTimeout(() => location.reload(), 1500);
    } finally {
      restoreLoading = false;
      input.value = '';
    }
  }

  async function loadAuditLogs(reset = true) {
    auditLoading = true;
    if (reset) auditLogs = [];
    const params = new URLSearchParams();
    if (auditCategory) params.set('category', auditCategory);
    if (auditAction) params.set('action', auditAction);
    params.set('limit', '100');
    params.set('offset', reset ? '0' : String(auditLogs.length));
    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (reset) {
        auditLogs = data.logs;
      } else {
        auditLogs = [...auditLogs, ...data.logs];
      }
      auditTotal = data.total;
      auditLoaded = true;
    }
    auditLoading = false;
  }

  async function loadAuditStats() {
    const res = await fetch('/api/admin/audit-logs?stats=1');
    if (res.ok) auditStats = await res.json();
  }

  async function purgeAuditLogs() {
    if (!auditStats) return;
    const days = auditStats.retentionDays;
    if (!confirm(m.admin_audit_purge_confirm({ days: String(days) }))) return;
    const res = await fetch(`/api/admin/audit-logs?days=${days}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      auditPurgeMsg = m.admin_audit_purge_result({ count: String(data.deleted) });
      loadAuditLogs();
      loadAuditStats();
      setTimeout(() => auditPurgeMsg = '', 5000);
    }
  }

  function formatAuditTimestamp(ts: string): string {
    try {
      const d = new Date(ts + 'Z');
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) users = await res.json();
  }

  async function loadProviders() {
    const res = await fetch('/api/admin/oidc-providers');
    if (res.ok) providers = await res.json();
  }

  async function createUser() {
    userError = '';
    userSuccess = '';
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    if (!res.ok) {
      const body = await res.json();
      userError = body.error || 'Failed';
      return;
    }
    userSuccess = `User "${newUser.username}" created`;
    newUser = { username: '', displayName: '', email: '', password: '', role: 'user' };
    await loadUsers();
  }

  async function loadApiKeys() {
    const res = await fetch('/api/admin/api-keys');
    if (res.ok) apiKeys = await res.json();
  }

  async function createApiKey() {
    apiKeyError = '';
    apiKeySuccess = '';
    createdKey = null;
    const body: Record<string, unknown> = {
      name: newApiKey.name,
      expiresAt: newApiKey.expiresAt || undefined,
    };
    if (apiKeyScopeMode === 'scoped' && newApiKeyScopes.length > 0) {
      body.scopes = newApiKeyScopes;
    }
    const res = await fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      apiKeyError = data.error || 'Failed';
      return;
    }
    const data = await res.json();
    createdKey = data.key;
    apiKeySuccess = `API key "${newApiKey.name}" created`;
    newApiKey = { name: '', expiresAt: '' };
    apiKeyScopeMode = 'all';
    newApiKeyScopes = [];
    await loadApiKeys();
  }

  async function deleteApiKey(id: string, name: string) {
    if (!confirm(`Delete API key "${name}"?`)) return;
    apiKeyError = '';
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      apiKeyError = data.error || 'Failed to delete API key';
      return;
    }
    apiKeySuccess = `API key "${name}" deleted`;
    await loadApiKeys();
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    keyCopied = true;
    setTimeout(() => (keyCopied = false), 2000);
  }

  async function createProvider() {
    providerError = '';
    providerSuccess = '';
    const res = await fetch('/api/admin/oidc-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProvider),
    });
    if (!res.ok) {
      const body = await res.json();
      providerError = body.error || 'Failed';
      return;
    }
    providerSuccess = `Provider "${newProvider.displayName}" created`;
    newProvider = {
      displayName: '',
      issuerUrl: '',
      clientId: '',
      clientSecret: '',
      scopes: 'openid email profile',
      enabled: true,
      autoCreateUsers: true,
    };
    await loadProviders();
  }

  function startEditProvider(p: OIDCProviderRow) {
    editingProvider = p.id;
    editForm = {
      displayName: p.display_name,
      issuerUrl: p.issuer_url,
      clientId: p.client_id,
      clientSecret: p.client_secret,
      scopes: p.scopes,
      enabled: p.enabled === 1,
      autoCreateUsers: p.auto_create_users === 1,
    };
  }

  async function saveProvider() {
    if (!editingProvider) return;
    await fetch(`/api/admin/oidc-providers/${editingProvider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: editForm.displayName,
        issuerUrl: editForm.issuerUrl,
        clientId: editForm.clientId,
        clientSecret: editForm.clientSecret,
        scopes: editForm.scopes,
        enabled: editForm.enabled ? 1 : 0,
        autoCreateUsers: editForm.autoCreateUsers ? 1 : 0,
      }),
    });
    editingProvider = null;
    await loadProviders();
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this OIDC provider?')) return;
    await fetch(`/api/admin/oidc-providers/${id}`, { method: 'DELETE' });
    await loadProviders();
  }
</script>

<div class="admin-page">
  <header class="admin-header">
    <a href="/" class="back-link">← Back</a>
    <h1>Admin</h1>
  </header>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'users'} onclick={() => (activeTab = 'users')}>
      Users ({users.length})
      {#if pendingCount > 0}
        <span class="tab-badge">{pendingCount}</span>
      {/if}
    </button>
    <button class="tab" class:active={activeTab === 'oidc'} onclick={() => (activeTab = 'oidc')}>
      OIDC Providers ({providers.length})
    </button>
    <button class="tab" class:active={activeTab === 'api-keys'} onclick={() => (activeTab = 'api-keys')}>
      API Keys ({apiKeys.length})
    </button>
    <button class="tab" class:active={activeTab === 'projects'} onclick={() => { activeTab = 'projects'; if (projects.length === 0) loadProjects(); }}>
      {m.admin_tab_projects()}
    </button>
    <button class="tab" class:active={activeTab === 'backup'} onclick={() => { activeTab = 'backup'; if (!backupStats) loadBackupStats(); }}>
      {m.admin_tab_backup()}
    </button>
    <button class="tab" class:active={activeTab === 'audit-log'} onclick={() => { activeTab = 'audit-log'; if (!auditLoaded) { loadAuditLogs(); loadAuditStats(); } }}>
      {m.admin_tab_audit_log()}
    </button>
  </div>

  {#if activeTab === 'users'}
    <section class="section">
      <h2>Users</h2>
      {#if pendingCount > 0}
        <label class="checkbox-label" style="margin-bottom:12px">
          <input type="checkbox" bind:checked={showPendingOnly} /> {m.admin_user_status_pending()} only ({pendingCount})
        </label>
      {/if}
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Display Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>{m.admin_auth_provider()}</th>
            <th>{m.admin_user_status()}</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredUsers as user}
            {#if editingUser === user.id}
              <tr>
                <td>{user.username ?? '(OIDC)'}</td>
                <td><input class="inline-input" bind:value={editUserForm.displayName} /></td>
                <td><input class="inline-input" type="email" bind:value={editUserForm.email} /></td>
                <td>
                  {#if isLastAdmin(user)}
                    <span class="badge badge-admin" title="Cannot demote the last admin">admin</span>
                  {:else}
                    <select class="inline-select" bind:value={editUserForm.role}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  {/if}
                </td>
                <td>
                  <div class="auth-badges">
                    {#if user.has_local_auth}<span class="badge badge-auth-local">{m.admin_auth_local()}</span>{/if}
                    {#each user.oidc_providers as provider}<span class="badge badge-auth-oidc">{provider}</span>{/each}
                  </div>
                </td>
                <td>
                  <select class="inline-select" bind:value={editUserForm.status}>
                    <option value="active">{m.admin_user_status_active()}</option>
                    <option value="pending">{m.admin_user_status_pending()}</option>
                  </select>
                </td>
                <td><input class="inline-input" type="password" placeholder="New password" bind:value={editUserForm.password} /></td>
                <td>
                  <div class="btn-row">
                    <button class="btn-sm btn-save" onclick={saveUser}>Save</button>
                    <button class="btn-sm" onclick={() => (editingUser = null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td>{user.username ?? '(OIDC)'}</td>
                <td>{user.display_name}</td>
                <td>{user.email ?? '-'}</td>
                <td>
                  <span class="badge" class:badge-admin={user.role === 'admin'}>{user.role}</span>
                  {#if isLastAdmin(user)}
                    <span class="badge badge-warn" title="Last admin — cannot demote or delete">sole</span>
                  {/if}
                </td>
                <td>
                  <div class="auth-badges">
                    {#if user.has_local_auth}<span class="badge badge-auth-local">{m.admin_auth_local()}</span>{/if}
                    {#each user.oidc_providers as provider}<span class="badge badge-auth-oidc">{provider}</span>{/each}
                  </div>
                </td>
                <td>
                  {#if user.status === 'pending'}
                    <span class="badge badge-pending">{m.admin_user_status_pending()}</span>
                  {:else}
                    <span class="badge badge-active">{m.admin_user_status_active()}</span>
                  {/if}
                </td>
                <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                <td>
                  <div class="btn-row">
                    {#if user.status === 'pending'}
                      <button class="btn-sm btn-approve" onclick={() => approveUser(user.id)}>{m.admin_user_approve()}</button>
                      <button class="btn-sm btn-danger" onclick={() => rejectUser(user.id, user.username)}>{m.admin_user_reject()}</button>
                    {:else}
                      <button class="btn-sm" onclick={() => startEditUser(user)}>Edit</button>
                      <button
                        class="btn-sm btn-danger"
                        disabled={isLastAdmin(user) || isSelf(user)}
                        title={isSelf(user) ? 'Cannot delete yourself' : isLastAdmin(user) ? 'Cannot delete the last admin' : 'Delete user'}
                        onclick={() => deleteUser(user.id, user.username)}
                      >Delete</button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>

      <div class="form-section">
        <h3>Create User</h3>
        <div class="form-grid">
          <input placeholder="Username" bind:value={newUser.username} />
          <input placeholder="Display Name" bind:value={newUser.displayName} />
          <input placeholder="Email" type="email" bind:value={newUser.email} />
          <input placeholder="Password" type="password" bind:value={newUser.password} />
          <select bind:value={newUser.role}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button class="btn-primary" onclick={createUser}>Create</button>
        </div>
        {#if userError}<div class="msg-error">{userError}</div>{/if}
        {#if userSuccess}<div class="msg-success">{userSuccess}</div>{/if}
      </div>
    </section>
  {:else if activeTab === 'oidc'}
    <section class="section">
      <h2>OIDC Providers</h2>

      {#each providers as provider}
        <div class="provider-card">
          {#if editingProvider === provider.id}
            <div class="form-grid">
              <input placeholder="Display Name" bind:value={editForm.displayName} />
              <input placeholder="Issuer URL" bind:value={editForm.issuerUrl} />
              <input placeholder="Client ID" bind:value={editForm.clientId} />
              <input placeholder="Client Secret" type="password" bind:value={editForm.clientSecret} />
              <input placeholder="Scopes" bind:value={editForm.scopes} />
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={editForm.enabled} /> Enabled
              </label>
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={editForm.autoCreateUsers} /> Auto-create users
              </label>
              <div class="btn-row">
                <button class="btn-primary" onclick={saveProvider}>Save</button>
                <button class="btn-cancel" onclick={() => (editingProvider = null)}>Cancel</button>
              </div>
            </div>
          {:else}
            <div class="provider-info">
              <strong>{provider.display_name}</strong>
              <span class="provider-detail">{provider.issuer_url}</span>
              <div class="provider-badges">
                <span class="badge" class:badge-on={provider.enabled === 1}>
                  {provider.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span class="badge">
                  {provider.auto_create_users ? 'Auto-register' : 'Manual'}
                </span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="btn-sm" onclick={() => startEditProvider(provider)}>Edit</button>
              <button class="btn-sm btn-danger" onclick={() => deleteProvider(provider.id)}>Delete</button>
            </div>
          {/if}
        </div>
      {/each}

      <div class="form-section">
        <h3>Add OIDC Provider</h3>
        <div class="form-grid">
          <input placeholder="Display Name (e.g. Google)" bind:value={newProvider.displayName} />
          <input placeholder="Issuer URL" bind:value={newProvider.issuerUrl} />
          <input placeholder="Client ID" bind:value={newProvider.clientId} />
          <input placeholder="Client Secret" type="password" bind:value={newProvider.clientSecret} />
          <input placeholder="Scopes" bind:value={newProvider.scopes} />
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={newProvider.enabled} /> Enabled
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={newProvider.autoCreateUsers} /> Auto-create users
          </label>
          <button class="btn-primary" onclick={createProvider}>Add Provider</button>
        </div>
        {#if providerError}<div class="msg-error">{providerError}</div>{/if}
        {#if providerSuccess}<div class="msg-success">{providerSuccess}</div>{/if}
      </div>
    </section>
  {:else if activeTab === 'api-keys'}
    <section class="section">
      <h2>API Keys</h2>
      <p class="section-desc">API keys allow external tools (MCP servers, CI/CD) to access erdmini on behalf of a user.</p>

      {#if createdKey}
        <div class="key-reveal">
          <p class="key-reveal-warning">Copy this key now — it will not be shown again.</p>
          <div class="key-reveal-row">
            <code class="key-value">{createdKey}</code>
            <button class="btn-sm btn-copy" onclick={copyKey}>
              {keyCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button class="btn-sm" onclick={() => (createdKey = null)}>Dismiss</button>
        </div>
      {/if}

      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>User</th>
            <th>Scopes</th>
            <th>Created</th>
            <th>Last Used</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each apiKeys as key}
            {#if editingKeyId === key.id}
              <tr>
                <td colspan="7">
                  <div class="key-edit-form">
                    <div class="form-grid">
                      <input class="inline-input" placeholder="Key name" bind:value={editKeyForm.name} />
                      <label class="input-label">
                        <span>Expires</span>
                        <input class="inline-input" type="date" bind:value={editKeyForm.expiresAt} />
                      </label>
                    </div>
                    <div class="scope-controls" style="margin-top:8px">
                      <label class="checkbox-label">
                        <input type="radio" bind:group={editKeyScopeMode} value="all" /> All Projects
                      </label>
                      <label class="checkbox-label">
                        <input type="radio" bind:group={editKeyScopeMode} value="scoped" /> Specific Projects
                      </label>
                    </div>
                    {#if editKeyScopeMode === 'scoped'}
                      <div style="margin-top:6px">
                        {#each editKeyScopes as scope, idx}
                          <div class="form-grid" style="margin-bottom:4px">
                            <input class="inline-input" placeholder="Project ID" bind:value={scope.projectId} />
                            <select class="inline-select" bind:value={scope.permission}>
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                            </select>
                            <button class="btn-sm btn-danger" onclick={() => { editKeyScopes = editKeyScopes.filter((_, i) => i !== idx); }}>✕</button>
                          </div>
                        {/each}
                        <button class="btn-sm" style="margin-top:4px" onclick={() => { editKeyScopes = [...editKeyScopes, { projectId: '', permission: 'viewer' }]; }}>+ Add Scope</button>
                      </div>
                    {/if}
                    <div class="btn-row" style="margin-top:10px">
                      <button class="btn-sm btn-save" onclick={saveApiKey}>Save</button>
                      <button class="btn-sm" onclick={() => (editingKeyId = null)}>Cancel</button>
                    </div>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td>{key.name}</td>
                <td>{key.user_display_name} {key.username ? `(${key.username})` : ''}</td>
                <td>
                  {#if key.scopes && key.scopes.length > 0}
                    {#each key.scopes as scope}
                      <span class="badge" style="margin-right:4px">{scope.project_id.slice(0,8)}… ({scope.permission})</span>
                    {/each}
                  {:else}
                    <span class="badge badge-on">All</span>
                  {/if}
                </td>
                <td>{key.created_at ? new Date(key.created_at).toLocaleDateString() : '-'}</td>
                <td>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</td>
                <td>
                  {#if key.expires_at}
                    <span class:expired={new Date(key.expires_at) < new Date()}>
                      {new Date(key.expires_at).toLocaleDateString()}
                    </span>
                  {:else}
                    Never
                  {/if}
                </td>
                <td>
                  <div class="btn-row">
                    <button class="btn-sm" onclick={() => startEditApiKey(key)}>Edit</button>
                    <button class="btn-sm btn-danger" onclick={() => deleteApiKey(key.id, key.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
          {#if apiKeys.length === 0}
            <tr><td colspan="7" style="text-align:center;color:#64748b">No API keys</td></tr>
          {/if}
        </tbody>
      </table>

      <div class="form-section">
        <h3>Create API Key</h3>
        <div class="form-grid">
          <input placeholder="Key name (e.g. MCP Server)" bind:value={newApiKey.name} />
          <label class="input-label">
            <span>Expires</span>
            <input type="date" bind:value={newApiKey.expiresAt} />
          </label>
        </div>
        <div class="scope-controls" style="margin-top:10px">
          <label class="checkbox-label">
            <input type="radio" bind:group={apiKeyScopeMode} value="all" /> All Projects (Unrestricted)
          </label>
          <label class="checkbox-label">
            <input type="radio" bind:group={apiKeyScopeMode} value="scoped" /> Specific Projects
          </label>
        </div>
        {#if apiKeyScopeMode === 'scoped'}
          <div style="margin-top:8px">
            {#each newApiKeyScopes as scope, idx}
              <div class="form-grid" style="margin-bottom:6px">
                <input placeholder="Project ID" bind:value={scope.projectId} />
                <select bind:value={scope.permission}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button class="btn-sm btn-danger" onclick={() => { newApiKeyScopes = newApiKeyScopes.filter((_, i) => i !== idx); }}>✕</button>
              </div>
            {/each}
            <button class="btn-sm" style="margin-top:4px" onclick={() => { newApiKeyScopes = [...newApiKeyScopes, { projectId: '', permission: 'viewer' }]; }}>+ Add Project Scope</button>
          </div>
        {/if}
        <div style="margin-top:10px">
          <button class="btn-primary" onclick={createApiKey}>Create Key</button>
        </div>
        {#if apiKeyError}<div class="msg-error">{apiKeyError}</div>{/if}
        {#if apiKeySuccess && !createdKey}<div class="msg-success">{apiKeySuccess}</div>{/if}
      </div>
    </section>
  {:else if activeTab === 'projects'}
    <section class="section">
      <h2>{m.admin_projects_title()}</h2>
      {#if projectError}<div class="msg-error">{projectError}</div>{/if}
      {#if projectSuccess}<div class="msg-success">{projectSuccess}</div>{/if}

      {#if projects.length === 0}
        <p class="section-desc">{m.admin_projects_no_projects()}</p>
      {:else}
        <table class="data-table">
          <thead>
            <tr>
              <th>{m.admin_projects_name()}</th>
              <th>{m.admin_projects_owner()}</th>
              <th>{m.admin_projects_members()}</th>
              <th>{m.admin_projects_updated()}</th>
              <th>{m.admin_projects_actions()}</th>
            </tr>
          </thead>
          <tbody>
            {#each projects as project}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <tr class="clickable-row" onclick={() => toggleProjectMembers(project.id)}>
                <td>
                  <span class="project-name">{project.name}</span>
                  <span class="project-id">{project.id.slice(0, 8)}…</span>
                </td>
                <td>{project.ownerName ?? '-'}</td>
                <td>{project.memberCount}</td>
                <td>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '-'}</td>
                <td>
                  <div class="btn-row" onclick={(e) => e.stopPropagation()}>
                    <button class="btn-sm btn-danger" onclick={() => deleteProject(project.id, project.name)}>{m.admin_projects_delete()}</button>
                  </div>
                </td>
              </tr>
              {#if expandedProject === project.id}
                <tr>
                  <td colspan="5">
                    <div class="project-detail">
                      <h4>{m.admin_projects_members()}</h4>
                      {#if projectMembers.length > 0}
                        <div class="member-list">
                          {#each projectMembers as member}
                            <div class="member-row">
                              <span class="member-name">{member.display_name}</span>
                              {#if member.username}<span class="member-username">({member.username})</span>{/if}
                              <span class="badge" class:badge-admin={member.permission === 'owner'}>{member.permission}</span>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="section-desc">No members</p>
                      {/if}

                      <div class="transfer-section">
                        <h4>{m.admin_projects_transfer()}</h4>
                        <div class="form-grid">
                          <select class="inline-select" bind:value={transferUserId}>
                            <option value="">{m.select_placeholder()}</option>
                            {#each users.filter(u => u.status === 'active' && u.id !== project.ownerId) as u}
                              <option value={u.id}>{u.display_name} {u.username ? `(${u.username})` : ''}</option>
                            {/each}
                          </select>
                          <button class="btn-sm btn-save" disabled={!transferUserId} onclick={() => transferOwnership(project.id, project.name)}>{m.admin_projects_transfer()}</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {:else if activeTab === 'backup'}
    <section class="section">
      <h2>{m.admin_backup_title()}</h2>

      <div class="form-section">
        <h3>{m.admin_backup_download()}</h3>
        {#if backupStats}
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">{m.admin_backup_db_size()}</span>
              <span class="stat-value">{(backupStats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{m.admin_backup_user_count()}</span>
              <span class="stat-value">{backupStats.userCount}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{m.admin_backup_project_count()}</span>
              <span class="stat-value">{backupStats.projectCount}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{m.admin_backup_version()}</span>
              <span class="stat-value">V{String(backupStats.migrationVersion).padStart(3, '0')}</span>
            </div>
          </div>
        {/if}
        <div style="margin-top:12px">
          <button class="btn-primary" onclick={downloadBackup} disabled={backupLoading}>
            {backupLoading ? m.admin_backup_downloading() : m.admin_backup_download()}
          </button>
        </div>
      </div>

      <div class="form-section" style="margin-top:16px">
        <h3>{m.admin_restore_title()}</h3>
        <p class="restore-warning">{m.admin_restore_warning()}</p>
        <div style="margin-top:12px">
          <label class="btn-primary restore-btn">
            {restoreLoading ? '...' : m.admin_restore_upload()}
            <input type="file" accept=".db" style="display:none" onchange={restoreBackup} disabled={restoreLoading} />
          </label>
        </div>
        {#if backupError}<div class="msg-error">{backupError}</div>{/if}
        {#if backupSuccess}<div class="msg-success">{backupSuccess}</div>{/if}
      </div>
    </section>
  {:else if activeTab === 'audit-log'}
    <section class="section">
      <h2>{m.admin_audit_title()}</h2>

      {#if auditStats}
        <div class="audit-retention-bar">
          <span>{m.admin_audit_retention({ days: String(auditStats.retentionDays) })}</span>
          <span class="retention-sep">|</span>
          <span>{m.admin_audit_total({ count: String(auditStats.totalCount) })}</span>
          {#if auditStats.oldestTimestamp}
            <span class="retention-sep">|</span>
            <span>{m.admin_audit_oldest({ date: formatAuditTimestamp(auditStats.oldestTimestamp) })}</span>
          {/if}
          <button class="btn-sm btn-danger" style="margin-left:auto" onclick={purgeAuditLogs}>
            {m.admin_audit_purge()}
          </button>
        </div>
        {#if auditPurgeMsg}<div class="msg-success">{auditPurgeMsg}</div>{/if}
      {/if}

      <div class="audit-filters">
        <select bind:value={auditCategory} onchange={() => loadAuditLogs()}>
          <option value="">{m.admin_audit_filter_all()}</option>
          <option value="auth">auth</option>
          <option value="user">user</option>
          <option value="project">project</option>
          <option value="api-key">api-key</option>
          <option value="oidc-provider">oidc-provider</option>
          <option value="backup">backup</option>
          <option value="mcp">mcp</option>
          <option value="schema">schema</option>
        </select>
        <input
          type="text"
          placeholder={m.admin_audit_action()}
          bind:value={auditAction}
          onkeydown={(e) => { if (e.key === 'Enter') loadAuditLogs(); }}
        />
        <button class="btn-secondary" onclick={() => loadAuditLogs()}>
          Search
        </button>
        {#if auditTotal > 0}
          <span class="audit-total">{m.admin_audit_total({ count: String(auditTotal) })}</span>
        {/if}
      </div>

      {#if auditLogs.length === 0 && !auditLoading}
        <p class="empty-msg">{m.admin_audit_no_logs()}</p>
      {:else}
        <table class="data-table">
          <thead>
            <tr>
              <th>{m.admin_audit_timestamp()}</th>
              <th>{m.admin_audit_user()}</th>
              <th>{m.admin_audit_action()}</th>
              <th>{m.admin_audit_category()}</th>
              <th>{m.admin_audit_resource()}</th>
              <th>{m.admin_audit_detail()}</th>
            </tr>
          </thead>
          <tbody>
            {#each auditLogs as log}
              <tr onclick={() => expandedAuditId = expandedAuditId === log.id ? null : log.id} class="clickable-row">
                <td class="nowrap">{formatAuditTimestamp(log.timestamp)}</td>
                <td>{log.username ?? m.admin_audit_system()}</td>
                <td><span class="badge action-{log.action.startsWith('login') || log.action === 'oidc_login' ? 'login' : log.action.startsWith('create') || log.action.startsWith('add') ? 'create' : log.action.startsWith('delete') ? 'delete' : log.action.startsWith('update') ? 'update' : 'other'}">{log.action}</span></td>
                <td><span class="badge cat-badge">{log.category}</span></td>
                <td class="nowrap">{log.resource_type && log.resource_id ? `${log.resource_type}:${log.resource_id.slice(0, 8)}` : ''}</td>
                <td class="detail-cell">
                  {#if log.detail}
                    {#if expandedAuditId === log.id}
                      <pre class="detail-expanded">{JSON.stringify(JSON.parse(log.detail), null, 2)}</pre>
                    {:else}
                      <span class="detail-summary">{log.detail.length > 60 ? log.detail.slice(0, 60) + '...' : log.detail}</span>
                    {/if}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if auditLogs.length < auditTotal}
          <div style="text-align:center;margin-top:16px">
            <button class="btn-secondary" onclick={() => loadAuditLogs(false)} disabled={auditLoading}>
              {auditLoading ? '...' : m.admin_audit_load_more()}
            </button>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .admin-page {
    min-height: 100vh;
    background: #0f172a;
    color: #f1f5f9;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .admin-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .admin-header h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
  }

  .back-link {
    color: #60a5fa;
    text-decoration: none;
    font-size: 14px;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 24px;
    border-bottom: 1px solid #334155;
    padding-bottom: 0;
  }

  .tab {
    padding: 10px 20px;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.15s;
  }

  .tab.active {
    color: #60a5fa;
    border-bottom-color: #60a5fa;
  }

  .tab:hover:not(.active) {
    color: #cbd5e1;
  }

  .section h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 13px;
  }

  .data-table th {
    text-align: left;
    padding: 8px 12px;
    color: #94a3b8;
    font-weight: 500;
    border-bottom: 1px solid #334155;
  }

  .data-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #1e293b;
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #334155;
    color: #94a3b8;
  }

  .badge-admin {
    background: #1e3a5f;
    color: #60a5fa;
  }

  .badge-warn {
    background: #713f12;
    color: #fbbf24;
    margin-left: 4px;
  }

  .badge-on {
    background: #14532d;
    color: #4ade80;
  }

  .badge-active {
    background: #14532d;
    color: #4ade80;
  }

  .badge-pending {
    background: #713f12;
    color: #fbbf24;
  }

  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: #f59e0b;
    color: #1e293b;
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
  }

  .btn-approve {
    background: #22c55e;
    color: white;
  }

  .btn-approve:hover {
    background: #16a34a;
  }

  .form-section {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 20px;
    margin-top: 16px;
  }

  .form-section h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
    color: #e2e8f0;
  }

  .form-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .form-grid input[type="text"],
  .form-grid input[type="email"],
  .form-grid input[type="password"],
  .form-grid input:not([type]),
  .form-grid select {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    min-width: 160px;
    flex: 1;
  }

  .form-grid input:focus,
  .form-grid select:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary {
    padding: 8px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: #334155;
    color: #cbd5e1;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: #475569;
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }

  .btn-sm {
    padding: 4px 10px;
    background: #334155;
    color: #cbd5e1;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-sm:hover {
    background: #475569;
  }

  .btn-danger {
    color: #f87171;
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.15);
  }

  .btn-danger:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .provider-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .provider-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .provider-info strong {
    font-size: 14px;
  }

  .provider-detail {
    font-size: 12px;
    color: #64748b;
  }

  .provider-badges {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .provider-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .inline-input {
    padding: 4px 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 12px;
    width: 100%;
    min-width: 80px;
  }

  .inline-input:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .inline-select {
    padding: 4px 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 12px;
  }

  .inline-select:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .btn-save {
    background: #22c55e;
    color: white;
  }

  .btn-save:hover {
    background: #16a34a;
  }

  .msg-error {
    margin-top: 8px;
    font-size: 13px;
    color: #f87171;
  }

  .msg-success {
    margin-top: 8px;
    font-size: 13px;
    color: #4ade80;
  }

  .section-desc {
    font-size: 13px;
    color: #94a3b8;
    margin: 0 0 16px;
  }

  .key-reveal {
    background: #1a2332;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .key-reveal-warning {
    font-size: 13px;
    color: #fbbf24;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .key-reveal-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .key-value {
    font-family: monospace;
    font-size: 12px;
    background: #0f172a;
    padding: 8px 12px;
    border-radius: 4px;
    color: #4ade80;
    word-break: break-all;
    flex: 1;
  }

  .btn-copy {
    background: #22c55e;
    color: white;
    white-space: nowrap;
  }

  .btn-copy:hover {
    background: #16a34a;
  }

  .expired {
    color: #f87171;
  }

  .input-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #cbd5e1;
    white-space: nowrap;
  }

  .input-label input {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .key-edit-form {
    padding: 12px 16px;
    background: #1e293b;
    border-radius: 6px;
  }

  .scope-controls {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .auth-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .badge-auth-local {
    background: #1e3a5f;
    color: #93c5fd;
  }

  .badge-auth-oidc {
    background: #312e81;
    color: #c4b5fd;
  }

  /* Projects tab */
  .clickable-row {
    cursor: pointer;
  }

  .clickable-row:hover {
    background: rgba(96, 165, 250, 0.05);
  }

  .project-name {
    font-weight: 500;
  }

  .project-id {
    font-size: 11px;
    color: #64748b;
    margin-left: 8px;
    font-family: monospace;
  }

  .project-detail {
    padding: 12px 16px;
    background: #1e293b;
    border-radius: 6px;
  }

  .project-detail h4 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: #cbd5e1;
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .member-name {
    font-weight: 500;
  }

  .member-username {
    color: #64748b;
    font-size: 12px;
  }

  .transfer-section {
    border-top: 1px solid #334155;
    padding-top: 12px;
  }

  /* Backup tab */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .restore-warning {
    font-size: 13px;
    color: #f59e0b;
    margin: 0;
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 6px;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .restore-btn {
    display: inline-block;
    cursor: pointer;
  }

  /* Audit Log tab */
  .audit-retention-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: #94a3b8;
  }

  .retention-sep {
    color: #475569;
  }

  .audit-filters {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .audit-filters select,
  .audit-filters input[type="text"] {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .audit-filters select:focus,
  .audit-filters input:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .btn-secondary {
    padding: 8px 16px;
    background: #334155;
    color: #cbd5e1;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .audit-total {
    font-size: 13px;
    color: #94a3b8;
    margin-left: 8px;
  }

  .empty-msg {
    font-size: 14px;
    color: #64748b;
    text-align: center;
    padding: 32px 0;
  }

  .nowrap {
    white-space: nowrap;
  }

  .action-login { background: #1e3a5f; color: #93c5fd; }
  .action-create { background: #14532d; color: #4ade80; }
  .action-delete { background: #7f1d1d; color: #fca5a5; }
  .action-update { background: #713f12; color: #fbbf24; }
  .action-other { background: #334155; color: #94a3b8; }

  .cat-badge {
    background: #1e293b;
    color: #94a3b8;
    border: 1px solid #334155;
  }

  .detail-cell {
    max-width: 300px;
    overflow: hidden;
  }

  .detail-summary {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
    cursor: pointer;
  }

  .detail-expanded {
    font-size: 12px;
    color: #cbd5e1;
    background: #0f172a;
    padding: 8px 12px;
    border-radius: 4px;
    max-width: 400px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 4px 0;
  }
</style>

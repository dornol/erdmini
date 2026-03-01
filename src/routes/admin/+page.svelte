<script lang="ts">
  import { onMount } from 'svelte';
  import type { UserRow, OIDCProviderRow } from '$lib/types/auth';
  import { authStore } from '$lib/store/auth.svelte';

  type UserInfo = Omit<UserRow, 'password_hash'>;

  let users = $state<UserInfo[]>([]);
  let providers = $state<OIDCProviderRow[]>([]);
  let activeTab = $state<'users' | 'oidc'>('users');

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

  let adminCount = $derived(users.filter(u => u.role === 'admin').length);

  function isLastAdmin(user: UserInfo): boolean {
    return user.role === 'admin' && adminCount <= 1;
  }

  function isSelf(user: UserInfo): boolean {
    return user.id === authStore.user?.id;
  }

  // Edit user
  let editingUser = $state<string | null>(null);
  let editUserForm = $state({ displayName: '', email: '', role: 'user', password: '' });

  function startEditUser(user: UserInfo) {
    editingUser = user.id;
    editUserForm = {
      displayName: user.display_name,
      email: user.email ?? '',
      role: user.role,
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
    await Promise.all([loadUsers(), loadProviders()]);
  });

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
    </button>
    <button class="tab" class:active={activeTab === 'oidc'} onclick={() => (activeTab = 'oidc')}>
      OIDC Providers ({providers.length})
    </button>
  </div>

  {#if activeTab === 'users'}
    <section class="section">
      <h2>Users</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Display Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
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
                <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                <td>
                  <div class="btn-row">
                    <button class="btn-sm" onclick={() => startEditUser(user)}>Edit</button>
                    <button
                      class="btn-sm btn-danger"
                      disabled={isLastAdmin(user) || isSelf(user)}
                      title={isSelf(user) ? 'Cannot delete yourself' : isLastAdmin(user) ? 'Cannot delete the last admin' : 'Delete user'}
                      onclick={() => deleteUser(user.id, user.username)}
                    >Delete</button>
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
  {:else}
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
  {/if}
</div>

<style>
  .admin-page {
    min-height: 100vh;
    background: #0f172a;
    color: #f1f5f9;
    padding: 24px;
    max-width: 900px;
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
</style>

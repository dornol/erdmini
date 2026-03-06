<script lang="ts">
  import { authStore } from '$lib/store/auth.svelte';
  import * as m from '$lib/paraglide/messages';

  export type UserInfo = {
    id: string;
    username: string | null;
    display_name: string;
    email: string | null;
    role: string;
    status: string;
    created_at: string | null;
    has_local_auth: boolean;
    oidc_providers: string[];
    ldap_providers: string[];
    groups?: string[];
  };

  interface Props {
    users: UserInfo[];
    onreload: () => Promise<void>;
  }

  let { users, onreload }: Props = $props();

  let userError = $state('');
  let userSuccess = $state('');
  let newUser = $state({ username: '', displayName: '', email: '', password: '', role: 'user' });
  let showPendingOnly = $state(false);

  let editingUser = $state<string | null>(null);
  let editUserForm = $state({ displayName: '', email: '', role: 'user', status: 'active', password: '' });

  let adminCount = $derived(users.filter(u => u.role === 'admin').length);
  let pendingCount = $derived(users.filter(u => u.status === 'pending').length);
  let filteredUsers = $derived(showPendingOnly ? users.filter(u => u.status === 'pending') : users);

  function isLastAdmin(user: UserInfo): boolean {
    return user.role === 'admin' && adminCount <= 1;
  }

  function isSelf(user: UserInfo): boolean {
    return user.id === authStore.user?.id;
  }

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
    await onreload();
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
    await onreload();
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
    await onreload();
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
    await onreload();
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
    await onreload();
  }
</script>

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
        <th>{m.admin_tab_groups()}</th>
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
                {#each user.ldap_providers as provider}<span class="badge badge-auth-ldap">{provider}</span>{/each}
              </div>
            </td>
            <td>
              <div class="auth-badges">
                {#each user.groups ?? [] as group}<span class="badge badge-group">{group}</span>{/each}
                {#if !user.groups?.length}-{/if}
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
                {#each user.ldap_providers as provider}<span class="badge badge-auth-ldap">{provider}</span>{/each}
              </div>
            </td>
            <td>
              <div class="auth-badges">
                {#each user.groups ?? [] as group}<span class="badge badge-group">{group}</span>{/each}
                {#if !user.groups?.length}-{/if}
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

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
    can_create_project: boolean;
    can_create_api_key: boolean;
    can_create_embed: boolean;
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
  let editUserForm = $state({ displayName: '', email: '', role: 'user', status: 'active', password: '', canCreateProject: true, canCreateApiKey: true, canCreateEmbed: true });

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
      canCreateProject: user.can_create_project,
      canCreateApiKey: user.can_create_api_key,
      canCreateEmbed: user.can_create_embed,
    };
  }

  async function saveUser() {
    if (!editingUser) return;
    userError = '';
    const body: Record<string, unknown> = {
      displayName: editUserForm.displayName,
      email: editUserForm.email,
      role: editUserForm.role,
      status: editUserForm.status,
      canCreateProject: editUserForm.canCreateProject,
      canCreateApiKey: editUserForm.canCreateApiKey,
      canCreateEmbed: editUserForm.canCreateEmbed,
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
    if (!confirm(m.admin_users_delete_confirm({ name: username ?? id }))) return;
    userError = '';
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      userError = data.error || 'Failed to delete user';
      return;
    }
    userSuccess = m.admin_users_deleted({ name: username ?? id });
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
    if (!confirm(m.admin_users_reject_confirm({ name: username ?? id }))) return;
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
    userSuccess = m.admin_users_created_msg({ name: newUser.username });
    newUser = { username: '', displayName: '', email: '', password: '', role: 'user' };
    await onreload();
  }
</script>

<section class="section">
  <h2>{m.admin_users_title()}</h2>
  {#if pendingCount > 0}
    <label class="checkbox-label" style="margin-bottom:12px">
      <input type="checkbox" bind:checked={showPendingOnly} /> {m.admin_users_pending_only({ status: m.admin_user_status_pending(), count: String(pendingCount) })}
    </label>
  {/if}
  <table class="data-table">
    <thead>
      <tr>
        <th>{m.admin_users_username()}</th>
        <th>{m.admin_users_display_name()}</th>
        <th>{m.admin_users_email()}</th>
        <th>{m.admin_users_role()}</th>
        <th>{m.admin_auth_provider()}</th>
        <th>{m.admin_tab_groups()}</th>
        <th>{m.admin_users_permissions()}</th>
        <th>{m.admin_user_status()}</th>
        <th>{m.admin_api_keys_created_at()}</th>
        <th>{m.admin_groups_actions()}</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredUsers as user}
        {#if editingUser === user.id}
          <tr>
            <td>{user.username ?? m.admin_users_no_username()}</td>
            <td><input class="inline-input" bind:value={editUserForm.displayName} /></td>
            <td><input class="inline-input" type="email" bind:value={editUserForm.email} /></td>
            <td>
              {#if isLastAdmin(user)}
                <span class="badge badge-admin" title={m.admin_users_last_admin_hint()}>admin</span>
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
              {#if editUserForm.role !== 'admin'}
                <div class="perm-checks">
                  <label class="perm-check"><input type="checkbox" bind:checked={editUserForm.canCreateProject} /> {m.admin_users_perm_project()}</label>
                  <label class="perm-check"><input type="checkbox" bind:checked={editUserForm.canCreateApiKey} /> {m.admin_users_perm_api_key()}</label>
                  <label class="perm-check"><input type="checkbox" bind:checked={editUserForm.canCreateEmbed} /> {m.admin_users_perm_embed()}</label>
                </div>
              {:else}
                <span class="badge badge-on">{m.admin_users_perm_all()}</span>
              {/if}
            </td>
            <td>
              <select class="inline-select" bind:value={editUserForm.status}>
                <option value="active">{m.admin_user_status_active()}</option>
                <option value="pending">{m.admin_user_status_pending()}</option>
              </select>
            </td>
            <td><input class="inline-input" type="password" placeholder={m.admin_users_new_password()} bind:value={editUserForm.password} /></td>
            <td>
              <div class="btn-row">
                <button class="btn-sm btn-save" onclick={saveUser}>{m.action_save()}</button>
                <button class="btn-sm" onclick={() => (editingUser = null)}>{m.action_cancel()}</button>
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td>{user.username ?? m.admin_users_no_username()}</td>
            <td>{user.display_name}</td>
            <td>{user.email ?? '-'}</td>
            <td>
              <span class="badge" class:badge-admin={user.role === 'admin'}>{user.role}</span>
              {#if isLastAdmin(user)}
                <span class="badge badge-warn" title={m.admin_users_sole_hint()}>{m.admin_users_sole_badge()}</span>
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
              {#if user.role === 'admin'}
                <span class="badge badge-on">{m.admin_users_perm_all()}</span>
              {:else}
                <div class="perm-badges">
                  {#if user.can_create_project}<span class="badge badge-perm">{m.admin_users_perm_project()}</span>{/if}
                  {#if user.can_create_api_key}<span class="badge badge-perm">{m.admin_users_perm_api_key()}</span>{/if}
                  {#if user.can_create_embed}<span class="badge badge-perm">{m.admin_users_perm_embed()}</span>{/if}
                  {#if !user.can_create_project && !user.can_create_api_key && !user.can_create_embed}<span class="badge">{m.admin_users_perm_none()}</span>{/if}
                </div>
              {/if}
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
                  <button class="btn-sm" onclick={() => startEditUser(user)}>{m.action_edit()}</button>
                  <button
                    class="btn-sm btn-danger"
                    disabled={isLastAdmin(user) || isSelf(user)}
                    title={isSelf(user) ? m.admin_users_delete_self_hint() : isLastAdmin(user) ? m.admin_users_sole_hint() : m.admin_users_delete_hint()}
                    onclick={() => deleteUser(user.id, user.username)}
                  >{m.action_delete()}</button>
                {/if}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>

  <div class="form-section">
    <h3>{m.admin_users_create_title()}</h3>
    <div class="form-grid">
      <input placeholder={m.admin_users_username()} bind:value={newUser.username} />
      <input placeholder={m.admin_users_display_name()} bind:value={newUser.displayName} />
      <input placeholder={m.admin_users_email()} type="email" bind:value={newUser.email} />
      <input placeholder={m.auth_new_password()} type="password" bind:value={newUser.password} />
      <select bind:value={newUser.role}>
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button class="btn-primary" onclick={createUser}>{m.action_create()}</button>
    </div>
    {#if userError}<div class="msg-error">{userError}</div>{/if}
    {#if userSuccess}<div class="msg-success">{userSuccess}</div>{/if}
  </div>
</section>

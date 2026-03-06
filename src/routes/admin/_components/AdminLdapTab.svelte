<script lang="ts">
  import type { LdapProviderRow } from '$lib/types/auth';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    providers: LdapProviderRow[];
    onreload: () => Promise<void>;
  }

  let { providers, onreload }: Props = $props();

  let providerError = $state('');
  let providerSuccess = $state('');
  let testResult = $state<{ success: boolean; error?: string } | null>(null);
  let testing = $state(false);

  let newProvider = $state({
    displayName: '',
    serverUrl: '',
    bindDn: '',
    bindPassword: '',
    userSearchBase: '',
    userSearchFilter: '(uid={{username}})',
    emailAttribute: 'mail',
    displayNameAttribute: 'cn',
    groupSearchBase: '',
    groupSearchFilter: '(member={{userDn}})',
    adminGroupDn: '',
    allowedGroupDns: '',
    startTls: false,
    enabled: true,
    autoCreateUsers: true,
    syncGroups: false,
  });

  let editingProvider = $state<string | null>(null);
  let editForm = $state({
    displayName: '',
    serverUrl: '',
    bindDn: '',
    bindPassword: '',
    userSearchBase: '',
    userSearchFilter: '',
    emailAttribute: '',
    displayNameAttribute: '',
    groupSearchBase: '',
    groupSearchFilter: '',
    adminGroupDn: '',
    allowedGroupDns: '',
    startTls: false,
    enabled: true,
    autoCreateUsers: true,
    syncGroups: false,
  });

  function startEditProvider(p: LdapProviderRow) {
    editingProvider = p.id;
    editForm = {
      displayName: p.display_name,
      serverUrl: p.server_url,
      bindDn: p.bind_dn,
      bindPassword: '',
      userSearchBase: p.user_search_base,
      userSearchFilter: p.user_search_filter,
      emailAttribute: p.email_attribute,
      displayNameAttribute: p.display_name_attribute,
      groupSearchBase: p.group_search_base || '',
      groupSearchFilter: p.group_search_filter || '',
      adminGroupDn: p.admin_group_dn || '',
      allowedGroupDns: p.allowed_group_dns || '',
      startTls: p.start_tls === 1,
      enabled: p.enabled === 1,
      autoCreateUsers: p.auto_create_users === 1,
      syncGroups: p.sync_groups === 1,
    };
  }

  async function saveProvider() {
    if (!editingProvider) return;
    const body: Record<string, unknown> = {
      displayName: editForm.displayName,
      serverUrl: editForm.serverUrl,
      bindDn: editForm.bindDn,
      userSearchBase: editForm.userSearchBase,
      userSearchFilter: editForm.userSearchFilter,
      emailAttribute: editForm.emailAttribute,
      displayNameAttribute: editForm.displayNameAttribute,
      groupSearchBase: editForm.groupSearchBase || null,
      groupSearchFilter: editForm.groupSearchFilter || null,
      adminGroupDn: editForm.adminGroupDn || null,
      allowedGroupDns: editForm.allowedGroupDns || null,
      startTls: editForm.startTls ? 1 : 0,
      enabled: editForm.enabled ? 1 : 0,
      autoCreateUsers: editForm.autoCreateUsers ? 1 : 0,
      syncGroups: editForm.syncGroups ? 1 : 0,
    };
    if (editForm.bindPassword) {
      body.bindPassword = editForm.bindPassword;
    }
    await fetch(`/api/admin/ldap-providers/${editingProvider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    editingProvider = null;
    await onreload();
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this LDAP provider?')) return;
    await fetch(`/api/admin/ldap-providers/${id}`, { method: 'DELETE' });
    await onreload();
  }

  async function createProvider() {
    providerError = '';
    providerSuccess = '';
    const res = await fetch('/api/admin/ldap-providers', {
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
      serverUrl: '',
      bindDn: '',
      bindPassword: '',
      userSearchBase: '',
      userSearchFilter: '(uid={{username}})',
      emailAttribute: 'mail',
      displayNameAttribute: 'cn',
      groupSearchBase: '',
      groupSearchFilter: '(member={{userDn}})',
      adminGroupDn: '',
      allowedGroupDns: '',
      startTls: false,
      enabled: true,
      autoCreateUsers: true,
      syncGroups: false,
    };
    await onreload();
  }

  async function testConnection() {
    testing = true;
    testResult = null;
    try {
      const res = await fetch('/api/admin/ldap-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: newProvider.serverUrl,
          bindDn: newProvider.bindDn,
          bindPassword: newProvider.bindPassword,
          startTls: newProvider.startTls,
          userSearchBase: newProvider.userSearchBase,
        }),
      });
      testResult = await res.json();
    } catch {
      testResult = { success: false, error: 'Network error' };
    } finally {
      testing = false;
    }
  }
</script>

<section class="section">
  <h2>LDAP Providers</h2>

  {#each providers as provider}
    <div class="provider-card">
      {#if editingProvider === provider.id}
        <div class="form-grid ldap-form">
          <input placeholder="Display Name" bind:value={editForm.displayName} />
          <input placeholder="Server URL (ldap://host:389)" bind:value={editForm.serverUrl} />
          <input placeholder="Bind DN" bind:value={editForm.bindDn} />
          <input placeholder="Bind Password (leave empty to keep)" type="password" bind:value={editForm.bindPassword} />
          <input placeholder="User Search Base" bind:value={editForm.userSearchBase} />
          <input placeholder="User Search Filter" bind:value={editForm.userSearchFilter} />
          <input placeholder="Email Attribute" bind:value={editForm.emailAttribute} />
          <input placeholder="Display Name Attribute" bind:value={editForm.displayNameAttribute} />
          <input placeholder="Group Search Base (optional)" bind:value={editForm.groupSearchBase} />
          <input placeholder="Group Search Filter (optional)" bind:value={editForm.groupSearchFilter} />
          <input placeholder="Admin Group DN (optional)" bind:value={editForm.adminGroupDn} />
          <input placeholder="Allowed Group DNs (comma-separated, optional)" bind:value={editForm.allowedGroupDns} />
          <span class="field-hint">Only users in these groups can log in. Leave empty to allow all.</span>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editForm.startTls} /> StartTLS
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editForm.enabled} /> Enabled
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editForm.autoCreateUsers} /> Auto-create users
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editForm.syncGroups} /> {m.admin_ldap_sync_groups()}
          </label>
          {#if editForm.syncGroups && !editForm.groupSearchBase}
            <span class="field-hint">{m.admin_ldap_sync_groups_hint()}</span>
          {/if}
          <div class="btn-row">
            <button class="btn-primary" onclick={saveProvider}>Save</button>
            <button class="btn-cancel" onclick={() => (editingProvider = null)}>Cancel</button>
          </div>
        </div>
      {:else}
        <div class="provider-info">
          <strong>{provider.display_name}</strong>
          <span class="provider-detail">{provider.server_url}</span>
          <span class="provider-detail">{provider.user_search_base}</span>
          <div class="provider-badges">
            <span class="badge" class:badge-on={provider.enabled === 1}>
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span class="badge">
              {provider.auto_create_users ? 'Auto-register' : 'Manual'}
            </span>
            {#if provider.start_tls}
              <span class="badge badge-on">StartTLS</span>
            {/if}
            {#if provider.admin_group_dn}
              <span class="badge">Admin group</span>
            {/if}
            {#if provider.allowed_group_dns}
              <span class="badge badge-warn">Restricted groups</span>
            {/if}
            {#if provider.sync_groups}
              <span class="badge badge-on">{m.admin_ldap_sync_groups()}</span>
            {/if}
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
    <h3>Add LDAP Provider</h3>
    <div class="form-grid ldap-form">
      <input placeholder="Display Name (e.g. Corporate AD)" bind:value={newProvider.displayName} />
      <input placeholder="Server URL (ldap://host:389)" bind:value={newProvider.serverUrl} />
      <input placeholder="Bind DN (e.g. cn=admin,dc=example,dc=com)" bind:value={newProvider.bindDn} />
      <input placeholder="Bind Password" type="password" bind:value={newProvider.bindPassword} />
      <input placeholder="User Search Base (e.g. ou=users,dc=example,dc=com)" bind:value={newProvider.userSearchBase} />
      <input placeholder="User Search Filter" bind:value={newProvider.userSearchFilter} />
      <input placeholder="Email Attribute" bind:value={newProvider.emailAttribute} />
      <input placeholder="Display Name Attribute" bind:value={newProvider.displayNameAttribute} />
      <input placeholder="Group Search Base (optional)" bind:value={newProvider.groupSearchBase} />
      <input placeholder="Group Search Filter (optional)" bind:value={newProvider.groupSearchFilter} />
      <input placeholder="Admin Group DN (optional)" bind:value={newProvider.adminGroupDn} />
      <input placeholder="Allowed Group DNs (comma-separated, optional)" bind:value={newProvider.allowedGroupDns} />
      <span class="field-hint">Only users in these groups can log in. Leave empty to allow all.</span>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={newProvider.startTls} /> StartTLS
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={newProvider.enabled} /> Enabled
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={newProvider.autoCreateUsers} /> Auto-create users
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={newProvider.syncGroups} /> {m.admin_ldap_sync_groups()}
      </label>
      {#if newProvider.syncGroups && !newProvider.groupSearchBase}
        <span class="field-hint">{m.admin_ldap_sync_groups_hint()}</span>
      {/if}
      <div class="btn-row">
        <button class="btn-primary" onclick={createProvider}>Add Provider</button>
        <button class="btn-secondary" onclick={testConnection} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
    </div>
    {#if providerError}<div class="msg-error">{providerError}</div>{/if}
    {#if providerSuccess}<div class="msg-success">{providerSuccess}</div>{/if}
    {#if testResult}
      <div class={testResult.success ? 'msg-success' : 'msg-error'}>
        {testResult.success ? 'Connection successful!' : `Connection failed: ${testResult.error}`}
      </div>
    {/if}
  </div>
</section>

<style>
  .ldap-form {
    flex-direction: column;
    align-items: stretch;
  }

  .field-hint {
    font-size: 12px;
    color: #64748b;
    margin-top: -6px;
  }
</style>

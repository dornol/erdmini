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
    const res = await fetch(`/api/admin/ldap-providers/${editingProvider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      providerError = data.error || 'Failed to update';
      return;
    }
    editingProvider = null;
    providerError = '';
    await onreload();
  }

  async function deleteProvider(id: string) {
    if (!confirm(m.admin_ldap_delete_confirm())) return;
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
    providerSuccess = m.admin_ldap_created({ name: newProvider.displayName });
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
      testResult = { success: false, error: m.admin_ldap_network_error() };
    } finally {
      testing = false;
    }
  }
</script>

<section class="section">
  <h2>{m.admin_ldap_title()}</h2>

  {#each providers as provider}
    <div class="provider-card" class:provider-card-editing={editingProvider === provider.id}>
      {#if editingProvider === provider.id}
        <div class="ldap-form">
          <div class="ldap-form-group">
            <label class="ldap-label">{m.admin_ldap_display_name()}</label>
            <input bind:value={editForm.displayName} />
          </div>
          <div class="ldap-form-group">
            <label class="ldap-label">{m.admin_ldap_server_url()}</label>
            <input placeholder="ldap://host:389" bind:value={editForm.serverUrl} />
          </div>
          <div class="ldap-form-row">
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_bind_dn()}</label>
              <input bind:value={editForm.bindDn} />
            </div>
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_bind_password()}</label>
              <input type="password" placeholder={m.admin_ldap_bind_password_keep()} bind:value={editForm.bindPassword} />
            </div>
          </div>
          <div class="ldap-form-group">
            <label class="ldap-label">{m.admin_ldap_user_search_base()}</label>
            <input bind:value={editForm.userSearchBase} />
          </div>
          <div class="ldap-form-row">
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_user_search_filter()}</label>
              <input bind:value={editForm.userSearchFilter} />
            </div>
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_email_attr()}</label>
              <input bind:value={editForm.emailAttribute} />
            </div>
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_display_name_attr()}</label>
              <input bind:value={editForm.displayNameAttribute} />
            </div>
          </div>

          <div class="ldap-divider"></div>
          <span class="ldap-section-label">{m.admin_ldap_group_settings()}</span>

          <div class="ldap-form-row">
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_group_search_base()}</label>
              <input placeholder="ou=groups,dc=example,dc=com" bind:value={editForm.groupSearchBase} />
            </div>
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_group_search_filter()}</label>
              <input bind:value={editForm.groupSearchFilter} />
            </div>
          </div>
          <div class="ldap-form-row">
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_admin_group_dn()}</label>
              <input placeholder="cn=admins,ou=groups,..." bind:value={editForm.adminGroupDn} />
            </div>
            <div class="ldap-form-group">
              <label class="ldap-label">{m.admin_ldap_allowed_group_dns()}</label>
              <input placeholder={m.admin_ldap_allowed_group_dns()} bind:value={editForm.allowedGroupDns} />
            </div>
          </div>
          <span class="field-hint">{m.admin_ldap_allowed_hint()}</span>

          <div class="ldap-checks">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editForm.startTls} /> {m.admin_ldap_start_tls()}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editForm.enabled} /> {m.admin_ldap_enabled()}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editForm.autoCreateUsers} /> {m.admin_ldap_auto_create()}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editForm.syncGroups} /> {m.admin_ldap_sync_groups()}
            </label>
          </div>
          {#if editForm.syncGroups && !editForm.groupSearchBase}
            <span class="field-hint">{m.admin_ldap_sync_groups_hint()}</span>
          {/if}
          <div class="btn-row">
            <button class="btn-primary" onclick={saveProvider}>{m.action_save()}</button>
            <button class="btn-cancel" onclick={() => (editingProvider = null)}>{m.action_cancel()}</button>
          </div>
        </div>
      {:else}
        <div class="provider-info">
          <strong>{provider.display_name}</strong>
          <span class="provider-detail">{provider.server_url}</span>
          <span class="provider-detail">{provider.user_search_base}</span>
          <div class="provider-badges">
            <span class="badge" class:badge-on={provider.enabled === 1}>
              {provider.enabled ? m.admin_ldap_enabled() : m.admin_ldap_disabled()}
            </span>
            <span class="badge">
              {provider.auto_create_users ? m.admin_ldap_auto_register() : m.admin_ldap_manual()}
            </span>
            {#if provider.start_tls}
              <span class="badge badge-on">StartTLS</span>
            {/if}
            {#if provider.admin_group_dn}
              <span class="badge">{m.admin_ldap_admin_group()}</span>
            {/if}
            {#if provider.allowed_group_dns}
              <span class="badge badge-warn">{m.admin_ldap_restricted()}</span>
            {/if}
            {#if provider.sync_groups}
              <span class="badge badge-on">{m.admin_ldap_sync_groups()}</span>
            {/if}
          </div>
        </div>
        <div class="provider-actions">
          <button class="btn-sm" onclick={() => startEditProvider(provider)}>{m.action_edit()}</button>
          <button class="btn-sm btn-danger" onclick={() => deleteProvider(provider.id)}>{m.action_delete()}</button>
        </div>
      {/if}
    </div>
  {/each}

  <div class="form-section">
    <h3>{m.admin_ldap_add_title()}</h3>
    <div class="ldap-form">
      <div class="ldap-form-group">
        <label class="ldap-label">{m.admin_ldap_display_name()}</label>
        <input placeholder={m.admin_ldap_display_name()} bind:value={newProvider.displayName} />
      </div>
      <div class="ldap-form-group">
        <label class="ldap-label">{m.admin_ldap_server_url()}</label>
        <input placeholder="ldap://host:389" bind:value={newProvider.serverUrl} />
      </div>
      <div class="ldap-form-row">
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_bind_dn()}</label>
          <input placeholder="cn=admin,dc=example,dc=com" bind:value={newProvider.bindDn} />
        </div>
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_bind_password()}</label>
          <input type="password" bind:value={newProvider.bindPassword} />
        </div>
      </div>
      <div class="ldap-form-group">
        <label class="ldap-label">{m.admin_ldap_user_search_base()}</label>
        <input placeholder="ou=users,dc=example,dc=com" bind:value={newProvider.userSearchBase} />
      </div>
      <div class="ldap-form-row">
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_user_search_filter()}</label>
          <input bind:value={newProvider.userSearchFilter} />
        </div>
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_email_attr()}</label>
          <input bind:value={newProvider.emailAttribute} />
        </div>
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_display_name_attr()}</label>
          <input bind:value={newProvider.displayNameAttribute} />
        </div>
      </div>

      <div class="ldap-divider"></div>
      <span class="ldap-section-label">{m.admin_ldap_group_settings()}</span>

      <div class="ldap-form-row">
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_group_search_base()}</label>
          <input placeholder="ou=groups,dc=example,dc=com" bind:value={newProvider.groupSearchBase} />
        </div>
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_group_search_filter()}</label>
          <input bind:value={newProvider.groupSearchFilter} />
        </div>
      </div>
      <div class="ldap-form-row">
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_admin_group_dn()}</label>
          <input placeholder="cn=admins,ou=groups,..." bind:value={newProvider.adminGroupDn} />
        </div>
        <div class="ldap-form-group">
          <label class="ldap-label">{m.admin_ldap_allowed_group_dns()}</label>
          <input placeholder={m.admin_ldap_allowed_group_dns()} bind:value={newProvider.allowedGroupDns} />
        </div>
      </div>
      <span class="field-hint">{m.admin_ldap_allowed_hint()}</span>

      <div class="ldap-checks">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={newProvider.startTls} /> {m.admin_ldap_start_tls()}
        </label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={newProvider.enabled} /> {m.admin_ldap_enabled()}
        </label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={newProvider.autoCreateUsers} /> {m.admin_ldap_auto_create()}
        </label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={newProvider.syncGroups} /> {m.admin_ldap_sync_groups()}
        </label>
      </div>
      {#if newProvider.syncGroups && !newProvider.groupSearchBase}
        <span class="field-hint">{m.admin_ldap_sync_groups_hint()}</span>
      {/if}
      <div class="btn-row">
        <button class="btn-primary" onclick={createProvider}>{m.admin_ldap_add_provider()}</button>
        <button class="btn-secondary" onclick={testConnection} disabled={testing}>
          {testing ? m.admin_ldap_testing() : m.admin_ldap_test()}
        </button>
      </div>
    </div>
    {#if providerError}<div class="msg-error">{providerError}</div>{/if}
    {#if providerSuccess}<div class="msg-success">{providerSuccess}</div>{/if}
    {#if testResult}
      <div class={testResult.success ? 'msg-success' : 'msg-error'}>
        {testResult.success ? m.admin_ldap_test_success() : m.admin_ldap_test_failed({ error: testResult.error ?? '' })}
      </div>
    {/if}
  </div>
</section>

<style>
  .provider-card-editing {
    flex-direction: column;
    align-items: stretch !important;
  }

  .ldap-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .ldap-form-row {
    display: flex;
    gap: 10px;
  }

  .ldap-form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .ldap-label {
    font-size: 12px;
    font-weight: 500;
    color: #94a3b8;
  }

  .ldap-form input:not([type="checkbox"]) {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    width: 100%;
  }

  .ldap-form input:not([type="checkbox"]):focus {
    outline: none;
    border-color: #60a5fa;
  }

  .ldap-divider {
    border-top: 1px solid #334155;
    margin: 4px 0;
  }

  .ldap-section-label {
    font-size: 13px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .ldap-checks {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .field-hint {
    font-size: 12px;
    color: #64748b;
    margin-top: -4px;
  }
</style>

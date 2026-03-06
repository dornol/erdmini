<script lang="ts">
  import type { OIDCProviderRow } from '$lib/types/auth';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    providers: OIDCProviderRow[];
    onreload: () => Promise<void>;
  }

  let { providers, onreload }: Props = $props();

  let providerError = $state('');
  let providerSuccess = $state('');
  let newProvider = $state({
    displayName: '',
    issuerUrl: '',
    clientId: '',
    clientSecret: '',
    scopes: 'openid email profile',
    enabled: true,
    autoCreateUsers: true,
    syncGroups: false,
    groupClaim: 'groups',
    allowedGroups: '',
  });

  let editingProvider = $state<string | null>(null);
  let editForm = $state({
    displayName: '',
    issuerUrl: '',
    clientId: '',
    clientSecret: '',
    scopes: '',
    enabled: true,
    autoCreateUsers: true,
    syncGroups: false,
    groupClaim: 'groups',
    allowedGroups: '',
  });

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
      syncGroups: p.sync_groups === 1,
      groupClaim: p.group_claim || 'groups',
      allowedGroups: p.allowed_groups || '',
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
        syncGroups: editForm.syncGroups ? 1 : 0,
        groupClaim: editForm.groupClaim,
        allowedGroups: editForm.allowedGroups,
      }),
    });
    editingProvider = null;
    await onreload();
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this OIDC provider?')) return;
    await fetch(`/api/admin/oidc-providers/${id}`, { method: 'DELETE' });
    await onreload();
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
      syncGroups: false,
      groupClaim: 'groups',
      allowedGroups: '',
    };
    await onreload();
  }
</script>

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
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={editForm.syncGroups} /> {m.admin_oidc_sync_groups()}
          </label>
          {#if editForm.syncGroups}
            <input placeholder={m.admin_oidc_group_claim()} bind:value={editForm.groupClaim} />
            <input placeholder={m.admin_oidc_allowed_groups()} bind:value={editForm.allowedGroups} />
            <span class="field-hint">{m.admin_oidc_allowed_groups_hint()}</span>
          {/if}
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
            {#if provider.sync_groups}
              <span class="badge badge-on">{m.admin_oidc_sync_groups()}</span>
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
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={newProvider.syncGroups} /> {m.admin_oidc_sync_groups()}
      </label>
      {#if newProvider.syncGroups}
        <input placeholder={m.admin_oidc_group_claim()} bind:value={newProvider.groupClaim} />
        <input placeholder={m.admin_oidc_allowed_groups()} bind:value={newProvider.allowedGroups} />
        <span class="field-hint">{m.admin_oidc_allowed_groups_hint()}</span>
      {/if}
      <button class="btn-primary" onclick={createProvider}>Add Provider</button>
    </div>
    {#if providerError}<div class="msg-error">{providerError}</div>{/if}
    {#if providerSuccess}<div class="msg-success">{providerSuccess}</div>{/if}
  </div>
</section>

<style>
  .field-hint {
    font-size: 12px;
    color: #64748b;
    margin-top: -6px;
  }
</style>

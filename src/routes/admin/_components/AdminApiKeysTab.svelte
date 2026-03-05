<script lang="ts">
  import type { ApiKeyRow, ApiKeyScopeRow } from '$lib/types/auth';
  import * as m from '$lib/paraglide/messages';

  export type ApiKeyInfo = Omit<ApiKeyRow, 'key_hash'> & { user_display_name: string; username: string | null; scopes: ApiKeyScopeRow[] };

  interface Props {
    apiKeys: ApiKeyInfo[];
    onreload: () => Promise<void>;
  }

  let { apiKeys, onreload }: Props = $props();

  let apiKeyError = $state('');
  let apiKeySuccess = $state('');
  let newApiKey = $state({ name: '', expiresAt: '' });
  let newApiKeyScopes = $state<{ projectId: string; permission: 'viewer' | 'editor' }[]>([]);
  let apiKeyScopeMode = $state<'all' | 'scoped'>('all');
  let createdKey = $state<string | null>(null);
  let keyCopied = $state(false);

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
    await onreload();
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
    await onreload();
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
    await onreload();
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    keyCopied = true;
    setTimeout(() => (keyCopied = false), 2000);
  }
</script>

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

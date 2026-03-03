<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { projectStore } from '$lib/store/project.svelte';
  import type { ApiKeyScopeRow } from '$lib/types/auth';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  interface ApiKeyInfo {
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    scopes: ApiKeyScopeRow[];
  }

  let apiKeys = $state<ApiKeyInfo[]>([]);
  let loading = $state(true);
  let error = $state('');
  let success = $state('');

  // Create form
  let newName = $state('');
  let newExpires = $state('');
  let scopeMode = $state<'all' | 'scoped'>('all');
  let selectedScopes = $state<{ projectId: string; permission: 'viewer' | 'editor' }[]>([]);

  // Edit state
  let editingKeyId = $state<string | null>(null);
  let editScopes = $state<{ projectId: string; permission: 'viewer' | 'editor' }[]>([]);
  let editScopeMode = $state<'all' | 'scoped'>('all');

  // Created key reveal
  let createdKey = $state<string | null>(null);
  let keyCopied = $state(false);

  $effect(() => {
    loadKeys();
  });

  async function loadKeys() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/my/api-keys');
      if (res.ok) {
        apiKeys = await res.json();
      } else {
        const data = await res.json().catch(() => ({}));
        error = data.error || `Failed to load keys (${res.status})`;
        apiKeys = [];
      }
    } catch (e) {
      error = 'Failed to connect to server';
      apiKeys = [];
    } finally {
      loading = false;
    }
  }

  async function createKey() {
    error = '';
    success = '';
    createdKey = null;
    if (!newName.trim()) {
      error = 'Name is required';
      return;
    }

    const body: Record<string, unknown> = {
      name: newName.trim(),
      expiresAt: newExpires || undefined,
    };
    if (scopeMode === 'scoped' && selectedScopes.length > 0) {
      body.scopes = selectedScopes;
    }

    const res = await fetch('/api/my/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to create key';
      return;
    }
    const data = await res.json();
    createdKey = data.key;
    success = m.api_keys_created();
    newName = '';
    newExpires = '';
    scopeMode = 'all';
    selectedScopes = [];
    await loadKeys();
  }

  async function deleteKey(id: string, name: string) {
    if (!confirm(`Delete API key "${name}"?`)) return;
    error = '';
    const res = await fetch(`/api/my/api-keys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to delete key';
      return;
    }
    success = m.api_keys_deleted();
    await loadKeys();
    setTimeout(() => (success = ''), 2000);
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    keyCopied = true;
    setTimeout(() => (keyCopied = false), 2000);
  }

  function addScope() {
    const projects = projectStore.index.projects;
    if (projects.length === 0) return;
    // Find the first project not already in scopes
    const existing = new Set(selectedScopes.map(s => s.projectId));
    const next = projects.find(p => !existing.has(p.id));
    if (next) {
      selectedScopes = [...selectedScopes, { projectId: next.id, permission: 'viewer' }];
    }
  }

  function removeScope(idx: number) {
    selectedScopes = selectedScopes.filter((_, i) => i !== idx);
  }

  function startEdit(key: ApiKeyInfo) {
    editingKeyId = key.id;
    if (key.scopes.length > 0) {
      editScopeMode = 'scoped';
      editScopes = key.scopes.map(s => ({ projectId: s.project_id, permission: s.permission as 'viewer' | 'editor' }));
    } else {
      editScopeMode = 'all';
      editScopes = [];
    }
  }

  function cancelEdit() {
    editingKeyId = null;
    editScopes = [];
    editScopeMode = 'all';
  }

  async function saveEdit() {
    if (!editingKeyId) return;
    error = '';
    const scopes = editScopeMode === 'scoped' ? editScopes : [];
    const res = await fetch(`/api/my/api-keys/${editingKeyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopes }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error = data.error || 'Failed to update key';
      return;
    }
    editingKeyId = null;
    editScopes = [];
    editScopeMode = 'all';
    await loadKeys();
  }

  function addEditScope() {
    const projects = projectStore.index.projects;
    if (projects.length === 0) return;
    const existing = new Set(editScopes.map(s => s.projectId));
    const next = projects.find(p => !existing.has(p.id));
    if (next) {
      editScopes = [...editScopes, { projectId: next.id, permission: 'viewer' }];
    }
  }

  function removeEditScope(idx: number) {
    editScopes = editScopes.filter((_, i) => i !== idx);
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function scopeProjectNames(scopes: ApiKeyScopeRow[]): string {
    if (!scopes || scopes.length === 0) return m.api_keys_all_projects();
    const projects = projectStore.index.projects;
    return scopes.map(s => {
      const p = projects.find(pr => pr.id === s.project_id);
      return `${p?.name ?? s.project_id} (${s.permission})`;
    }).join(', ');
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="modal">
    <div class="modal-header">
      <h2>{m.api_keys_title()}</h2>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    <div class="modal-body">
      {#if createdKey}
        <div class="key-reveal">
          <p class="key-reveal-warning">{m.api_keys_copy_warning()}</p>
          <div class="key-reveal-row">
            <code class="key-value">{createdKey}</code>
            <button class="btn-sm btn-copy" onclick={copyKey}>
              {keyCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button class="btn-sm" onclick={() => (createdKey = null)}>Dismiss</button>
        </div>
      {/if}

      {#if error}<div class="msg-error">{error}</div>{/if}
      {#if success && !createdKey}<div class="msg-success">{success}</div>{/if}

      <div class="keys-list">
        {#if loading}
          <div class="loading">Loading...</div>
        {:else}
          {#each apiKeys as key}
            <div class="key-row" class:key-row-editing={editingKeyId === key.id}>
              <div class="key-info">
                <span class="key-name">{key.name}</span>
                <span class="key-detail">
                  Created: {key.created_at ? new Date(key.created_at).toLocaleDateString() : '-'}
                  {#if key.last_used_at}
                    · Last used: {new Date(key.last_used_at).toLocaleString()}
                  {/if}
                  {#if key.expires_at}
                    · Expires: <span class:expired={new Date(key.expires_at) < new Date()}>
                      {new Date(key.expires_at).toLocaleDateString()}
                    </span>
                  {/if}
                </span>
                <span class="key-scopes">{m.api_keys_scopes()}: {scopeProjectNames(key.scopes)}</span>
              </div>
              <div class="key-actions">
                <button class="btn-sm" onclick={() => startEdit(key)}>Edit</button>
                <button class="btn-sm btn-danger" onclick={() => deleteKey(key.id, key.name)}>
                  {m.action_delete()}
                </button>
              </div>
            </div>
            {#if editingKeyId === key.id}
              <div class="key-edit-section">
                <div class="scope-section">
                  <label class="radio-label">
                    <input type="radio" bind:group={editScopeMode} value="all" />
                    {m.api_keys_all_projects()}
                  </label>
                  <label class="radio-label">
                    <input type="radio" bind:group={editScopeMode} value="scoped" />
                    {m.api_keys_scopes()}
                  </label>
                </div>
                {#if editScopeMode === 'scoped'}
                  <div class="scopes-editor">
                    {#each editScopes as scope, idx}
                      <div class="scope-row">
                        <select
                          class="form-select"
                          value={scope.projectId}
                          onchange={(e) => {
                            editScopes[idx] = { ...scope, projectId: (e.target as HTMLSelectElement).value };
                            editScopes = editScopes;
                          }}
                        >
                          {#each projectStore.index.projects as p}
                            <option value={p.id}>{p.name}</option>
                          {/each}
                        </select>
                        <select
                          class="form-select perm-select"
                          value={scope.permission}
                          onchange={(e) => {
                            editScopes[idx] = { ...scope, permission: (e.target as HTMLSelectElement).value as 'viewer' | 'editor' };
                            editScopes = editScopes;
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button class="btn-sm" onclick={() => removeEditScope(idx)}>✕</button>
                      </div>
                    {/each}
                    <button class="btn-sm btn-add-scope" onclick={addEditScope}>+ Add project</button>
                  </div>
                {/if}
                <div class="key-edit-actions">
                  <button class="btn-primary" onclick={saveEdit}>Save</button>
                  <button class="btn-sm" onclick={cancelEdit}>Cancel</button>
                </div>
              </div>
            {/if}
          {/each}
          {#if apiKeys.length === 0}
            <div class="empty">{m.api_keys_no_keys()}</div>
          {/if}
        {/if}
      </div>

      <div class="create-section">
        <h3>{m.api_keys_create()}</h3>
        <div class="form-row">
          <input
            class="form-input"
            type="text"
            placeholder={m.api_keys_name()}
            bind:value={newName}
          />
          <label class="input-label">
            <span>{m.api_keys_expires()}</span>
            <input type="date" class="form-input" bind:value={newExpires} />
          </label>
        </div>

        <div class="scope-section">
          <label class="radio-label">
            <input type="radio" bind:group={scopeMode} value="all" />
            {m.api_keys_all_projects()}
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={scopeMode} value="scoped" />
            {m.api_keys_scopes()}
          </label>
        </div>

        {#if scopeMode === 'scoped'}
          <div class="scopes-editor">
            {#each selectedScopes as scope, idx}
              <div class="scope-row">
                <select
                  class="form-select"
                  value={scope.projectId}
                  onchange={(e) => {
                    selectedScopes[idx] = { ...scope, projectId: (e.target as HTMLSelectElement).value };
                    selectedScopes = selectedScopes;
                  }}
                >
                  {#each projectStore.index.projects as p}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
                <select
                  class="form-select perm-select"
                  value={scope.permission}
                  onchange={(e) => {
                    selectedScopes[idx] = { ...scope, permission: (e.target as HTMLSelectElement).value as 'viewer' | 'editor' };
                    selectedScopes = selectedScopes;
                  }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button class="btn-sm" onclick={() => removeScope(idx)}>✕</button>
              </div>
            {/each}
            <button class="btn-sm btn-add-scope" onclick={addScope}>+ Add project</button>
          </div>
        {/if}

        <button class="btn-primary" onclick={createKey}>{m.api_keys_create()}</button>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 560px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #334155;
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: #334155;
    color: #f1f5f9;
  }

  .modal-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
  }

  .key-reveal {
    background: #1a2332;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
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
    font-size: 11px;
    background: #0f172a;
    padding: 6px 10px;
    border-radius: 4px;
    color: #4ade80;
    word-break: break-all;
    flex: 1;
  }

  .keys-list {
    margin-bottom: 16px;
  }

  .key-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    margin-bottom: 6px;
  }

  .key-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .key-name {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .key-detail {
    font-size: 11px;
    color: #64748b;
  }

  .key-scopes {
    font-size: 11px;
    color: #94a3b8;
  }

  .expired {
    color: #f87171;
  }

  .loading, .empty {
    text-align: center;
    padding: 16px;
    color: #64748b;
    font-size: 13px;
  }

  .create-section {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 16px;
  }

  .create-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0 0 10px;
  }

  .form-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .form-input {
    padding: 7px 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    flex: 1;
    min-width: 120px;
  }

  .form-input:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .form-select {
    padding: 7px 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    flex: 1;
    min-width: 100px;
  }

  .form-select:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .perm-select {
    max-width: 100px;
    flex: 0;
  }

  .input-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #cbd5e1;
    white-space: nowrap;
  }

  .scope-section {
    display: flex;
    gap: 16px;
    margin-bottom: 10px;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .scopes-editor {
    margin-bottom: 10px;
  }

  .scope-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }

  .btn-add-scope {
    font-size: 12px;
    color: #60a5fa;
    margin-bottom: 8px;
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

  .btn-copy {
    background: #22c55e;
    color: white;
    white-space: nowrap;
  }

  .btn-copy:hover {
    background: #16a34a;
  }

  .btn-danger {
    color: #f87171;
  }

  .btn-danger:hover {
    background: rgba(248, 113, 113, 0.15);
  }

  .msg-error {
    margin-bottom: 8px;
    font-size: 13px;
    color: #f87171;
  }

  .msg-success {
    margin-bottom: 8px;
    font-size: 13px;
    color: #4ade80;
  }

  .key-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .key-row-editing {
    border-radius: 6px 6px 0 0;
    margin-bottom: 0;
  }

  .key-edit-section {
    background: #0f172a;
    border: 1px solid #334155;
    border-top: none;
    border-radius: 0 0 6px 6px;
    padding: 12px;
    margin-top: -7px;
    margin-bottom: 6px;
  }

  .key-edit-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
</style>

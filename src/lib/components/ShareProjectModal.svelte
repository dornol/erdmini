<script lang="ts">
  import type { ProjectPermission, ProjectPermissionLevel } from '$lib/types/auth';
  import * as m from '$lib/paraglide/messages';

  interface GroupPermission {
    id: string;
    groupId: string;
    projectId: string;
    permission: string;
    groupName: string;
    memberCount: number;
  }

  interface Props {
    projectId: string;
    isOwner: boolean;
    onclose: () => void;
  }

  let { projectId, isOwner, onclose }: Props = $props();

  let permissions = $state<ProjectPermission[]>([]);
  let groupPermissions = $state<GroupPermission[]>([]);
  let loading = $state(true);

  // User search
  let searchQuery = $state('');
  let searchResults = $state<{ id: string; username: string | null; displayName: string; email: string | null }[]>([]);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let newPermission = $state<ProjectPermissionLevel>('viewer');

  // Group search
  let groupSearchQuery = $state('');
  let groupSearchResults = $state<{ id: string; name: string; description: string | null; member_count: number }[]>([]);
  let groupSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let newGroupPermission = $state<ProjectPermissionLevel>('viewer');

  let ownerCount = $derived(permissions.filter(p => p.permission === 'owner').length);
  let error = $state('');
  let success = $state('');

  $effect(() => {
    loadPermissions();
  });

  async function loadPermissions() {
    loading = true;
    try {
      const res = await fetch(`/api/storage/projects/${projectId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        permissions = data.permissions ?? data;
        groupPermissions = data.groupPermissions ?? [];
      }
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    clearTimeout(searchTimer);
    const q = searchQuery.trim();
    if (q.length < 1) { searchResults = []; return; }
    searchTimer = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) searchResults = await res.json();
    }, 300);
  }

  function handleGroupSearch() {
    clearTimeout(groupSearchTimer);
    const q = groupSearchQuery.trim();
    if (q.length < 1) { groupSearchResults = []; return; }
    groupSearchTimer = setTimeout(async () => {
      const res = await fetch(`/api/groups/search?q=${encodeURIComponent(q)}`);
      if (res.ok) groupSearchResults = await res.json();
    }, 300);
  }

  async function addShare(userId: string) {
    error = ''; success = '';
    const res = await fetch(`/api/storage/projects/${projectId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permission: newPermission }),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to share';
      return;
    }
    success = 'Shared successfully';
    searchQuery = ''; searchResults = [];
    await loadPermissions();
    setTimeout(() => (success = ''), 2000);
  }

  async function addGroupShare(groupId: string) {
    error = ''; success = '';
    const res = await fetch(`/api/storage/projects/${projectId}/permissions/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, permission: newGroupPermission }),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to share with group';
      return;
    }
    success = 'Group shared successfully';
    groupSearchQuery = ''; groupSearchResults = [];
    await loadPermissions();
    setTimeout(() => (success = ''), 2000);
  }

  async function updatePermission(userId: string, permission: ProjectPermissionLevel) {
    error = '';
    await fetch(`/api/storage/projects/${projectId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permission }),
    });
    await loadPermissions();
  }

  async function updateGroupPermission(groupId: string, permission: ProjectPermissionLevel) {
    error = '';
    await fetch(`/api/storage/projects/${projectId}/permissions/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, permission }),
    });
    await loadPermissions();
  }

  async function removeShare(userId: string) {
    error = '';
    await fetch(`/api/storage/projects/${projectId}/permissions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    await loadPermissions();
  }

  async function removeGroupShare(groupId: string) {
    error = '';
    await fetch(`/api/storage/projects/${projectId}/permissions/groups`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    });
    await loadPermissions();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="modal">
    <div class="modal-header">
      <h2>Share Project</h2>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    {#if isOwner}
      <div class="search-section">
        <div class="search-row">
          <input
            class="search-input"
            type="text"
            placeholder="Search users by name or email..."
            bind:value={searchQuery}
            oninput={handleSearch}
          />
          <select class="perm-select" bind:value={newPermission}>
            <option value="owner">Owner</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        {#if searchResults.length > 0}
          <div class="search-results">
            {#each searchResults as user}
              <button class="search-result-item" onclick={() => addShare(user.id)}>
                <span class="result-name">{user.displayName}</span>
                <span class="result-detail">{user.username ?? ''} {user.email ? `· ${user.email}` : ''}</span>
                <span class="result-add">+ Add</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if error}<div class="msg-error">{error}</div>{/if}
    {#if success}<div class="msg-success">{success}</div>{/if}

    <div class="permissions-list">
      {#if loading}
        <div class="loading">Loading...</div>
      {:else}
        {#each permissions as perm}
          <div class="perm-row">
            <div class="perm-user">
              <span class="perm-name">{perm.displayName}</span>
              <span class="perm-detail">{perm.username ?? ''} {perm.email ? `· ${perm.email}` : ''}</span>
            </div>
            {#if perm.permission === 'owner' && ownerCount <= 1}
              <span class="perm-badge owner">Owner</span>
            {:else if isOwner}
              <select
                class="perm-select-sm"
                value={perm.permission}
                onchange={(e) => updatePermission(perm.userId, (e.target as HTMLSelectElement).value as ProjectPermissionLevel)}
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button class="remove-btn" onclick={() => removeShare(perm.userId)} title="Remove">✕</button>
            {:else}
              <span class="perm-badge">{perm.permission}</span>
            {/if}
          </div>
        {/each}

        <!-- Group permissions -->
        {#if groupPermissions.length > 0 || isOwner}
          <div class="group-section-divider">{m.share_group_section()}</div>
        {/if}

        {#if isOwner}
          <div class="group-search-row">
            <input
              class="search-input"
              type="text"
              placeholder={m.share_group_search()}
              bind:value={groupSearchQuery}
              oninput={handleGroupSearch}
            />
            <select class="perm-select" bind:value={newGroupPermission}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          {#if groupSearchResults.length > 0}
            <div class="search-results">
              {#each groupSearchResults as group}
                <button class="search-result-item" onclick={() => addGroupShare(group.id)}>
                  <span class="result-name">{group.name}</span>
                  <span class="result-detail">{m.admin_groups_member_count({ count: group.member_count })}</span>
                  <span class="result-add">+ Add</span>
                </button>
              {/each}
            </div>
          {/if}
        {/if}

        {#each groupPermissions as gp}
          <div class="perm-row">
            <div class="perm-user">
              <span class="perm-name">{gp.groupName}</span>
              <span class="perm-detail">{m.admin_groups_member_count({ count: gp.memberCount })}</span>
            </div>
            {#if isOwner}
              <select
                class="perm-select-sm"
                value={gp.permission}
                onchange={(e) => updateGroupPermission(gp.groupId, (e.target as HTMLSelectElement).value as ProjectPermissionLevel)}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button class="remove-btn" onclick={() => removeGroupShare(gp.groupId)} title="Remove">✕</button>
            {:else}
              <span class="perm-badge">{gp.permission}</span>
            {/if}
          </div>
        {/each}

        {#if permissions.length === 0 && groupPermissions.length === 0}
          <div class="empty">No permissions found</div>
        {/if}
      {/if}
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
    width: 480px;
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
    color: #f1f5f9;
    background: #334155;
  }

  .search-section {
    padding: 16px 20px;
    border-bottom: 1px solid #334155;
  }

  .search-row {
    display: flex;
    gap: 8px;
  }

  .search-input {
    flex: 1;
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .search-input:focus {
    outline: none;
    border-color: #60a5fa;
  }

  .perm-select {
    padding: 8px 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .search-results {
    margin-top: 8px;
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
    max-height: 160px;
    overflow-y: auto;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: #0f172a;
    border: none;
    border-bottom: 1px solid #1e293b;
    color: #f1f5f9;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover {
    background: #1e293b;
  }

  .result-name {
    font-weight: 500;
  }

  .result-detail {
    color: #64748b;
    font-size: 12px;
    flex: 1;
  }

  .result-add {
    color: #60a5fa;
    font-size: 12px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .permissions-list {
    padding: 12px 20px;
    overflow-y: auto;
    flex: 1;
  }

  .perm-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #1e293b;
  }

  .perm-row:last-child {
    border-bottom: none;
  }

  .perm-user {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .perm-name {
    font-size: 13px;
    font-weight: 500;
    color: #f1f5f9;
  }

  .perm-detail {
    font-size: 11px;
    color: #64748b;
  }

  .perm-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #334155;
    color: #94a3b8;
  }

  .perm-badge.owner {
    background: #1e3a5f;
    color: #60a5fa;
  }

  .perm-select-sm {
    padding: 4px 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 12px;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #f87171;
    cursor: pointer;
    padding: 4px 6px;
    font-size: 12px;
    border-radius: 4px;
  }

  .remove-btn:hover {
    background: rgba(248, 113, 113, 0.15);
  }

  .loading, .empty {
    text-align: center;
    color: #64748b;
    font-size: 13px;
    padding: 20px;
  }

  .msg-error {
    padding: 8px 20px;
    font-size: 13px;
    color: #f87171;
  }

  .msg-success {
    padding: 8px 20px;
    font-size: 13px;
    color: #4ade80;
  }

  .group-section-divider {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    padding: 12px 0 6px;
    border-top: 1px solid #334155;
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-search-row {
    display: flex;
    gap: 8px;
    padding: 6px 0 8px;
  }
</style>

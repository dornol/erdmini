<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { dialogStore } from '$lib/store/dialog.svelte';

  interface GroupInfo {
    id: string;
    name: string;
    description: string | null;
    created_by: string;
    source: string;
    source_provider_id: string | null;
    created_at: string;
    creator_name: string | null;
    member_count: number;
  }

  interface GroupMember {
    id: string;
    username: string | null;
    display_name: string;
    email: string | null;
  }

  interface Props {
    groups: GroupInfo[];
    onreload: () => Promise<void>;
  }

  let { groups, onreload }: Props = $props();

  let error = $state('');
  let success = $state('');
  let newGroup = $state({ name: '', description: '' });

  // Expanded group for member management
  let expandedGroupId = $state<string | null>(null);
  let members = $state<GroupMember[]>([]);
  let memberSearchQuery = $state('');
  let memberSearchResults = $state<{ id: string; username: string | null; display_name: string; email: string | null }[]>([]);
  let memberSearchTimer: ReturnType<typeof setTimeout> | undefined;

  // Edit state
  let editingGroupId = $state<string | null>(null);
  let editForm = $state({ name: '', description: '' });

  async function createGroup() {
    error = '';
    success = '';
    if (!newGroup.name.trim()) { error = m.admin_groups_name_required(); return; }
    const res = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGroup),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed';
      return;
    }
    success = `Group "${newGroup.name}" created`;
    newGroup = { name: '', description: '' };
    await onreload();
    setTimeout(() => (success = ''), 2000);
  }

  async function deleteGroup(group: GroupInfo) {
    const msg = group.source !== 'manual'
      ? m.admin_groups_delete_synced_warn({ name: group.name })
      : m.admin_groups_delete_confirm({ name: group.name });
    const ok = await dialogStore.confirm(msg, { variant: 'danger' }); if (!ok) return;
    error = '';
    const res = await fetch(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to delete';
      return;
    }
    if (expandedGroupId === group.id) expandedGroupId = null;
    await onreload();
  }

  function startEdit(group: GroupInfo) {
    editingGroupId = group.id;
    editForm = { name: group.name, description: group.description ?? '' };
  }

  async function saveEdit() {
    if (!editingGroupId) return;
    error = '';
    const res = await fetch(`/api/admin/groups/${editingGroupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to update';
      return;
    }
    editingGroupId = null;
    await onreload();
  }

  async function toggleExpand(groupId: string) {
    if (expandedGroupId === groupId) {
      expandedGroupId = null;
      return;
    }
    expandedGroupId = groupId;
    await loadMembers(groupId);
  }

  async function loadMembers(groupId: string) {
    const res = await fetch(`/api/admin/groups/${groupId}/members`);
    if (res.ok) members = await res.json();
  }

  function handleMemberSearch() {
    clearTimeout(memberSearchTimer);
    const q = memberSearchQuery.trim();
    if (q.length < 1) { memberSearchResults = []; return; }
    memberSearchTimer = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) memberSearchResults = await res.json();
    }, 300);
  }

  async function addMember(userId: string) {
    if (!expandedGroupId) return;
    error = '';
    const res = await fetch(`/api/admin/groups/${expandedGroupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to add member';
      return;
    }
    memberSearchQuery = '';
    memberSearchResults = [];
    await loadMembers(expandedGroupId);
    await onreload();
  }

  async function removeMember(userId: string) {
    if (!expandedGroupId) return;
    error = '';
    const res = await fetch(`/api/admin/groups/${expandedGroupId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed to remove member';
      return;
    }
    await loadMembers(expandedGroupId);
    await onreload();
  }
</script>

<section class="section">
  <h2>{m.admin_groups_title()}</h2>

  {#if groups.length === 0}
    <div class="empty-msg">{m.admin_groups_no_groups()}</div>
  {:else}
    <table class="data-table">
      <thead>
        <tr>
          <th>{m.admin_groups_name()}</th>
          <th>{m.admin_groups_description()}</th>
          <th>{m.admin_groups_source()}</th>
          <th>{m.admin_groups_members()}</th>
          <th>{m.admin_groups_created_by()}</th>
          <th>{m.admin_groups_created_at()}</th>
          <th>{m.admin_groups_actions()}</th>
        </tr>
      </thead>
      <tbody>
        {#each groups as group}
          {#if editingGroupId === group.id}
            <tr>
              <td><input class="inline-input" bind:value={editForm.name} /></td>
              <td><input class="inline-input" bind:value={editForm.description} /></td>
              <td><span class="source-badge source-{group.source ?? 'manual'}">{group.source ?? 'manual'}</span></td>
              <td>{group.member_count}</td>
              <td>{group.creator_name ?? '-'}</td>
              <td>{group.created_at ? new Date(group.created_at).toLocaleDateString() : '-'}</td>
              <td>
                <div class="btn-row">
                  <button class="btn-sm btn-save" onclick={saveEdit}>{m.action_save()}</button>
                  <button class="btn-sm" onclick={() => (editingGroupId = null)}>{m.action_cancel()}</button>
                </div>
              </td>
            </tr>
          {:else}
            <tr class="clickable-row" onclick={() => toggleExpand(group.id)}>
              <td><strong>{group.name}</strong></td>
              <td>{group.description ?? '-'}</td>
              <td><span class="source-badge source-{group.source ?? 'manual'}">{group.source ?? 'manual'}</span></td>
              <td>{m.admin_groups_member_count({ count: group.member_count })}</td>
              <td>{group.creator_name ?? '-'}</td>
              <td>{group.created_at ? new Date(group.created_at).toLocaleDateString() : '-'}</td>
              <td>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="btn-row" role="toolbar" tabindex="-1" onclick={(e) => e.stopPropagation()}>
                  <button class="btn-sm" onclick={() => startEdit(group)}>{m.action_edit()}</button>
                  <button class="btn-sm btn-danger" onclick={() => deleteGroup(group)}>{m.action_delete()}</button>
                </div>
              </td>
            </tr>
          {/if}
          {#if expandedGroupId === group.id}
            <tr>
              <td colspan="7">
                <div class="member-panel">
                  <h4>{m.admin_groups_members()}</h4>
                  <div class="member-search-row">
                    <input
                      class="inline-input"
                      type="text"
                      placeholder={m.admin_groups_search_users()}
                      bind:value={memberSearchQuery}
                      oninput={handleMemberSearch}
                      onclick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {#if memberSearchResults.length > 0}
                    <div class="search-dropdown">
                      {#each memberSearchResults as user}
                        <button class="search-item" onclick={() => addMember(user.id)}>
                          <span class="member-name">{user.display_name}</span>
                          <span class="member-username">{user.username ?? ''} {user.email ? `· ${user.email}` : ''}</span>
                          <span class="add-label">+ Add</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                  <div class="member-list">
                    {#each members as member}
                      <div class="member-row">
                        <span class="member-name">{member.display_name}</span>
                        <span class="member-username">{member.username ?? ''} {member.email ? `· ${member.email}` : ''}</span>
                        <button class="btn-sm btn-danger" onclick={() => removeMember(member.id)}>{m.admin_groups_remove_member()}</button>
                      </div>
                    {/each}
                    {#if members.length === 0}
                      <div class="empty-msg" style="padding: 12px 0">{m.admin_groups_no_members()}</div>
                    {/if}
                  </div>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}

  <div class="form-section">
    <h3>{m.admin_groups_create()}</h3>
    <div class="form-grid">
      <input placeholder={m.admin_groups_name()} bind:value={newGroup.name} />
      <input placeholder={m.admin_groups_description()} bind:value={newGroup.description} />
      <button class="btn-primary" onclick={createGroup}>{m.admin_groups_create()}</button>
    </div>
    {#if error}<div class="msg-error">{error}</div>{/if}
    {#if success}<div class="msg-success">{success}</div>{/if}
  </div>
</section>

<style>
  .member-panel {
    padding: 12px 16px;
    background: var(--app-card-bg);
    border: 1px solid var(--app-border);
    border-radius: 6px;
  }

  .member-panel h4 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--app-text-secondary);
  }

  .member-search-row {
    margin-bottom: 8px;
  }

  .member-search-row input {
    width: 300px;
  }

  .search-dropdown {
    border: 1px solid var(--app-border);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 8px;
    max-height: 160px;
    overflow-y: auto;
  }

  .search-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: var(--app-input-bg);
    border: none;
    border-bottom: 1px solid var(--app-border);
    color: var(--app-text);
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }

  .search-item:last-child { border-bottom: none; }
  .search-item:hover { background: var(--app-hover-bg); }

  .add-label {
    color: var(--app-accent);
    font-size: 12px;
    font-weight: 500;
    margin-left: auto;
  }

  .source-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .source-manual {
    background: var(--app-badge-bg);
    color: var(--app-text-muted);
  }

  .source-oidc {
    background: var(--app-active-bg);
    color: var(--app-accent);
  }

  .source-ldap {
    background: rgba(34, 197, 94, 0.15);
    color: var(--app-success);
  }
</style>

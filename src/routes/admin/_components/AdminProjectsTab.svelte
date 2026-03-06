<script lang="ts">
  import { onMount } from 'svelte';
  import type { UserInfo } from './AdminUsersTab.svelte';
  import * as m from '$lib/paraglide/messages';

  type ProjectInfo = {
    id: string;
    name: string;
    updatedAt: string;
    ownerId: string | null;
    ownerName: string | null;
    memberCount: number;
  };
  type ProjectMember = {
    id: string;
    user_id: string;
    permission: string;
    created_at: string;
    display_name: string;
    username: string | null;
    email: string | null;
  };

  interface Props {
    users: UserInfo[];
  }

  let { users }: Props = $props();

  let projects = $state<ProjectInfo[]>([]);
  let expandedProject = $state<string | null>(null);
  let projectMembers = $state<ProjectMember[]>([]);
  let projectError = $state('');
  let projectSuccess = $state('');
  let transferUserId = $state('');

  onMount(() => {
    loadProjects();
  });

  async function loadProjects() {
    projectError = '';
    const res = await fetch('/api/admin/projects');
    if (res.ok) projects = await res.json();
  }

  async function toggleProjectMembers(projectId: string) {
    if (expandedProject === projectId) {
      expandedProject = null;
      return;
    }
    expandedProject = projectId;
    transferUserId = '';
    const res = await fetch(`/api/admin/projects/${projectId}`);
    if (res.ok) projectMembers = await res.json();
  }

  async function transferOwnership(projectId: string, projectName: string) {
    if (!transferUserId) return;
    const targetUser = users.find(u => u.id === transferUserId);
    if (!confirm(m.admin_projects_transfer_confirm({ name: projectName, user: targetUser?.display_name ?? transferUserId }))) return;
    projectError = '';
    const res = await fetch(`/api/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'transfer', newOwnerId: transferUserId }),
    });
    if (!res.ok) {
      const data = await res.json();
      projectError = data.error || 'Failed to transfer';
      return;
    }
    projectSuccess = m.admin_projects_transferred();
    transferUserId = '';
    expandedProject = null;
    await loadProjects();
  }

  async function deleteProject(projectId: string, projectName: string) {
    const input = prompt(m.admin_projects_delete_confirm({ name: projectName }));
    if (input !== projectName) return;
    projectError = '';
    const res = await fetch(`/api/admin/projects/${projectId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      projectError = data.error || 'Failed to delete project';
      return;
    }
    projectSuccess = m.admin_projects_deleted_msg({ name: projectName });
    expandedProject = null;
    await loadProjects();
  }
</script>

<section class="section">
  <h2>{m.admin_projects_title()}</h2>
  {#if projectError}<div class="msg-error">{projectError}</div>{/if}
  {#if projectSuccess}<div class="msg-success">{projectSuccess}</div>{/if}

  {#if projects.length === 0}
    <p class="section-desc">{m.admin_projects_no_projects()}</p>
  {:else}
    <table class="data-table">
      <thead>
        <tr>
          <th>{m.admin_projects_name()}</th>
          <th>{m.admin_projects_owner()}</th>
          <th>{m.admin_projects_members()}</th>
          <th>{m.admin_projects_updated()}</th>
          <th>{m.admin_projects_actions()}</th>
        </tr>
      </thead>
      <tbody>
        {#each projects as project}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <tr class="clickable-row" onclick={() => toggleProjectMembers(project.id)}>
            <td>
              <span class="project-name">{project.name}</span>
              <span class="project-id">{project.id.slice(0, 8)}…</span>
            </td>
            <td>{project.ownerName ?? '-'}</td>
            <td>{project.memberCount}</td>
            <td>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '-'}</td>
            <td>
              <div class="btn-row" onclick={(e) => e.stopPropagation()}>
                <button class="btn-sm btn-danger" onclick={() => deleteProject(project.id, project.name)}>{m.admin_projects_delete()}</button>
              </div>
            </td>
          </tr>
          {#if expandedProject === project.id}
            <tr>
              <td colspan="5">
                <div class="project-detail">
                  <h4>{m.admin_projects_members()}</h4>
                  {#if projectMembers.length > 0}
                    <div class="member-list">
                      {#each projectMembers as member}
                        <div class="member-row">
                          <span class="member-name">{member.display_name}</span>
                          {#if member.username}<span class="member-username">({member.username})</span>{/if}
                          <span class="badge" class:badge-admin={member.permission === 'owner'}>{member.permission}</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="section-desc">{m.admin_projects_no_members()}</p>
                  {/if}

                  <div class="transfer-section">
                    <h4>{m.admin_projects_transfer()}</h4>
                    <div class="form-grid">
                      <select class="inline-select" bind:value={transferUserId}>
                        <option value="">{m.select_placeholder()}</option>
                        {#each users.filter(u => u.status === 'active' && u.id !== project.ownerId) as u}
                          <option value={u.id}>{u.display_name} {u.username ? `(${u.username})` : ''}</option>
                        {/each}
                      </select>
                      <button class="btn-sm btn-save" disabled={!transferUserId} onclick={() => transferOwnership(project.id, project.name)}>{m.admin_projects_transfer()}</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</section>

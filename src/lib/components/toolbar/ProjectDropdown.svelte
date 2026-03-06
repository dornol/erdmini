<script lang="ts">
  import { projectStore } from '$lib/store/project.svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { open, ontoggle, onclose }: Props = $props();

  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let newProjectName = $state('');
  let showNewProjectInput = $state(false);

  interface SharedProject {
    projectId: string;
    permission: string;
    ownerName: string;
    projectName: string;
    sharedAt: string;
  }
  let sharedProjects = $state<SharedProject[]>([]);
  let sharedLoading = $state(false);

  function startRename(id: string, currentName: string) {
    renamingId = id;
    renameValue = currentName;
  }

  async function finishRename() {
    if (renamingId && renameValue.trim()) {
      await projectStore.renameProject(renamingId, renameValue.trim());
    }
    renamingId = null;
    renameValue = '';
  }

  async function handleDeleteProject(id: string, name: string) {
    if (projectStore.index.projects.length <= 1) return;
    const ok = await dialogStore.confirm(m.project_delete_confirm({ name }), {
      title: m.project_delete_title(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) await projectStore.deleteProject(id);
  }

  async function handleNewProject() {
    const name = newProjectName.trim() || m.project_default_name();
    await projectStore.createProject(name);
    newProjectName = '';
    showNewProjectInput = false;
    onclose();
  }

  export async function loadSharedProjects() {
    if (!authStore.isLoggedIn) return;
    sharedLoading = true;
    try {
      const res = await fetch('/api/storage/shared');
      if (res.ok) sharedProjects = await res.json();
    } finally {
      sharedLoading = false;
    }
  }

  async function openSharedProject(proj: SharedProject) {
    try {
      const res = await fetch(`/api/storage/schemas/${proj.projectId}`);
      if (!res.ok) return;
      const schema = await res.json();
      await projectStore.loadSharedProject(proj.projectId, proj.projectName, schema);
      onclose();
    } catch { /* ignore */ }
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  }

  function getProjectTableCount(projId: string): number {
    if (projId === projectStore.index.activeProjectId) {
      return erdStore.schema.tables.length;
    }
    try {
      const raw = window.localStorage.getItem(`erdmini_schema_${projId}`);
      if (raw) {
        const schema = JSON.parse(raw);
        return schema.tables?.length ?? 0;
      }
    } catch { /* ignore */ }
    return 0;
  }
</script>

<div class="dropdown-wrap project-wrap">
  <button
    class="btn-project"
    onclick={() => { const wasOpen = open; ontoggle(); if (!wasOpen) loadSharedProjects(); }}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    <span class="project-name">{projectStore.activeProject?.name ?? 'Project'}</span>
    <span class="project-chevron">▾</span>
  </button>
  {#if open}
    <div
      class="dropdown-menu project-dropdown"
      role="menu"
      tabindex="-1"
      onmouseleave={() => { if (!renamingId && !showNewProjectInput) onclose(); }}
    >
      {#each projectStore.index.projects as proj (proj.id)}
        <div
          class="project-item"
          class:active={proj.id === projectStore.index.activeProjectId}
        >
          {#if renamingId === proj.id}
            <input
              class="project-rename-input"
              type="text"
              bind:value={renameValue}
              onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { renamingId = null; } }}
              onblur={finishRename}
              autofocus
            />
          {:else}
            <button
              class="project-item-name"
              onclick={async () => { await projectStore.switchProject(proj.id); onclose(); }}
            >
              <span class="project-item-label">{proj.name}</span>
              <span class="project-item-meta">{formatDate(proj.updatedAt)} · {getProjectTableCount(proj.id)} tables · <span class="id-copy-btn" role="button" tabindex="-1" title="Copy project ID" onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(proj.id); }} onkeydown={() => {}}>{proj.id}</span></span>
            </button>
            <div class="project-item-actions">
              <button
                class="project-action-btn"
                title={m.project_rename()}
                onclick={(e) => { e.stopPropagation(); startRename(proj.id, proj.name); }}
              >✎</button>
              <button
                class="project-action-btn"
                title={m.project_duplicate()}
                onclick={async (e) => { e.stopPropagation(); await projectStore.duplicateProject(proj.id); onclose(); }}
              >⧉</button>
              {#if projectStore.index.projects.length > 1}
                <button
                  class="project-action-btn project-action-delete"
                  title={m.project_delete()}
                  onclick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id, proj.name); }}
                >✕</button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
      {#if authStore.isLoggedIn}
        <div class="project-divider"></div>
        <div class="project-shared-header">
          <span>Shared with me</span>
          <button class="project-action-btn" title="Refresh" onclick={loadSharedProjects}>↻</button>
        </div>
        {#if sharedLoading}
          <div class="project-shared-loading">Loading...</div>
        {:else if sharedProjects.length === 0}
          <div class="project-shared-empty">No shared projects</div>
        {:else}
          {#each sharedProjects as sp}
            <button
              class="project-item-name shared-project-item"
              onclick={() => openSharedProject(sp)}
            >
              <span class="project-item-label">{sp.projectName}</span>
              <span class="project-item-meta">{sp.ownerName} · {sp.permission}</span>
            </button>
          {/each}
        {/if}
      {/if}
      <div class="project-divider"></div>
      {#if showNewProjectInput}
        <div class="project-new-row">
          <input
            class="project-rename-input"
            type="text"
            placeholder={m.project_new_placeholder()}
            bind:value={newProjectName}
            onkeydown={(e) => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') { showNewProjectInput = false; newProjectName = ''; } }}
            autofocus
          />
          <button
            class="project-new-confirm"
            onclick={handleNewProject}
            title="Create"
          >✓</button>
        </div>
      {:else}
        <button
          class="dropdown-item project-new-btn"
          role="menuitem"
          onclick={() => (showNewProjectInput = true)}
        >
          {m.project_new()}
        </button>
      {/if}
    </div>
  {/if}
</div>

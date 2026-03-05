<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';
  import { themeStore, type ThemeId } from '$lib/store/theme.svelte';

  import { schemaToShareString, buildShareUrl } from '$lib/utils/url-share';
  import { exportSvg } from '$lib/utils/svg-export';
  import { exportPdf } from '$lib/utils/pdf-export';
  import { lintSchema } from '$lib/utils/schema-lint';
  import { sanitizeFilename, now } from '$lib/utils/common';
  import DdlModal from './DdlModal.svelte';
  import DomainModal from './DomainModal.svelte';
  import LintPanel from './LintPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import SchemaDiffModal from './SchemaDiffModal.svelte';
  import SnapshotPanel from './SnapshotPanel.svelte';
  import ShareProjectModal from './ShareProjectModal.svelte';
  import ApiKeysModal from './ApiKeysModal.svelte';
  import EmbedModal from './EmbedModal.svelte';
  import * as m from '$lib/paraglide/messages';
  import { authStore } from '$lib/store/auth.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import CollabIndicator from './CollabIndicator.svelte';
  import { collabStore } from '$lib/store/collab.svelte';

  let { onfullscreen }: { onfullscreen?: () => void } = $props();

  let viewportWidth = $state(800);
  let viewportHeight = $state(600);

  $effect(() => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;

    function onResize() {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function addTable() {
    erdStore.addTable(viewportWidth, viewportHeight);
  }

  function addMemo() {
    erdStore.addMemo(viewportWidth, viewportHeight);
  }

  let modalMode = $state<'import' | 'export' | null>(null);
  let showDomainModal = $state(false);
  let showLintPanel = $state(false);

  let lintIssueCount = $derived(lintSchema(erdStore.schema).length);

  // Dropdown state — only one open at a time
  type DropdownId = 'project' | 'import' | 'export' | 'tools' | 'settings' | 'shortcuts' | 'userMenu';
  let activeDropdown = $state<DropdownId | null>(null);
  function toggleDropdown(id: DropdownId) { activeDropdown = activeDropdown === id ? null : id; }
  function closeDropdown() { activeDropdown = null; }
  let projectOpen = $derived(activeDropdown === 'project');
  let importOpen = $derived(activeDropdown === 'import');
  let exportOpen = $derived(activeDropdown === 'export');
  let toolsOpen = $derived(activeDropdown === 'tools');
  let settingsOpen = $derived(activeDropdown === 'settings');
  let shortcutsOpen = $derived(activeDropdown === 'shortcuts');
  let userMenuOpen = $derived(activeDropdown === 'userMenu');
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let newProjectName = $state('');
  let showNewProjectInput = $state(false);

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
    closeDropdown();
  }


  // JSON export
  function exportJson() {
    const json = JSON.stringify(erdStore.schema, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'schema')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // JSON import
  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const schema = JSON.parse(reader.result as string);
          if (!schema.tables) schema.tables = [];
          if (!schema.domains) schema.domains = [];

          // If current schema is empty, just load directly
          if (erdStore.schema.tables.length === 0) {
            erdStore.loadSchema(schema);
            return;
          }

          // Ask merge or replace
          const mode = await dialogStore.choice(
            m.import_merge_or_replace_message(),
            {
              title: m.import_merge_or_replace_title(),
              choices: [
                { key: 'merge', label: m.import_merge(), variant: 'primary' },
                { key: 'replace', label: m.import_replace(), variant: 'danger' },
              ],
            },
          );
          if (mode === null) return; // cancelled

          if (mode === 'replace') {
            erdStore.loadSchema(schema);
            return;
          }

          // --- Merge mode ---
          const nameToExistingId = new Map<string, string>();
          for (const t of erdStore.schema.tables) {
            nameToExistingId.set(t.name, t.id);
          }

          const duplicateNames = schema.tables
            .filter((t: { name: string }) => nameToExistingId.has(t.name))
            .map((t: { name: string }) => t.name);

          let action: string | null = null;
          if (duplicateNames.length > 0) {
            action = await dialogStore.choice(
              m.import_duplicate_message({ count: duplicateNames.length, names: duplicateNames.join(', ') }),
              {
                title: m.import_duplicate_title(),
                choices: [
                  { key: 'overwrite', label: m.import_overwrite(), variant: 'danger' },
                  { key: 'skip', label: m.import_skip(), variant: 'default' },
                ],
              },
            );
            if (action === null) return; // cancelled
          }

          const duplicateSet = new Set(duplicateNames);
          const nameToNewId = new Map<string, string>();
          for (const t of schema.tables) {
            nameToNewId.set(t.name, t.id);
          }

          if (action === 'overwrite') {
            const oldIdsToRemove = new Set(
              duplicateNames.map((n: string) => nameToExistingId.get(n)!),
            );
            const oldToNewId = new Map<string, string>();
            for (const name of duplicateNames) {
              oldToNewId.set(nameToExistingId.get(name)!, nameToNewId.get(name)!);
            }

            erdStore.schema.tables = erdStore.schema.tables
              .filter((t) => !oldIdsToRemove.has(t.id))
              .map((t) => ({
                ...t,
                foreignKeys: t.foreignKeys.map((fk) =>
                  oldToNewId.has(fk.referencedTableId)
                    ? { ...fk, referencedTableId: oldToNewId.get(fk.referencedTableId)! }
                    : fk,
                ),
              }));

            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          } else if (action === 'skip') {
            for (const t of schema.tables) {
              if (duplicateSet.has(t.name)) continue;
              t.foreignKeys = (t.foreignKeys ?? []).map((fk: { referencedTableId: string }) => {
                for (const [name, newId] of nameToNewId) {
                  if (fk.referencedTableId === newId && duplicateSet.has(name)) {
                    return { ...fk, referencedTableId: nameToExistingId.get(name)! };
                  }
                }
                return fk;
              });
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          } else {
            // No duplicates — add all new tables
            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          }

          // Merge domains by name
          const existingDomainNames = new Set(erdStore.schema.domains.map((d) => d.name));
          if (action === 'overwrite') {
            const newDomainMap = new Map((schema.domains as import('$lib/types/erd').ColumnDomain[]).map((d) => [d.name, d]));
            erdStore.schema.domains = erdStore.schema.domains.map((d) =>
              newDomainMap.has(d.name) ? newDomainMap.get(d.name)! : d,
            );
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          } else {
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          }

          erdStore.schema.updatedAt = now();
        } catch {
          dialogStore.alert(m.json_parse_error(), {
            title: m.json_import_failed(),
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Full backup export
  async function exportBackup() {
    const json = await projectStore.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Full backup import
  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = await projectStore.importAll(reader.result as string);
        if (result.ok) {
          dialogStore.alert(m.backup_restore_success());
        } else {
          dialogStore.alert(result.error ?? '', { title: m.backup_restore_failed() });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // SVG export
  function exportSvgFile() {
    const svg = exportSvg(erdStore.schema, themeStore.current, canvasState.lineType);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF export
  async function exportPdfFile() {
    if (erdStore.schema.tables.length === 0) return;
    await exportPdf(
      erdStore.schema,
      themeStore.current,
      `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}`,
    );
  }

  // Share
  let shareStatus = $state<'idle' | 'copied'>('idle');

  function copyToClipboardFallback(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }

  async function shareLink() {
    try {
      const encoded = await schemaToShareString(erdStore.schema, projectStore.activeProject?.name ?? 'Untitled');
      const url = buildShareUrl(encoded);
      let copied = false;
      // Try clipboard API first (requires secure context: HTTPS or localhost)
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch { /* non-secure context */ }
      }
      // Fallback: execCommand('copy') via hidden textarea
      if (!copied) {
        copied = copyToClipboardFallback(url);
      }
      if (copied) {
        shareStatus = 'copied';
        setTimeout(() => (shareStatus = 'idle'), 2000);
      } else {
        dialogStore.alert(m.share_copy_failed());
      }
    } catch {
      dialogStore.alert(m.share_copy_failed());
    }
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

  let showChangePassword = $state(false);
  let showApiKeysModal = $state(false);
  let cpCurrent = $state('');
  let cpNew = $state('');
  let cpConfirm = $state('');
  let cpError = $state('');
  let cpSuccess = $state('');
  let cpLoading = $state(false);

  function resetChangePassword() {
    cpCurrent = '';
    cpNew = '';
    cpConfirm = '';
    cpError = '';
    cpSuccess = '';
    cpLoading = false;
  }

  async function submitChangePassword() {
    cpError = '';
    cpSuccess = '';

    if (cpNew.length < 4) {
      cpError = m.auth_password_too_short();
      return;
    }
    if (cpNew !== cpConfirm) {
      cpError = m.auth_password_mismatch();
      return;
    }

    cpLoading = true;
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          cpError = m.auth_wrong_current_password();
        } else {
          cpError = data.error || 'Error';
        }
        return;
      }
      cpSuccess = m.auth_password_changed();
      setTimeout(() => {
        showChangePassword = false;
        resetChangePassword();
      }, 1200);
    } catch {
      cpError = 'Network error';
    } finally {
      cpLoading = false;
    }
  }

  let showShareModal = $state(false);
  let showEmbedModal = $state(false);
  let showHistoryPanel = $state(false);
  let showDiffModal = $state(false);
  let showSnapshotPanel = $state(false);

  // Shared projects
  interface SharedProject {
    projectId: string;
    permission: string;
    ownerName: string;
    projectName: string;
    sharedAt: string;
  }
  let sharedProjects = $state<SharedProject[]>([]);
  let sharedLoading = $state(false);

  async function loadSharedProjects() {
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
    // Load the shared project schema and add it as a temporary project
    try {
      const res = await fetch(`/api/storage/schemas/${proj.projectId}`);
      if (!res.ok) return;
      const schema = await res.json();
      // Switch to the shared project - create or load it
      await projectStore.loadSharedProject(proj.projectId, proj.projectName, schema);
      closeDropdown();
    } catch { /* ignore */ }
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const THEMES: { id: ThemeId; label: () => string; dot: string }[] = [
    { id: 'modern',    label: () => m.theme_modern(),    dot: '#1e293b' },
    { id: 'classic',   label: () => m.theme_classic(),   dot: '#6b4c2a' },
    { id: 'blueprint', label: () => m.theme_blueprint(), dot: '#1e4a7a' },
    { id: 'minimal',   label: () => m.theme_minimal(),   dot: '#f0f0f0' },
  ];

  // Image export
  async function exportImage() {
    const worldEl = document.querySelector('.canvas-world') as HTMLElement | null;
    if (!worldEl) return;

    if (erdStore.schema.tables.length === 0) return;

    const { toPng } = await import('html-to-image');
    const PAD = 40;

    // Save originals
    const origTransform = worldEl.style.transform;
    const origWidth = worldEl.style.width;
    const origHeight = worldEl.style.height;

    // Reset to identity so getBoundingClientRect reflects actual world coords at scale=1
    worldEl.style.transform = 'translate(0px, 0px) scale(1)';
    void worldEl.getBoundingClientRect(); // force layout

    const worldRect = worldEl.getBoundingClientRect();
    const cards = Array.from(worldEl.querySelectorAll<HTMLElement>('.table-card'));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const x = rect.left - worldRect.left;
      const y = rect.top - worldRect.top;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + rect.width);
      maxY = Math.max(maxY, y + rect.height);
    }

    if (!isFinite(minX)) {
      worldEl.style.transform = origTransform;
      return;
    }

    const w = Math.ceil(maxX - minX + PAD * 2);
    const h = Math.ceil(maxY - minY + PAD * 2);

    // Shift so all tables start at (PAD, PAD) and give worldEl explicit dimensions
    worldEl.style.transform = `translate(${-minX + PAD}px, ${-minY + PAD}px) scale(1)`;
    worldEl.style.width = `${w}px`;
    worldEl.style.height = `${h}px`;

    // Temporarily allow overflow so capture sees full content
    const viewportEl = worldEl.parentElement;
    const origOverflow = viewportEl?.style.overflow ?? '';
    if (viewportEl) viewportEl.style.overflow = 'visible';

    try {
      const dataUrl = await toPng(worldEl, {
        width: w,
        height: h,
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.querySelector('.canvas-viewport')!).getPropertyValue('--erd-canvas-bg').trim() || '#f8fafc',
        filter: (node: HTMLElement) => {
          // Exclude hover tooltips from export
          return !node.classList?.contains('col-tooltip');
        },
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.png`;
      a.click();
    } finally {
      worldEl.style.transform = origTransform;
      worldEl.style.width = origWidth;
      worldEl.style.height = origHeight;
      if (viewportEl) viewportEl.style.overflow = origOverflow;
    }
  }
</script>

<header class="toolbar">
  <div class="logo">
    <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#1e293b"/>
      <path d="M16 5 L25 10.5 L25 21.5 L16 27 L7 21.5 L7 10.5 Z" fill="none" stroke="url(#logo-grad)" stroke-width="2" stroke-linejoin="round"/>
      <line x1="16" y1="5" x2="16" y2="27" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <line x1="7" y1="10.5" x2="25" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <line x1="25" y1="10.5" x2="7" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <circle cx="16" cy="5" r="2.2" fill="#60a5fa"/>
      <circle cx="25" cy="10.5" r="2.2" fill="#60a5fa"/>
      <circle cx="25" cy="21.5" r="2.2" fill="#60a5fa"/>
      <circle cx="16" cy="27" r="2.2" fill="#60a5fa"/>
      <circle cx="7" cy="21.5" r="2.2" fill="#60a5fa"/>
      <circle cx="7" cy="10.5" r="2.2" fill="#60a5fa"/>
      <circle cx="16" cy="16" r="2.8" fill="#60a5fa"/>
      <defs><linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
    </svg>
    <span class="logo-text">erdmini</span>
  </div>

  <!-- Project dropdown -->
  <div class="dropdown-wrap project-wrap">
    <button
      class="btn-project"
      onclick={() => { toggleDropdown('project'); if (activeDropdown === 'project') loadSharedProjects(); }}
      aria-expanded={projectOpen}
      aria-haspopup="menu"
    >
      <span class="project-name">{projectStore.activeProject?.name ?? 'Project'}</span>
      <span class="project-chevron">▾</span>
    </button>
    {#if projectOpen}
      <div
        class="dropdown-menu project-dropdown"
        role="menu"
        tabindex="-1"
        onmouseleave={() => { if (!renamingId && !showNewProjectInput) closeDropdown(); }}
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
                onclick={async () => { await projectStore.switchProject(proj.id); closeDropdown(); }}
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
                  onclick={async (e) => { e.stopPropagation(); await projectStore.duplicateProject(proj.id); closeDropdown(); }}
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

  <span class="separator"></span>

  <div class="actions">
    {#if collabStore.connected || collabStore.reconnecting}
      <CollabIndicator />
    {/if}
    {#if permissionStore.isReadOnly}
      <span class="readonly-badge">Read Only</span>
    {/if}
    <button class="btn-primary" onclick={addTable} disabled={permissionStore.isReadOnly}>
      {m.toolbar_add_table()}
    </button>
    <button class="btn-memo" onclick={addMemo} disabled={permissionStore.isReadOnly}>
      {m.toolbar_add_memo()}
    </button>

    <span class="separator"></span>

    <!-- Import dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (toggleDropdown('import'))}
        aria-expanded={importOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_import()} ▾
      </button>
      {#if importOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (closeDropdown())}
        >
          <button class="dropdown-item" role="menuitem" onclick={() => { modalMode = 'import'; closeDropdown(); }}>
            DDL
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { importJson(); closeDropdown(); }}>
            JSON
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" role="menuitem" onclick={() => { importBackup(); closeDropdown(); }}>
            {m.toolbar_restore_all()}
          </button>
        </div>
      {/if}
    </div>

    <!-- Export dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (toggleDropdown('export'))}
        aria-expanded={exportOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_export()} ▾
      </button>
      {#if exportOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (closeDropdown())}
        >
          <button class="dropdown-item" role="menuitem" onclick={() => { modalMode = 'export'; closeDropdown(); }}>
            DDL
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportJson(); closeDropdown(); }}>
            JSON
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportImage(); closeDropdown(); }}>
            {m.toolbar_image_export()} (PNG)
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportSvgFile(); closeDropdown(); }}>
            SVG
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportPdfFile(); closeDropdown(); }}>
            {m.toolbar_pdf_export()}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportBackup(); closeDropdown(); }}>
            {m.toolbar_backup_all()}
          </button>
        </div>
      {/if}
    </div>

    <!-- Tools dropdown (Domains, Lint, View Mode, History, Diff merged) -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary btn-tools"
        class:tools-active={showLintPanel || showHistoryPanel || showDiffModal || showSnapshotPanel || showDomainModal}
        onclick={() => (toggleDropdown('tools'))}
        aria-expanded={toolsOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_tools()}
        {#if lintIssueCount > 0}
          <span class="lint-badge">{lintIssueCount}</span>
        {/if}
        ▾
      </button>
      {#if toolsOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (closeDropdown())}
        >
          <button class="dropdown-item" role="menuitem" onclick={() => { showDomainModal = true; closeDropdown(); }}>
            {m.toolbar_domains()}
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { showLintPanel = !showLintPanel; closeDropdown(); }}>
            {m.toolbar_lint()}
            {#if lintIssueCount > 0}
              <span class="lint-badge">{lintIssueCount}</span>
            {/if}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" role="menuitem" onclick={() => { showHistoryPanel = !showHistoryPanel; closeDropdown(); }}>
            {m.history_title()}
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { showDiffModal = !showDiffModal; closeDropdown(); }}>
            {m.diff_title()}
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { showSnapshotPanel = !showSnapshotPanel; closeDropdown(); }}>
            {m.toolbar_snapshots()}
          </button>
          {#if authStore.isLoggedIn && (permissionStore.current === 'owner' || permissionStore.current === 'editor')}
            <div class="dropdown-sep"></div>
            <button class="dropdown-item" role="menuitem" onclick={() => { showEmbedModal = true; closeDropdown(); }}>
              {m.embed_title()}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <span class="separator"></span>

    <button
      class="btn-secondary btn-share"
      class:copied={shareStatus === 'copied'}
      onclick={shareLink}
    >
      {shareStatus === 'copied' ? m.share_copied() : m.share_link()}
    </button>

    {#if authStore.isLoggedIn && (permissionStore.current === 'owner' || permissionStore.current === 'editor')}
      <button
        class="btn-secondary"
        onclick={() => (showShareModal = true)}
      >
        Share
      </button>
    {/if}
  </div>

  <div class="toolbar-right">
    <!-- Fullscreen / Present -->
    <button
      class="btn-icon"
      onclick={() => onfullscreen?.()}
      title={m.toolbar_fullscreen()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polyline points="1,5 1,1 5,1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="11,1 15,1 15,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="15,11 15,15 11,15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="5,15 1,15 1,11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Dark mode toggle -->
    <button
      class="btn-dark-toggle"
      onclick={() => themeStore.toggleDark()}
      title={themeStore.darkMode ? 'Light Mode' : 'Dark Mode'}
    >
      {#if themeStore.darkMode}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M14 9.5A6.5 6.5 0 016.5 2 5.5 5.5 0 108 14a5.5 5.5 0 006-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </button>

    <!-- Settings dropdown (Theme + Language merged) -->
    <div class="dropdown-wrap">
      <button
        class="btn-icon"
        onclick={() => (toggleDropdown('settings'))}
        aria-expanded={settingsOpen}
        aria-haspopup="menu"
        title={m.toolbar_settings()}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M6.86 1.58l-.37 1.47a5.08 5.08 0 00-1.22.7L3.84 3.3l-1.14 2 1.05 1.1a5.1 5.1 0 000 1.4l-1.05 1.1 1.14 2 1.43-.45c.36.28.77.52 1.22.7l.37 1.47h2.28l.37-1.47c.45-.18.86-.42 1.22-.7l1.43.45 1.14-2-1.05-1.1a5.1 5.1 0 000-1.4l1.05-1.1-1.14-2-1.43.45a5.08 5.08 0 00-1.22-.7L9.14 1.58H6.86z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
      {#if settingsOpen}
        <div
          class="dropdown-menu dropdown-right settings-dropdown"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (closeDropdown())}
        >
          <div class="dropdown-section-label">{m.toolbar_theme()}</div>
          {#each THEMES as t}
            <button
              class="dropdown-item theme-item"
              class:active={themeStore.current === t.id}
              role="menuitem"
              onclick={() => { themeStore.set(t.id); }}
            >
              <span class="theme-dot" style="background:{t.dot}"></span>
              {t.label()}
            </button>
          {/each}
          <div class="dropdown-sep"></div>
          <div class="dropdown-section-label">{languageStore.current.toUpperCase()}</div>
          {#each Object.entries(LOCALE_LABELS) as [locale, label]}
            <button
              class="dropdown-item"
              class:active={languageStore.current === locale}
              role="menuitem"
              onclick={() => { languageStore.set(locale as Locale); }}
            >
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Help (shortcuts + links) -->
    <div class="dropdown-wrap">
      <button
        class="btn-help"
        onclick={() => (toggleDropdown('shortcuts'))}
        aria-expanded={shortcutsOpen}
        aria-haspopup="dialog"
        title={m.shortcuts_title()}
      >
        ?
      </button>
      {#if shortcutsOpen}
        <div
          class="shortcuts-panel"
          role="dialog"
          tabindex="-1"
          onmouseleave={() => (closeDropdown())}
        >
          <div class="shortcuts-header">{m.shortcuts_title()}</div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_general()}</div>
            <div class="shortcut-row"><kbd>{mod}+Z</kbd><span>{m.shortcuts_undo()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+Shift+Z</kbd><span>{m.shortcuts_redo()}</span></div>
            <div class="shortcut-row"><kbd>Delete / Backspace</kbd><span>{m.shortcuts_delete()}</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>{m.shortcuts_deselect()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+K</kbd><span>{m.cmd_palette_open()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+A</kbd><span>{m.shortcuts_select_all()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+D</kbd><span>{m.shortcuts_duplicate()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_canvas()}</div>
            <div class="shortcut-row"><kbd>Scroll</kbd><span>{m.shortcuts_zoom()}</span></div>
            <div class="shortcut-row"><kbd>+/-</kbd><span>{m.shortcuts_keyboard_zoom()}</span></div>
            <div class="shortcut-row"><kbd>Drag</kbd><span>{m.shortcuts_pan()}</span></div>
            <div class="shortcut-row"><kbd>Space+Drag</kbd><span>{m.shortcuts_space_drag()}</span></div>
            <div class="shortcut-row"><kbd>Arrow</kbd><span>{m.shortcuts_arrow_pan()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_selection()}</div>
            <div class="shortcut-row"><kbd>{mod}+Click</kbd><span>{m.shortcuts_multi_select()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_editing()}</div>
            <div class="shortcut-row"><kbd>Double-click header</kbd><span>{m.shortcuts_rename_table()}</span></div>
            <div class="shortcut-row"><kbd>Double-click column</kbd><span>{m.shortcuts_edit_column()}</span></div>
          </div>

          <div class="shortcuts-links">
            <a class="shortcuts-link" href="https://github.com/dornol/erdmini/issues" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
              </svg>
              {m.toolbar_bug_report()}
            </a>
            <a class="shortcuts-link" href="https://github.com/dornol/erdmini" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      {/if}
    </div>

    <!-- User menu (server mode only) -->
    {#if authStore.isLoggedIn}
      <div class="dropdown-wrap">
        <button
          class="btn-user"
          onclick={() => (toggleDropdown('userMenu'))}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
            <path d="M2 14c0-3.31 2.69-5 6-5s6 1.69 6 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          {authStore.user?.displayName ?? ''} ▾
        </button>
        {#if userMenuOpen}
          <div
            class="dropdown-menu dropdown-right"
            role="menu"
            tabindex="-1"
            onmouseleave={() => (closeDropdown())}
          >
            <div class="dropdown-user-info">
              <span class="dropdown-user-name">{authStore.user?.displayName}</span>
              <span class="dropdown-user-role">{authStore.user?.role}</span>
            </div>
            {#if authStore.isAdmin}
              <a href="/admin" class="dropdown-item" role="menuitem" onclick={() => (closeDropdown())}>
                {m.nav_admin()}
              </a>
            {/if}
            {#if authStore.user?.username}
              <button
                class="dropdown-item"
                role="menuitem"
                onclick={() => { closeDropdown(); resetChangePassword(); showChangePassword = true; }}
              >
                {m.auth_change_password()}
              </button>
            {/if}
            <button
              class="dropdown-item"
              role="menuitem"
              onclick={() => { closeDropdown(); showApiKeysModal = true; }}
            >
              {m.api_keys_title()}
            </button>
            <button
              class="dropdown-item dropdown-item-danger"
              role="menuitem"
              onclick={() => { closeDropdown(); authStore.logout(); }}
            >
              {m.nav_sign_out()}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</header>

{#if modalMode}
  <DdlModal mode={modalMode} onclose={() => (modalMode = null)} />
{/if}

{#if showDomainModal}
  <DomainModal onclose={() => (showDomainModal = false)} />
{/if}

{#if showShareModal && projectStore.activeProject}
  <ShareProjectModal
    projectId={projectStore.activeProject.id}
    isOwner={permissionStore.current === 'owner'}
    onclose={() => (showShareModal = false)}
  />
{/if}

{#if showLintPanel}
  <LintPanel onclose={() => (showLintPanel = false)} />
{/if}

{#if showHistoryPanel}
  <HistoryPanel onclose={() => (showHistoryPanel = false)} />
{/if}

{#if showDiffModal}
  <SchemaDiffModal onclose={() => (showDiffModal = false)} />
{/if}

{#if showSnapshotPanel}
  <SnapshotPanel
    onclose={() => (showSnapshotPanel = false)}
    ondiff={(snapshotId) => { showSnapshotPanel = false; showDiffModal = true; }}
  />
{/if}

{#if showApiKeysModal}
  <ApiKeysModal onclose={() => (showApiKeysModal = false)} />
{/if}

{#if showEmbedModal}
  <EmbedModal onclose={() => (showEmbedModal = false)} />
{/if}

{#if showChangePassword}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="cp-overlay" onmousedown={(e) => { if (e.target === e.currentTarget) { showChangePassword = false; resetChangePassword(); } }}>
    <div class="cp-modal">
      <h3>{m.auth_change_password()}</h3>
      <form onsubmit={async (e) => { e.preventDefault(); await submitChangePassword(); }}>
        <label>
          <span>{m.auth_current_password()}</span>
          <input type="password" bind:value={cpCurrent} autocomplete="current-password" required />
        </label>
        <label>
          <span>{m.auth_new_password()}</span>
          <input type="password" bind:value={cpNew} autocomplete="new-password" required />
        </label>
        <label>
          <span>{m.auth_confirm_password()}</span>
          <input type="password" bind:value={cpConfirm} autocomplete="new-password" required />
        </label>
        {#if cpError}
          <div class="cp-error">{cpError}</div>
        {/if}
        {#if cpSuccess}
          <div class="cp-success">{cpSuccess}</div>
        {/if}
        <div class="cp-actions">
          <button type="button" class="cp-btn-cancel" onclick={() => { showChangePassword = false; resetChangePassword(); }}>
            {m.action_cancel()}
          </button>
          <button type="submit" class="cp-btn-submit" disabled={cpLoading}>
            {m.auth_change_password()}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 6px 16px;
    min-height: 48px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .logo-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  .logo-text {
    color: white;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.5px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .toolbar-right {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .readonly-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    background: #7c3aed20;
    border: 1px solid #7c3aed;
    border-radius: 4px;
    color: #a78bfa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-memo {
    background: #f59e0b;
    color: #1e293b;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .btn-memo:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-memo:hover {
    background: #d97706;
  }

  .btn-secondary {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-secondary:hover {
    background: #334155;
    color: white;
  }

  .btn-user {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-user:hover {
    background: #475569;
    color: #f1f5f9;
  }

  .dropdown-user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid #475569;
  }

  .dropdown-user-name {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .dropdown-user-role {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dropdown-item-danger {
    color: #f87171 !important;
  }

  .dropdown-item-danger:hover {
    background: rgba(248, 113, 113, 0.1) !important;
    color: #fca5a5 !important;
  }

  .btn-share.copied {
    background: #166534;
    color: #4ade80;
    border-color: #22c55e;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: #475569;
    flex-shrink: 0;
    margin: 0 2px;
  }

  .dropdown-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 110px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .dropdown-right {
    left: auto;
    right: 0;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 14px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background: #334155;
    color: white;
  }

  .dropdown-section-label {
    padding: 6px 14px 2px;
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .theme-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-item.active {
    color: white;
    background: #334155;
  }

  .theme-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .btn-help {
    background: transparent;
    color: #94a3b8;
    border: 1px solid #475569;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .btn-help:hover {
    background: #334155;
    color: white;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: #94a3b8;
    border: 1px solid #475569;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    text-decoration: none;
  }

  .btn-icon:hover {
    background: #334155;
    color: white;
  }

  .shortcuts-panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 8px;
    z-index: 200;
    min-width: 260px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    padding: 12px 0;
  }

  .shortcuts-header {
    padding: 0 14px 8px;
    font-size: 13px;
    font-weight: 600;
    color: white;
    border-bottom: 1px solid #334155;
    margin-bottom: 4px;
  }

  .shortcuts-group {
    padding: 6px 14px;
  }

  .shortcuts-group-title {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 12px;
    color: #cbd5e1;
  }

  .shortcut-row kbd {
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: inherit;
    white-space: nowrap;
  }

  /* Project dropdown */
  .project-wrap {
    flex-shrink: 1;
    min-width: 0;
  }

  .btn-project {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    max-width: 180px;
    flex-shrink: 0;
  }

  .btn-project:hover {
    background: #334155;
    border-color: #60a5fa;
  }

  .project-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-chevron {
    color: #94a3b8;
    font-size: 11px;
    flex-shrink: 0;
  }

  .project-dropdown {
    min-width: 240px;
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .project-item {
    display: flex;
    align-items: center;
    padding: 0 4px 0 0;
    transition: background 0.1s;
  }

  .project-item:hover {
    background: #334155;
  }

  .project-item.active {
    background: #1e3a5f;
  }

  .project-item-name {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 12px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .project-item-label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-item-meta {
    display: block;
    font-size: 10px;
    color: #64748b;
    font-weight: 400;
    margin-top: 1px;
  }

  .project-item.active .project-item-name {
    color: #60a5fa;
    font-weight: 600;
  }

  .project-item.active .project-item-meta {
    color: #93c5fd;
  }

  .id-copy-btn {
    font-family: monospace;
    font-size: 9px;
    background: rgba(100, 116, 139, 0.15);
    border: none;
    border-radius: 2px;
    padding: 0 3px;
    color: inherit;
    cursor: pointer;
    vertical-align: baseline;
  }

  .id-copy-btn:hover {
    background: rgba(100, 116, 139, 0.3);
  }

  .project-item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .project-item:hover .project-item-actions {
    opacity: 1;
  }

  .project-action-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    transition: background 0.1s, color 0.1s;
    line-height: 1;
  }

  .project-action-btn:hover {
    background: #475569;
    color: white;
  }

  .project-action-delete:hover {
    background: #dc2626;
    color: white;
  }

  .project-rename-input {
    flex: 1;
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #60a5fa;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 13px;
    outline: none;
    margin: 4px 8px;
    min-width: 0;
  }

  .project-divider {
    height: 1px;
    background: #334155;
    margin: 4px 0;
  }

  .project-new-btn {
    color: #60a5fa !important;
    font-weight: 500;
  }

  .project-new-row {
    display: flex;
    padding: 4px 8px;
    align-items: center;
    gap: 6px;
  }

  .project-new-row .project-rename-input {
    margin: 0;
  }

  .project-new-confirm {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: #3b82f6;
    color: white;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .project-new-confirm:hover {
    background: #2563eb;
  }

  .project-shared-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .project-shared-loading,
  .project-shared-empty {
    padding: 8px 12px;
    font-size: 12px;
    color: #64748b;
  }

  .shared-project-item {
    padding-left: 12px;
  }

  .btn-dark-toggle {
    background: transparent;
    color: #fbbf24;
    border: 1px solid #475569;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .btn-dark-toggle:hover {
    background: #334155;
    color: #fcd34d;
  }

  .btn-tools {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-tools.tools-active {
    background: #1e3a5f;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  .lint-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #f59e0b;
    color: #1e293b;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }

  .settings-dropdown {
    min-width: 150px;
  }

  .shortcuts-links {
    border-top: 1px solid #334155;
    margin-top: 4px;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shortcuts-link {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 12px;
    transition: color 0.15s;
  }

  .shortcuts-link:hover {
    color: #e2e8f0;
  }

  /* Change password modal */
  .cp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .cp-modal {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px;
    min-width: 340px;
    max-width: 400px;
    color: #e2e8f0;
  }

  .cp-modal h3 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
  }

  .cp-modal label {
    display: block;
    margin-bottom: 12px;
  }

  .cp-modal label span {
    display: block;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .cp-modal input {
    width: 100%;
    padding: 8px 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }

  .cp-modal input:focus {
    border-color: #3b82f6;
  }

  .cp-error {
    color: #f87171;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .cp-success {
    color: #4ade80;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .cp-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .cp-btn-cancel {
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .cp-btn-cancel:hover {
    background: #334155;
  }

  .cp-btn-submit {
    background: #3b82f6;
    border: none;
    color: white;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .cp-btn-submit:hover {
    background: #2563eb;
  }

  .cp-btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

</style>

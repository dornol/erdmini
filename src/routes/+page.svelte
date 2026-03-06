<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import ColumnEditPopup from '$lib/components/ColumnEditPopup.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import MemoCard from '$lib/components/MemoCard.svelte';
  import TableEditor from '$lib/components/TableEditor.svelte';
  import FkModal from '$lib/components/FkModal.svelte';
  import DialogModal from '$lib/components/DialogModal.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import BulkEditModal from '$lib/components/BulkEditModal.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import SchemaTabBar from '$lib/components/SchemaTabBar.svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { downloadBlob } from '$lib/utils/blob-download';
  import type { ERDSchema } from '$lib/types/erd';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { getShareDataFromUrl, shareStringToSchema } from '$lib/utils/url-share';
  import { deriveLabel } from '$lib/utils/history-labels';
  import { filterBySchema } from '$lib/utils/canvas-grid';
  import { getStorageProvider } from '$lib/storage';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import { collabClient } from '$lib/collab/collab-client';
  import { collabStore } from '$lib/store/collab.svelte';
  import { snapshotStore, AUTO_SNAPSHOT_INTERVAL_MS } from '$lib/store/snapshot.svelte';
  import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { scale, fade } from 'svelte/transition';
  import * as m from '$lib/paraglide/messages';
  import { restoreCanvasSettings, persistColumnDisplayMode, persistLineType, persistShowGrid, persistShowRelationLines, persistSchemaView } from '$lib/utils/canvas-persistence';
  import { handleKeydown as handleKBShortcut, type KeyboardContext } from '$lib/utils/keyboard-shortcuts';
  import { env } from '$env/dynamic/public';

  // Restore persisted canvas settings synchronously (before $effects run)
  if (browser) {
    const saved = restoreCanvasSettings();
    if (saved.columnDisplayMode) canvasState.columnDisplayMode = saved.columnDisplayMode;
    if (saved.lineType) canvasState.lineType = saved.lineType;
    if (saved.showGrid === false) canvasState.showGrid = false;
    if (saved.showRelationLines === false) canvasState.showRelationLines = false;
    if (saved.activeSchema) canvasState.activeSchema = saved.activeSchema;
    if (saved.schemaViewports) canvasState.schemaViewports = saved.schemaViewports;
  }

  let sidebarCollapsed = $state(false);
  let commandPaletteOpen = $state(false);
  let fkModalTableId = $state<string | null>(null);
  let fkModalEditId = $state<string | undefined>(undefined);

  function handleEditFk(tableId: string, fkId: string) {
    fkModalTableId = tableId;
    fkModalEditId = fkId;
  }

  const visibleTables = $derived(filterBySchema(erdStore.schema.tables, canvasState.activeSchema));
  const visibleMemos = $derived(filterBySchema(erdStore.schema.memos, canvasState.activeSchema));
  let showBulkEditModal = $state(false);
  let viewportWidth = $state(768);
  let forceDesktop = $state(false);
  let isMobile = $derived(viewportWidth < 768);
  let storageBannerDismissed = $state(false);
  let fullscreenMode = $state(false);
  let fullscreenBarVisible = $state(true);
  let fullscreenBarTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const provider = await getStorageProvider();
    await projectStore.init(provider);
    await snapshotStore.init(provider, projectStore.index.activeProjectId);

    // Load shared schema from URL hash immediately after init (most reliable timing)
    await loadShareFromHash();

    // Auto-load shared projects for users with no projects
    if (projectStore.index.projects.length === 0 && authStore.user && !authStore.user.canCreateProject) {
      await autoLoadSharedProjects();
    }
  });

  async function autoLoadSharedProjects() {
    try {
      const res = await fetch('/api/storage/shared');
      if (!res.ok) return;
      const shared = await res.json();
      if (!shared.length) return;
      // Load the first shared project
      const first = shared[0];
      const schemaRes = await fetch(`/api/storage/schemas/${first.projectId}`);
      if (!schemaRes.ok) return;
      const schema = await schemaRes.json();
      await projectStore.loadSharedProject(first.projectId, first.projectName, schema);
      // Load remaining shared projects into index
      for (let i = 1; i < shared.length; i++) {
        const s = shared[i];
        const sRes = await fetch(`/api/storage/schemas/${s.projectId}`);
        if (!sRes.ok) continue;
        const sSchema = await sRes.json();
        await projectStore.loadSharedProject(s.projectId, s.projectName, sSchema);
      }
    } catch { /* ignore */ }
  }

  // Persist canvas settings
  $effect(() => { persistColumnDisplayMode(canvasState.columnDisplayMode); });
  $effect(() => { persistLineType(canvasState.lineType); });
  $effect(() => { persistShowGrid(canvasState.showGrid); });
  $effect(() => { persistShowRelationLines(canvasState.showRelationLines); });
  $effect(() => { persistSchemaView(canvasState.activeSchema, canvasState.schemaViewports); });

  /** Measure viewport, apply state change, then compensate canvas position to keep center stable */
  async function preserveCenter(applyChange: () => void) {
    const vp = document.querySelector('.canvas-viewport');
    const oldRect = vp?.getBoundingClientRect();
    const oldW = oldRect?.width ?? 0;
    const oldH = oldRect?.height ?? 0;

    applyChange();
    await tick();
    // Force layout recalculation after DOM update
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const newVp = document.querySelector('.canvas-viewport');
    const newRect = newVp?.getBoundingClientRect();
    const newW = newRect?.width ?? oldW;
    const newH = newRect?.height ?? oldH;

    canvasState.x += (newW - oldW) / 2;
    canvasState.y += (newH - oldH) / 2;
  }

  function enterFullscreen() {
    preserveCenter(() => {
      fullscreenMode = true;
      fullscreenBarVisible = true;
      clearTimeout(fullscreenBarTimer);
      fullscreenBarTimer = setTimeout(() => (fullscreenBarVisible = false), 3000);
    });
  }

  function exitFullscreen() {
    preserveCenter(() => {
      fullscreenMode = false;
      fullscreenBarVisible = true;
      clearTimeout(fullscreenBarTimer);
    });
  }

  function showFullscreenBar() {
    fullscreenBarVisible = true;
    clearTimeout(fullscreenBarTimer);
    fullscreenBarTimer = setTimeout(() => (fullscreenBarVisible = false), 3000);
  }

  function toggleSidebar() {
    preserveCenter(() => {
      sidebarCollapsed = !sidebarCollapsed;
    });
  }

  // ── Collab: WebSocket lifecycle ──
  const unsubCollab = collabClient.onMessage(handleServerMessage);

  // Connect/disconnect on project change (server mode + logged in)
  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      collabClient.disconnect();
      collabStore.reset();
      return;
    }
    collabClient.connect(projectId);
  });

  // Send selection presence when selected tables change
  $effect(() => {
    const ids = [...erdStore.selectedTableIds];
    sendPresence({ selectedTableIds: ids });
  });

  // Send operations to peers when erdStore emits them
  $effect(() => {
    void erdStore._opVersion; // trigger on each new operation
    const op = erdStore._lastOperation;
    if (op) sendOperation(op);
  });

  onDestroy(() => {
    unsubCollab();
    collabClient.disconnect();
    collabStore.reset();
    clearTimeout(fullscreenBarTimer);
    clearTimeout(saveTimer);
  });

  // Load permission when project changes (server mode only)
  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      permissionStore.set(null);
      return;
    }
    loadPermission(projectId);
  });

  async function loadPermission(projectId: string) {
    try {
      const res = await fetch(`/api/storage/projects/${projectId}/my-permission`);
      if (res.ok) {
        const data = await res.json();
        permissionStore.set(data.permission);
      }
    } catch {
      permissionStore.set(null);
    }
  }

  // Auto-save to localStorage and push undo snapshot whenever schema changes
  // prevSchemaSnap captures the state BEFORE the mutation so undo restores the correct state
  let prevUpdatedAt = $state(erdStore.schema.updatedAt);
  let prevSchemaSnap: string = JSON.stringify($state.snapshot(erdStore.schema));
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const cur = erdStore.schema.updatedAt;
    if (cur !== prevUpdatedAt) {
      if (erdStore._isUndoRedoing) {
        erdStore._isUndoRedoing = false;
      } else if (erdStore._isRemoteOp) {
        // Remote operations don't go into undo stack
      } else if (erdStore._isLoadingSchema) {
        erdStore._isLoadingSchema = false;
      } else {
        const prevSchema: ERDSchema = JSON.parse(prevSchemaSnap);
        const curSchema = $state.snapshot(erdStore.schema) as ERDSchema;
        const result = deriveLabel(prevSchema, curSchema);
        if (result) {
          erdStore.pushSnapshotRaw(prevSchemaSnap, result.label, result.detail);
        }
      }
      prevUpdatedAt = cur;
    }
    // Always capture current state for next mutation
    prevSchemaSnap = JSON.stringify($state.snapshot(erdStore.schema));
    // Debounced save — avoid writing to storage on every drag frame
    // Guard: skip save until init done AND no async project switch in progress
    if (projectStore.safeToSave) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => { if (projectStore.safeToSave) await projectStore.saveCurrentSchema(); }, 300);
    }
  });

  // Auto-snapshot: create periodic snapshots for persistent history
  let lastAutoSnapshotSnap = '';
  let autoSnapshotTimer: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    // Re-run when project changes
    const _projectId = projectStore.index.activeProjectId;
    clearInterval(autoSnapshotTimer);
    lastAutoSnapshotSnap = JSON.stringify($state.snapshot(erdStore.schema));

    autoSnapshotTimer = setInterval(async () => {
      // Skip if tab is hidden or read-only
      if (document.hidden || permissionStore.isReadOnly) return;

      // In collab mode, only the lexicographically first peer creates auto-snapshots
      if (collabStore.myPeerId && collabStore.peers.length > 0) {
        const allPeerIds = [collabStore.myPeerId, ...collabStore.peers.map((p) => p.peerId)];
        allPeerIds.sort();
        if (allPeerIds[0] !== collabStore.myPeerId) return;
      }

      const currentSnap = JSON.stringify($state.snapshot(erdStore.schema));
      if (currentSnap === lastAutoSnapshotSnap) return; // no changes

      const now = new Date();
      const name = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      await snapshotStore.createAuto(name);
      lastAutoSnapshotSnap = currentSnap;
    }, AUTO_SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(autoSnapshotTimer);
  });

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    const ctx: KeyboardContext = {
      erdStore,
      canvasState,
      dialogStore,
      isReadOnly: permissionStore.isReadOnly,
      fullscreenMode,
      commandPaletteOpen,
      setFullscreen: (v) => { if (v) enterFullscreen(); else exitFullscreen(); },
      setCommandPalette: (v) => { commandPaletteOpen = v; },
    };
    handleKBShortcut(e, ctx);
  }

  $effect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function handleResize() {
    viewportWidth = window.innerWidth;
  }
  $effect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  // Load shared schema from URL hash (#s=...)
  async function loadShareFromHash() {
    const shareData = getShareDataFromUrl();
    if (!shareData) return;
    // Clear hash using SvelteKit's shallow replaceState (won't trigger load functions)
    replaceState(window.location.pathname, {});
    try {
      const { schema, projectName } = await shareStringToSchema(shareData);

      // Server mode: load as read-only temporary view (no project creation)
      if (env.PUBLIC_STORAGE_MODE === 'server') {
        erdStore.loadSchema(schema);
        permissionStore.current = 'viewer';
        dialogStore.alert(m.share_readonly_notice());
        return;
      }

      let name: string;
      if (projectName) {
        name = `shared: ${projectName}`;
      } else {
        const tableSummary = schema.tables.slice(0, 3).map((t) => t.name).join(', ');
        name = tableSummary
          ? `Shared: ${tableSummary}${schema.tables.length > 3 ? '…' : ''}`
          : 'Shared Project';
      }
      await projectStore.createProjectWithSchema(name, schema);
    } catch {
      dialogStore.alert(m.share_load_failed());
    }
  }

  // Handle hashchange (user navigates to share URL while app is already open)
  onMount(() => {
    const handleHashChange = () => {
      if (projectStore.initialized) loadShareFromHash();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

{#if !projectStore.initialized}
  <div class="app-loading">
    <div class="loading-spinner"></div>
  </div>
{:else if isMobile && !forceDesktop}
  <div class="mobile-notice">
    <div class="mobile-card">
      <svg class="mobile-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="ml" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
        <rect width="32" height="32" rx="7" fill="#1e293b"/>
        <path d="M16 5 L25 10.5 L25 21.5 L16 27 L7 21.5 L7 10.5 Z" fill="none" stroke="url(#ml)" stroke-width="2" stroke-linejoin="round"/>
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
      </svg>
      <h1 class="mobile-title">erdmini</h1>
      <p class="mobile-heading">{m.mobile_desktop_optimized()}</p>
      <p class="mobile-desc">{m.mobile_description()}</p>

      {#if erdStore.schema.tables.length > 0 || (erdStore.schema.domains ?? []).length > 0}
        <div class="mobile-summary">
          {m.mobile_schema_summary({ tables: erdStore.schema.tables.length, domains: (erdStore.schema.domains ?? []).length })}
        </div>
      {/if}

      <p class="mobile-sub">{m.mobile_open_on_desktop()}</p>
      <button class="mobile-btn" onclick={() => (forceDesktop = true)}>
        {m.mobile_continue_anyway()} &rarr;
      </button>
    </div>
  </div>
{:else}
  <div class="app" data-dark={themeStore.darkMode || undefined}>
    {#if fullscreenMode}
      <!-- Fullscreen Presentation Mode -->
      <div class="fullscreen-canvas">
        <Canvas>
          {#if canvasState.showRelationLines}<RelationLines {visibleTables} oneditfk={handleEditFk} />{/if}
          {#each visibleMemos.filter((mm) => !mm.attachedTableId) as memo (memo.id)}
            <div class="fullscreen-table-wrapper">
              <MemoCard {memo} />
            </div>
          {/each}
          {#each visibleTables as table (table.id)}
            <div class="fullscreen-table-wrapper">
              <TableCard {table} />
            </div>
          {/each}
        </Canvas>

        <!-- Top bar: project name + close button -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fullscreen-topbar"
          class:fullscreen-topbar-hidden={!fullscreenBarVisible}
          onmouseenter={showFullscreenBar}
        >
          <span class="fullscreen-project-name">{projectStore.activeProject?.name ?? 'Project'}</span>
          <button class="fullscreen-close-btn" onclick={exitFullscreen}>
            {m.fullscreen_exit()} ✕
          </button>
        </div>

        <!-- Invisible hover zone at top to reveal bar -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fullscreen-hover-zone" onmouseenter={showFullscreenBar}></div>
      </div>
    {:else}
      <!-- Normal Mode -->
      {#if projectStore.storageFull && !storageBannerDismissed}
        <div class="storage-banner">
          <span class="storage-msg">{m.storage_full_warning()}</span>
          <button class="storage-export-btn" onclick={() => {
            downloadBlob(JSON.stringify($state.snapshot(erdStore.schema), null, 2), 'erdmini-backup.json', 'application/json');
          }}>{m.storage_full_export()}</button>
          <button class="storage-close-btn" onclick={() => (storageBannerDismissed = true)}>✕</button>
        </div>
      {/if}
      {@const noProject = projectStore.index.projects.length === 0 && !!authStore.user && !authStore.user.canCreateProject}
      <Toolbar onfullscreen={enterFullscreen} minimal={noProject} />
      {#if noProject}
        <!-- No-project placeholder for users without create permission -->
        <div class="no-project-screen">
          <div class="no-project-card">
            <div class="no-project-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="no-project-text">
              <h2 class="no-project-title">{m.no_project_title()}</h2>
              <p class="no-project-desc">{m.no_project_desc()}</p>
              <p class="no-project-hint">{m.no_project_shared_hint()}</p>
            </div>
          </div>
        </div>
      {:else}
        <SchemaTabBar />
        <div class="main">
          <Sidebar collapsed={sidebarCollapsed} ontoggle={toggleSidebar} onbulkedit={() => (showBulkEditModal = true)} />
          <Canvas>
            {#if canvasState.showRelationLines}<RelationLines {visibleTables} oneditfk={handleEditFk} />{/if}
            {#each visibleMemos.filter((mm) => !mm.attachedTableId) as memo (memo.id)}
              <div
                in:scale={{ duration: 200, start: 0.85, opacity: 0 }}
                out:fade={{ duration: 150 }}
              >
                <MemoCard {memo} />
              </div>
            {/each}
            {#each visibleTables as table (table.id)}
              <div
                in:scale={{ duration: 200, start: 0.85, opacity: 0 }}
                out:fade={{ duration: 150 }}
              >
                <TableCard {table} />
              </div>
            {/each}
          </Canvas>
          <TableEditor />
        </div>
      {/if}

      {#if erdStore.editingColumnInfo}
        <ColumnEditPopup
          tableId={erdStore.editingColumnInfo.tableId}
          columnId={erdStore.editingColumnInfo.columnId}
          anchorX={erdStore.editingColumnInfo.anchorX}
          anchorY={erdStore.editingColumnInfo.anchorY}
          onclose={() => (erdStore.editingColumnInfo = null)}
        />
      {/if}
    {/if}

    {#if showBulkEditModal && erdStore.selectedTableIds.size >= 2}
      <BulkEditModal
        tableIds={[...erdStore.selectedTableIds]}
        onclose={() => (showBulkEditModal = false)}
      />
    {/if}

    {#if commandPaletteOpen}
      <CommandPalette onclose={() => (commandPaletteOpen = false)} />
    {/if}

    {#if fkModalTableId}
      <FkModal tableId={fkModalTableId} editFkId={fkModalEditId} onclose={() => { fkModalTableId = null; fkModalEditId = undefined; }} />
    {/if}

    <DialogModal />
  </div>
{/if}

<style>
  .app-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0f172a;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #334155;
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;

    /* Light mode defaults */
    --app-panel-bg: #f8fafc;
    --app-card-bg: white;
    --app-border: #e2e8f0;
    --app-border-light: #f1f5f9;
    --app-text: #1e293b;
    --app-text-secondary: #475569;
    --app-text-muted: #64748b;
    --app-text-faint: #94a3b8;
    --app-input-bg: white;
    --app-input-border: #e2e8f0;
    --app-hover-bg: #f1f5f9;
    --app-active-bg: #eff6ff;
    --app-popup-bg: white;
    --app-popup-shadow: 0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
    --app-badge-bg: #f1f5f9;
    --app-badge-border: #e2e8f0;
    --app-cancel-bg: #f1f5f9;
    --app-cancel-text: #475569;
    --app-cancel-hover: #e2e8f0;
    --app-scrollbar: #cbd5e1;
  }

  .app[data-dark] {
    --app-panel-bg: #1e293b;
    --app-card-bg: #1e293b;
    --app-border: #334155;
    --app-border-light: #1e293b;
    --app-text: #f1f5f9;
    --app-text-secondary: #cbd5e1;
    --app-text-muted: #94a3b8;
    --app-text-faint: #64748b;
    --app-input-bg: #0f172a;
    --app-input-border: #475569;
    --app-hover-bg: #334155;
    --app-active-bg: #1e3a5f;
    --app-popup-bg: #1e293b;
    --app-popup-shadow: 0 8px 30px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
    --app-badge-bg: #334155;
    --app-badge-border: #475569;
    --app-cancel-bg: #334155;
    --app-cancel-text: #cbd5e1;
    --app-cancel-hover: #475569;
    --app-scrollbar: #475569;
  }

  .main {
    position: relative;
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .no-project-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--app-panel-bg, #f8fafc);
  }

  .no-project-card {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    max-width: 480px;
    padding: 48px 32px;
  }

  .no-project-icon {
    color: var(--app-text-faint, #94a3b8);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .no-project-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--app-text, #1e293b);
    margin: 0 0 8px;
  }

  .no-project-desc {
    font-size: 0.85rem;
    color: var(--app-text-secondary, #475569);
    line-height: 1.6;
    margin: 0 0 12px;
  }

  .no-project-hint {
    font-size: 0.78rem;
    color: var(--app-text-muted, #64748b);
    margin: 0;
  }

  .mobile-notice {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    background: #0f172a;
    padding: 24px;
  }

  .mobile-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 360px;
    width: 100%;
  }

  .mobile-logo {
    width: 80px;
    height: 80px;
    margin-bottom: 12px;
  }

  .mobile-title {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 20px;
    letter-spacing: -0.5px;
  }

  .mobile-heading {
    font-size: 16px;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0 0 12px;
  }

  .mobile-desc {
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.6;
    margin: 0 0 20px;
    white-space: pre-line;
  }

  .mobile-summary {
    font-size: 13px;
    color: #cbd5e1;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 16px;
    margin-bottom: 20px;
  }

  .mobile-sub {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 24px;
  }

  .mobile-btn {
    font-size: 14px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 24px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mobile-btn:hover {
    color: #e2e8f0;
    border-color: #475569;
    background: #1e293b;
  }

  .storage-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #fef3c7;
    border-bottom: 1px solid #f59e0b;
    flex-shrink: 0;
  }

  .storage-msg {
    flex: 1;
    font-size: 13px;
    color: #92400e;
    font-weight: 500;
  }

  .storage-export-btn {
    font-size: 12px;
    color: #92400e;
    background: white;
    border: 1px solid #f59e0b;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
  }

  .storage-export-btn:hover {
    background: #fffbeb;
  }

  .storage-close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #b45309;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .storage-close-btn:hover {
    background: #fde68a;
  }

  /* Fullscreen Presentation Mode */
  .fullscreen-canvas {
    position: relative;
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .fullscreen-table-wrapper {
    pointer-events: none;
  }

  .fullscreen-topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(8px);
    z-index: 100;
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  .fullscreen-topbar-hidden {
    opacity: 0;
    transform: translateY(-100%);
    pointer-events: none;
  }

  .fullscreen-hover-zone {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 12px;
    z-index: 99;
  }

  .fullscreen-project-name {
    color: #e2e8f0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }

  .fullscreen-close-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #e2e8f0;
    font-size: 12px;
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .fullscreen-close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
  }
</style>

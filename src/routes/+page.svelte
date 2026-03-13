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
  import { onMount, onDestroy } from 'svelte';
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import MobileNotice from '$lib/components/MobileNotice.svelte';
  import StorageBanner from '$lib/components/StorageBanner.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { filterBySchema } from '$lib/utils/canvas-grid';
  import { getStorageProvider } from '$lib/storage';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import { snapshotStore } from '$lib/store/snapshot.svelte';
  import { browser } from '$app/environment';
  import { scale, fade } from 'svelte/transition';
  import * as m from '$lib/paraglide/messages';
  import { restoreCanvasSettings, persistColumnDisplayMode, persistLineType, persistShowGrid, persistShowRelationLines, persistSchemaView } from '$lib/utils/canvas-persistence';
  import { handleKeydown as handleKBShortcut, type KeyboardContext } from '$lib/utils/keyboard-shortcuts';
  import { useCollab } from '$lib/composables/use-collab.svelte';
  import { useAutoSave } from '$lib/composables/use-auto-save.svelte';
  import { useAutoSnapshot } from '$lib/composables/use-auto-snapshot.svelte';
  import { usePermission } from '$lib/composables/use-permission.svelte';
  import { useUrlShare, loadShareFromHash, autoLoadSharedProjects } from '$lib/composables/use-url-share.svelte';
  import { useFullscreen } from '$lib/composables/use-fullscreen.svelte';

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

  // ── Composables (must be called during component init) ──
  const fullscreen = useFullscreen();
  const cleanupCollab = useCollab();
  const cleanupAutoSave = useAutoSave();
  useAutoSnapshot();
  usePermission();
  useUrlShare();

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

  // Persist canvas settings
  $effect(() => { persistColumnDisplayMode(canvasState.columnDisplayMode); });
  $effect(() => { persistLineType(canvasState.lineType); });
  $effect(() => { persistShowGrid(canvasState.showGrid); });
  $effect(() => { persistShowRelationLines(canvasState.showRelationLines); });
  $effect(() => { persistSchemaView(canvasState.activeSchema, canvasState.schemaViewports); });

  function toggleSidebar() {
    fullscreen.preserveCenter(() => {
      sidebarCollapsed = !sidebarCollapsed;
    });
  }

  onDestroy(() => {
    cleanupCollab();
    fullscreen.cleanup();
    cleanupAutoSave();
  });

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    const ctx: KeyboardContext = {
      erdStore,
      canvasState,
      dialogStore,
      isReadOnly: permissionStore.isReadOnly,
      fullscreenMode: fullscreen.mode,
      commandPaletteOpen,
      setFullscreen: (v) => { if (v) fullscreen.enter(); else fullscreen.exit(); },
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

</script>

{#if !projectStore.initialized}
  <div class="app-loading">
    <div class="loading-spinner"></div>
  </div>
{:else if isMobile && !forceDesktop}
  <MobileNotice oncontinue={() => (forceDesktop = true)} />
{:else}
  <div class="app" data-dark={themeStore.darkMode || undefined}>
    {#if fullscreen.mode}
      <!-- Fullscreen Presentation Mode -->
      <div class="fullscreen-canvas">
        <Canvas onfullscreen={fullscreen.exit} fullscreenMode>
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
          class:fullscreen-topbar-hidden={!fullscreen.barVisible}
          onmouseenter={fullscreen.showBar}
        >
          <span class="fullscreen-project-name">{projectStore.activeProject?.name ?? 'Project'}</span>
          <button class="fullscreen-close-btn" onclick={fullscreen.exit}>
            {m.fullscreen_exit()} ✕
          </button>
        </div>

        <!-- Invisible hover zone at top to reveal bar -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fullscreen-hover-zone" onmouseenter={fullscreen.showBar}></div>
      </div>
    {:else}
      <!-- Normal Mode -->
      <StorageBanner storageFull={projectStore.storageFull} />
      {@const noProject = projectStore.index.projects.length === 0 && !!authStore.user && !authStore.user.canCreateProject}
      <Toolbar minimal={noProject} />
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
          <Canvas onfullscreen={fullscreen.enter}>
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

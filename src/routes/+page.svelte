<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import ColumnEditPopup from '$lib/components/ColumnEditPopup.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import TableEditor from '$lib/components/TableEditor.svelte';
  import DialogModal from '$lib/components/DialogModal.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import BulkEditModal from '$lib/components/BulkEditModal.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { erdStore, canvasState, type ColumnDisplayMode } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import type { ERDSchema } from '$lib/types/erd';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { getShareDataFromUrl, shareStringToSchema } from '$lib/utils/url-share';
  import { getStorageProvider } from '$lib/storage';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import { collabClient } from '$lib/collab/collab-client';
  import { collabStore } from '$lib/store/collab.svelte';
  import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';
  import { scale, fade } from 'svelte/transition';
  import * as m from '$lib/paraglide/messages';

  let sidebarCollapsed = $state(false);
  let commandPaletteOpen = $state(false);
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

    // Restore column display mode
    const savedMode = localStorage.getItem('erdmini_column_display_mode');
    if (savedMode === 'pk-fk-only' || savedMode === 'names-only') {
      canvasState.columnDisplayMode = savedMode as ColumnDisplayMode;
    }
  });

  // Persist column display mode
  $effect(() => {
    const mode = canvasState.columnDisplayMode;
    if (mode === 'all') {
      localStorage.removeItem('erdmini_column_display_mode');
    } else {
      localStorage.setItem('erdmini_column_display_mode', mode);
    }
  });

  /** Measure viewport, apply state change, then compensate canvas position to keep center stable */
  async function preserveCenter(applyChange: () => void) {
    const vp = document.querySelector('.canvas-viewport');
    const oldRect = vp?.getBoundingClientRect();
    const oldW = oldRect?.width ?? 0;
    const oldH = oldRect?.height ?? 0;

    applyChange();
    await tick();
    // Force layout recalculation after DOM update
    await new Promise<void>((r) => requestAnimationFrame(r));

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

  function deriveLabel(prev: ERDSchema, cur: ERDSchema): { label: string; detail: string } {
    const pt = prev.tables;
    const ct = cur.tables;
    const prevIds = new Set(pt.map((t) => t.id));
    const curIds = new Set(ct.map((t) => t.id));

    // Table added
    if (ct.length > pt.length) {
      const added = ct.find((t) => !prevIds.has(t.id));
      return { label: 'history_add_table', detail: added?.name ?? '' };
    }
    // Table deleted
    if (ct.length < pt.length) {
      const removed = pt.find((t) => !curIds.has(t.id));
      return { label: 'history_delete_table', detail: removed?.name ?? '' };
    }

    // Column added/deleted
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      if (ct2.columns.length > pt2.columns.length) {
        const prevColIds = new Set(pt2.columns.map((c) => c.id));
        const added = ct2.columns.find((c) => !prevColIds.has(c.id));
        return { label: 'history_add_column', detail: `${ct2.name}.${added?.name ?? ''}` };
      }
      if (ct2.columns.length < pt2.columns.length) {
        const curColIds = new Set(ct2.columns.map((c) => c.id));
        const removed = pt2.columns.find((c) => !curColIds.has(c.id));
        return { label: 'history_delete_column', detail: `${ct2.name}.${removed?.name ?? ''}` };
      }
    }

    // FK added/deleted
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      if (ct2.foreignKeys.length > pt2.foreignKeys.length) {
        const prevFkIds = new Set(pt2.foreignKeys.map((f) => f.id));
        const added = ct2.foreignKeys.find((f) => !prevFkIds.has(f.id));
        const refTable = added ? ct.find((t) => t.id === added.referencedTableId) : null;
        return { label: 'history_add_fk', detail: `${ct2.name} → ${refTable?.name ?? ''}` };
      }
      if (ct2.foreignKeys.length < pt2.foreignKeys.length) {
        const curFkIds = new Set(ct2.foreignKeys.map((f) => f.id));
        const removed = pt2.foreignKeys.find((f) => !curFkIds.has(f.id));
        const refTable = removed ? pt.find((t) => t.id === removed.referencedTableId) : null;
        return { label: 'history_delete_fk', detail: `${ct2.name} → ${refTable?.name ?? ''}` };
      }
    }

    // Unique key added/deleted
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      if ((ct2.uniqueKeys?.length ?? 0) > (pt2.uniqueKeys?.length ?? 0)) {
        return { label: 'history_add_uq', detail: ct2.name };
      }
      if ((ct2.uniqueKeys?.length ?? 0) < (pt2.uniqueKeys?.length ?? 0)) {
        return { label: 'history_delete_uq', detail: ct2.name };
      }
    }

    // Index added/deleted
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      if ((ct2.indexes?.length ?? 0) > (pt2.indexes?.length ?? 0)) {
        return { label: 'history_add_idx', detail: ct2.name };
      }
      if ((ct2.indexes?.length ?? 0) < (pt2.indexes?.length ?? 0)) {
        return { label: 'history_delete_idx', detail: ct2.name };
      }
    }

    // Domain changes
    const prevDomains = prev.domains ?? [];
    const curDomains = cur.domains ?? [];
    if (curDomains.length !== prevDomains.length) {
      if (curDomains.length > prevDomains.length) {
        const prevDomIds = new Set(prevDomains.map((d) => d.id));
        const added = curDomains.find((d) => !prevDomIds.has(d.id));
        return { label: 'history_edit_domain', detail: added?.name ?? '' };
      }
      const curDomIds = new Set(curDomains.map((d) => d.id));
      const removed = prevDomains.find((d) => !curDomIds.has(d.id));
      return { label: 'history_edit_domain', detail: removed?.name ?? '' };
    }

    // Table name change
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (pt2 && pt2.name !== ct2.name) {
        return { label: 'history_edit_table', detail: `${pt2.name} → ${ct2.name}` };
      }
    }

    // Column property edit (same count but different content)
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      for (const cc of ct2.columns) {
        const pc = pt2.columns.find((c) => c.id === cc.id);
        if (pc && JSON.stringify(pc) !== JSON.stringify(cc)) {
          return { label: 'history_edit_column', detail: `${ct2.name}.${cc.name}` };
        }
      }
    }

    // FK property edit (same count but different content)
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      for (const cfk of ct2.foreignKeys) {
        const pfk = pt2.foreignKeys.find((f) => f.id === cfk.id);
        if (pfk && JSON.stringify(pfk) !== JSON.stringify(cfk)) {
          return { label: 'history_edit_fk', detail: ct2.name };
        }
      }
    }

    // Table property edit (comment, color, group, locked)
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (!pt2) continue;
      if ((pt2.comment ?? '') !== (ct2.comment ?? '')) {
        return { label: 'history_edit_table', detail: ct2.name };
      }
      if ((pt2.color ?? '') !== (ct2.color ?? '')) {
        return { label: 'history_edit_table', detail: ct2.name };
      }
      if ((pt2.group ?? '') !== (ct2.group ?? '')) {
        return { label: 'history_edit_table', detail: ct2.name };
      }
      if ((pt2.locked ?? false) !== (ct2.locked ?? false)) {
        return { label: 'history_edit_table', detail: ct2.name };
      }
    }

    // Position changes (layout)
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (pt2 && (pt2.position.x !== ct2.position.x || pt2.position.y !== ct2.position.y)) {
        return { label: 'history_layout', detail: '' };
      }
    }

    // groupColors change
    if (JSON.stringify(prev.groupColors ?? {}) !== JSON.stringify(cur.groupColors ?? {})) {
      return { label: 'history_edit_table', detail: '' };
    }

    return { label: 'history_edit', detail: '' };
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
      } else {
        const prevSchema: ERDSchema = JSON.parse(prevSchemaSnap);
        const curSchema = $state.snapshot(erdStore.schema) as ERDSchema;
        const { label, detail } = deriveLabel(prevSchema, curSchema);
        erdStore.pushSnapshotRaw(prevSchemaSnap, label, detail);
      }
      prevUpdatedAt = cur;
    }
    // Always capture current state for next mutation
    prevSchemaSnap = JSON.stringify($state.snapshot(erdStore.schema));
    // Debounced save — avoid writing to storage on every drag frame
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { await projectStore.saveCurrentSchema(); }, 300);
  });

  // Keyboard shortcuts
  async function handleKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const tag = (e.target as HTMLElement)?.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA';

    // F key: toggle fullscreen (when not editing) — use e.code for IME compatibility
    if (e.code === 'KeyF' && !isEditing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (fullscreenMode) exitFullscreen(); else enterFullscreen();
      return;
    }

    // ESC: exit fullscreen first, then deselect
    if (e.key === 'Escape' && !isEditing) {
      if (fullscreenMode) {
        exitFullscreen();
        return;
      }
      erdStore.selectedTableId = null;
      erdStore.selectedTableIds = new Set();
      return;
    }

    // In fullscreen mode, block all editing shortcuts
    if (fullscreenMode) {
      // Allow zoom (+/-), arrow pan, and Cmd+K palette
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        commandPaletteOpen = !commandPaletteOpen;
        return;
      }
      // Allow zoom keys and arrow keys to pass through
      if (!isEditing && (key === '+' || key === '=' || key === '-')) {
        e.preventDefault();
        const factor = (key === '-') ? 0.9 : 1.1;
        const newScale = Math.min(3, Math.max(0.2, canvasState.scale * factor));
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cx = vw / 2;
        const cy = vh / 2;
        canvasState.x = cx - (cx - canvasState.x) * (newScale / canvasState.scale);
        canvasState.y = cy - (cy - canvasState.y) * (newScale / canvasState.scale);
        canvasState.scale = newScale;
        return;
      }
      if (!isEditing && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = 60;
        switch (e.key) {
          case 'ArrowLeft':  canvasState.x += step; break;
          case 'ArrowRight': canvasState.x -= step; break;
          case 'ArrowUp':    canvasState.y += step; break;
          case 'ArrowDown':  canvasState.y -= step; break;
        }
        return;
      }
      return; // Block everything else in fullscreen
    }

    // Cmd+K: toggle command palette (works even when editing)
    if ((e.ctrlKey || e.metaKey) && key === 'k') {
      e.preventDefault();
      commandPaletteOpen = !commandPaletteOpen;
      return;
    }

    // Undo/Redo
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
      if (isEditing) return;
      e.preventDefault();
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        erdStore.redo();
      } else {
        erdStore.undo();
      }
      return;
    }

    // Ctrl+A: Select all tables
    if ((e.ctrlKey || e.metaKey) && key === 'a' && !isEditing) {
      e.preventDefault();
      const allIds = new Set(erdStore.schema.tables.map((t) => t.id));
      erdStore.selectedTableIds = allIds;
      if (allIds.size > 0) erdStore.selectedTableId = erdStore.schema.tables[0].id;
      return;
    }

    // Ctrl+D: Duplicate selected table(s)
    if ((e.ctrlKey || e.metaKey) && key === 'd' && !isEditing && !permissionStore.isReadOnly) {
      e.preventDefault();
      const ids = [...erdStore.selectedTableIds];
      for (const id of ids) {
        erdStore.duplicateTable(id);
      }
      return;
    }

    // Delete selected table(s)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && !permissionStore.isReadOnly) {
      const ids = [...erdStore.selectedTableIds];
      if (ids.length === 0) return;
      e.preventDefault();

      if (ids.length === 1) {
        const table = erdStore.schema.tables.find((t) => t.id === ids[0]);
        if (!table) return;
        const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
          title: m.dialog_delete_table_title(),
          confirmText: m.action_delete(),
          variant: 'danger',
        });
        if (ok) erdStore.deleteTable(ids[0]);
      } else {
        const ok = await dialogStore.confirm(m.dialog_bulk_delete_confirm({ count: ids.length }), {
          title: m.dialog_delete_table_title(),
          confirmText: m.action_delete(),
          variant: 'danger',
        });
        if (ok) erdStore.deleteTables(ids);
      }
    }

    // Keyboard zoom: +/= to zoom in, - to zoom out
    if (!isEditing && (e.key === '+' || e.key === '=' || e.key === '-')) {
      e.preventDefault();
      const factor = (e.key === '-') ? 0.9 : 1.1;
      const newScale = Math.min(3, Math.max(0.2, canvasState.scale * factor));
      // Zoom toward viewport center
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = vw / 2;
      const cy = vh / 2;
      canvasState.x = cx - (cx - canvasState.x) * (newScale / canvasState.scale);
      canvasState.y = cy - (cy - canvasState.y) * (newScale / canvasState.scale);
      canvasState.scale = newScale;
      return;
    }

    // Keyboard pan: Arrow keys
    if (!isEditing && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = 60;
      switch (e.key) {
        case 'ArrowLeft':  canvasState.x += step; break;
        case 'ArrowRight': canvasState.x -= step; break;
        case 'ArrowUp':    canvasState.y += step; break;
        case 'ArrowDown':  canvasState.y -= step; break;
      }
      return;
    }
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

  // Load shared schema from URL hash (#s=...) as a new project
  $effect(() => {
    const shareData = getShareDataFromUrl();
    if (!shareData) return;
    // Clear hash immediately to prevent re-triggering
    history.replaceState(null, '', window.location.pathname);

    (async () => {
      try {
        const { schema, projectName } = await shareStringToSchema(shareData);
        // Use embedded project name if available, otherwise derive from table names
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
        // Invalid share data — silently ignore
      }
    })();
  });
</script>

{#if !projectStore.initialized}
  <div class="app-loading">
    <div class="loading-spinner"></div>
  </div>
{:else if isMobile && !forceDesktop}
  <div class="mobile-notice">
    <div class="mobile-card">
      <svg class="mobile-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="10" width="35" height="30" rx="4" fill="none" stroke="#60a5fa" stroke-width="2.5"/>
        <line x1="5" y1="20" x2="40" y2="20" stroke="#60a5fa" stroke-width="2" opacity="0.5"/>
        <rect x="60" y="10" width="35" height="24" rx="4" fill="none" stroke="#34d399" stroke-width="2.5"/>
        <line x1="60" y1="20" x2="95" y2="20" stroke="#34d399" stroke-width="2" opacity="0.5"/>
        <rect x="30" y="60" width="40" height="30" rx="4" fill="none" stroke="#f472b6" stroke-width="2.5"/>
        <line x1="30" y1="70" x2="70" y2="70" stroke="#f472b6" stroke-width="2" opacity="0.5"/>
        <line x1="40" y1="40" x2="68" y2="60" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 2"/>
        <line x1="22" y1="40" x2="42" y2="60" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 2"/>
        <circle cx="68" cy="60" r="3" fill="#94a3b8"/>
        <circle cx="42" cy="60" r="3" fill="#94a3b8"/>
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
          <RelationLines />
          {#each erdStore.schema.tables as table (table.id)}
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
      {#if erdStore.storageFull && !storageBannerDismissed}
        <div class="storage-banner">
          <span class="storage-msg">{m.storage_full_warning()}</span>
          <button class="storage-export-btn" onclick={() => {
            const blob = new Blob([JSON.stringify($state.snapshot(erdStore.schema), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'erdmini-backup.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>{m.storage_full_export()}</button>
          <button class="storage-close-btn" onclick={() => (storageBannerDismissed = true)}>✕</button>
        </div>
      {/if}
      <Toolbar onfullscreen={enterFullscreen} />
      <div class="main">
        <Sidebar collapsed={sidebarCollapsed} ontoggle={toggleSidebar} onbulkedit={() => (showBulkEditModal = true)} />
        <Canvas>
          <RelationLines />
          {#each erdStore.schema.tables as table (table.id)}
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
    display: flex;
    flex: 1;
    overflow: hidden;
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

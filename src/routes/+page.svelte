<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import ColumnEditPopup from '$lib/components/ColumnEditPopup.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import TableEditor from '$lib/components/TableEditor.svelte';
  import DialogModal from '$lib/components/DialogModal.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import type { ERDSchema } from '$lib/types/erd';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { scale, fade } from 'svelte/transition';
  import * as m from '$lib/paraglide/messages';

  let sidebarCollapsed = $state(false);
  let commandPaletteOpen = $state(false);
  let viewportWidth = $state(768);
  let forceDesktop = $state(false);
  let isMobile = $derived(viewportWidth < 768);
  let storageBannerDismissed = $state(false);

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

    // Position changes (layout)
    for (const ct2 of ct) {
      const pt2 = pt.find((t) => t.id === ct2.id);
      if (pt2 && (pt2.position.x !== ct2.position.x || pt2.position.y !== ct2.position.y)) {
        return { label: 'history_layout', detail: '' };
      }
    }

    return { label: 'history_edit', detail: '' };
  }

  // Auto-save to localStorage and push undo snapshot whenever schema changes
  // prevSchemaSnap captures the state BEFORE the mutation so undo restores the correct state
  let prevUpdatedAt = $state(erdStore.schema.updatedAt);
  let prevSchemaSnap: string = JSON.stringify($state.snapshot(erdStore.schema));
  $effect(() => {
    const cur = erdStore.schema.updatedAt;
    if (cur !== prevUpdatedAt) {
      if (erdStore._isUndoRedoing) {
        // Undo/redo triggered this change — don't push, just reset flag
        erdStore._isUndoRedoing = false;
      } else {
        // Normal mutation — push the PREVIOUS state (before this change)
        const prevSchema: ERDSchema = JSON.parse(prevSchemaSnap);
        const curSchema = $state.snapshot(erdStore.schema) as ERDSchema;
        const { label, detail } = deriveLabel(prevSchema, curSchema);
        erdStore.pushSnapshotRaw(prevSchemaSnap, label, detail);
      }
      prevUpdatedAt = cur;
    }
    // Always capture current state for next mutation
    prevSchemaSnap = JSON.stringify($state.snapshot(erdStore.schema));
    erdStore.saveToStorage();
  });

  // Keyboard shortcuts
  async function handleKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();

    // Cmd+K: toggle command palette (works even when editing)
    if ((e.ctrlKey || e.metaKey) && key === 'k') {
      e.preventDefault();
      commandPaletteOpen = !commandPaletteOpen;
      return;
    }

    const tag = (e.target as HTMLElement)?.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA';

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

    // Escape: deselect
    if (e.key === 'Escape' && !isEditing) {
      erdStore.selectedTableId = null;
      erdStore.selectedTableIds = new Set();
      return;
    }

    // Delete selected table(s)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
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
</script>

{#if isMobile && !forceDesktop}
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
  <div class="app">
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
    <Toolbar />
    <div class="main">
      <Sidebar collapsed={sidebarCollapsed} ontoggle={() => (sidebarCollapsed = !sidebarCollapsed)} />
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

    {#if commandPaletteOpen}
      <CommandPalette onclose={() => (commandPaletteOpen = false)} />
    {/if}

    <DialogModal />
  </div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
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
</style>

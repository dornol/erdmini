<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import ColumnEditPopup from '$lib/components/ColumnEditPopup.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import TableEditor from '$lib/components/TableEditor.svelte';
  import DialogModal from '$lib/components/DialogModal.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import type { ERDSchema } from '$lib/types/erd';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';

  let sidebarCollapsed = $state(false);

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
    const tag = (e.target as HTMLElement)?.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA';

    // Undo/Redo
    const key = e.key.toLowerCase();
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
  }

  $effect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="app">
  <Toolbar />
  <div class="main">
    <Sidebar collapsed={sidebarCollapsed} ontoggle={() => (sidebarCollapsed = !sidebarCollapsed)} />
    <Canvas>
      <RelationLines />
      {#each erdStore.schema.tables as table (table.id)}
        <TableCard {table} />
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

  <DialogModal />
</div>

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
</style>

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
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';

  let sidebarCollapsed = $state(false);

  // Auto-save to localStorage and push undo snapshot whenever schema changes
  let prevUpdatedAt = $state(erdStore.schema.updatedAt);
  $effect(() => {
    const cur = erdStore.schema.updatedAt;
    if (cur !== prevUpdatedAt) {
      erdStore.pushSnapshot();
      prevUpdatedAt = cur;
    }
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

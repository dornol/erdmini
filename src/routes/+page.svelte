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

  // Undo/Redo keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      if (e.shiftKey) {
        erdStore.redo();
      } else {
        erdStore.undo();
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

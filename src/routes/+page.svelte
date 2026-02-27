<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import TableEditor from '$lib/components/TableEditor.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import { erdStore } from '$lib/store/erd.svelte';
</script>

<div class="app">
  <Toolbar />
  <div class="main">
    <Sidebar />
    <Canvas>
      <RelationLines />
      {#each erdStore.schema.tables as table (table.id)}
        <TableCard {table} />
      {/each}
    </Canvas>
    <TableEditor />
  </div>
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

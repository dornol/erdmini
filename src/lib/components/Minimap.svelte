<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';

  const MAP_W = 180;
  const MAP_H = 120;
  const TABLE_W = 200;
  const HEADER_H = 37;
  const ROW_H = 26;
  const PAD = 40;

  let viewportEl: HTMLDivElement | undefined = $state(undefined);

  // Compute bounding box of all tables
  const bounds = $derived(() => {
    const tables = erdStore.schema.tables;
    if (tables.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tables) {
      const h = HEADER_H + t.columns.length * ROW_H;
      minX = Math.min(minX, t.position.x);
      minY = Math.min(minY, t.position.y);
      maxX = Math.max(maxX, t.position.x + TABLE_W);
      maxY = Math.max(maxY, t.position.y + h);
    }
    return {
      minX: minX - PAD,
      minY: minY - PAD,
      maxX: maxX + PAD,
      maxY: maxY + PAD,
    };
  });

  const worldW = $derived(bounds().maxX - bounds().minX);
  const worldH = $derived(bounds().maxY - bounds().minY);
  const mapScale = $derived(Math.min(MAP_W / worldW, MAP_H / worldH));

  function worldToMap(wx: number, wy: number) {
    return {
      x: (wx - bounds().minX) * mapScale,
      y: (wy - bounds().minY) * mapScale,
    };
  }

  // Viewport rect in minimap coords
  const viewportRect = $derived(() => {
    if (!viewportEl) return { x: 0, y: 0, w: MAP_W, h: MAP_H };
    const rect = viewportEl.parentElement?.getBoundingClientRect() ?? { width: 800, height: 600 };
    // Viewport in world coords
    const vx = -canvasState.x / canvasState.scale;
    const vy = -canvasState.y / canvasState.scale;
    const vw = rect.width / canvasState.scale;
    const vh = rect.height / canvasState.scale;
    const mp = worldToMap(vx, vy);
    return {
      x: mp.x,
      y: mp.y,
      w: vw * mapScale,
      h: vh * mapScale,
    };
  });

  function onMinimapClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Convert minimap coords to world coords
    const wx = mx / mapScale + bounds().minX;
    const wy = my / mapScale + bounds().minY;
    // Center viewport on this world point
    const parent = viewportEl?.parentElement?.getBoundingClientRect() ?? { width: 800, height: 600 };
    canvasState.x = -wx * canvasState.scale + parent.width / 2;
    canvasState.y = -wy * canvasState.scale + parent.height / 2;
  }
</script>

<div class="minimap-wrap" bind:this={viewportEl}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="minimap"
    style="width:{MAP_W}px; height:{MAP_H}px;"
    onclick={onMinimapClick}
  >
    {#each erdStore.schema.tables as table (table.id)}
      {@const pos = worldToMap(table.position.x, table.position.y)}
      {@const h = (HEADER_H + table.columns.length * ROW_H) * mapScale}
      <div
        class="mini-table"
        class:active={erdStore.selectedTableIds.has(table.id)}
        style="left:{pos.x}px; top:{pos.y}px; width:{TABLE_W * mapScale}px; height:{h}px;"
      ></div>
    {/each}
    <div
      class="mini-viewport"
      style="left:{viewportRect().x}px; top:{viewportRect().y}px; width:{viewportRect().w}px; height:{viewportRect().h}px;"
    ></div>
  </div>
</div>

<style>
  .minimap-wrap {
    position: absolute;
    bottom: 52px;
    right: 16px;
    z-index: 100;
  }

  .minimap {
    position: relative;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    cursor: pointer;
  }

  .mini-table {
    position: absolute;
    background: #93c5fd;
    border: 0.5px solid #3b82f6;
    border-radius: 1px;
    min-width: 2px;
    min-height: 2px;
  }

  .mini-table.active {
    background: #3b82f6;
  }

  .mini-viewport {
    position: absolute;
    border: 1.5px solid #f97316;
    background: rgba(249, 115, 22, 0.08);
    border-radius: 1px;
    pointer-events: none;
  }
</style>

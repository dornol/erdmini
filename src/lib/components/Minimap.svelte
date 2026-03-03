<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { HEADER_H, ROW_H } from '$lib/constants/layout';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import { getEffectiveColor } from '$lib/utils/table-color';
  import type { Table } from '$lib/types/erd';

  function getFilteredColumnCount(t: Table): number {
    const mode = canvasState.columnDisplayMode;
    if (mode === 'all' || mode === 'names-only') return t.columns.length;
    const fkColIds = new Set(t.foreignKeys.flatMap((fk) => fk.columnIds));
    return t.columns.filter((c) => c.primaryKey || fkColIds.has(c.id)).length;
  }

  const MAP_W = 180;
  const MAP_H = 120;
  const PAD = 40;

  let viewportEl: HTMLDivElement | undefined = $state(undefined);

  // Throttled render state — updates at most once per rAF
  let renderTick = $state(0);
  let rafPending = false;

  $effect(() => {
    // Track reactive deps: canvas position/scale and table positions
    void canvasState.x;
    void canvasState.y;
    void canvasState.scale;
    void erdStore.schema.tables;
    void erdStore.selectedTableIds;
    // Schedule one update per frame
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        renderTick++;
      });
    }
  });

  // All minimap computations depend on renderTick (throttled)
  const bounds = $derived.by(() => {
    void renderTick;
    const tables = erdStore.schema.tables;
    if (tables.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tables) {
      const h = HEADER_H + getFilteredColumnCount(t) * ROW_H;
      minX = Math.min(minX, t.position.x);
      minY = Math.min(minY, t.position.y);
      maxX = Math.max(maxX, t.position.x + canvasState.getTableW(t.id));
      maxY = Math.max(maxY, t.position.y + h);
    }
    return {
      minX: minX - PAD,
      minY: minY - PAD,
      maxX: maxX + PAD,
      maxY: maxY + PAD,
    };
  });

  const worldW = $derived(bounds.maxX - bounds.minX);
  const worldH = $derived(bounds.maxY - bounds.minY);
  const mapScale = $derived(Math.min(MAP_W / worldW, MAP_H / worldH));

  function worldToMap(wx: number, wy: number) {
    return {
      x: (wx - bounds.minX) * mapScale,
      y: (wy - bounds.minY) * mapScale,
    };
  }

  const viewportRect = $derived.by(() => {
    void renderTick;
    if (!viewportEl) return { x: 0, y: 0, w: MAP_W, h: MAP_H };
    const rect = viewportEl.parentElement?.getBoundingClientRect() ?? { width: 800, height: 600 };
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

  // Table positions for minimap (throttled)
  const miniTables = $derived.by(() => {
    void renderTick;
    return erdStore.schema.tables.map((t) => {
      const colorId = getEffectiveColor(t, erdStore.schema);
      const colorEntry = colorId ? TABLE_COLORS[colorId] : null;
      return {
        id: t.id,
        ...worldToMap(t.position.x, t.position.y),
        w: canvasState.getTableW(t.id) * mapScale,
        h: (HEADER_H + getFilteredColumnCount(t) * ROW_H) * mapScale,
        active: erdStore.selectedTableIds.has(t.id),
        dotColor: colorEntry?.dot ?? null,
      };
    });
  });

  function onMinimapClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = mx / mapScale + bounds.minX;
    const wy = my / mapScale + bounds.minY;
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
    {#each miniTables as mt (mt.id)}
      <div
        class="mini-table"
        class:active={mt.active}
        style="left:{mt.x}px; top:{mt.y}px; width:{mt.w}px; height:{mt.h}px;{mt.dotColor ? ` background:${mt.dotColor}` : ''}"
      ></div>
    {/each}
    <div
      class="mini-viewport"
      style="left:{viewportRect.x}px; top:{viewportRect.y}px; width:{viewportRect.w}px; height:{viewportRect.h}px;"
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
    background: var(--erd-minimap-bg);
    border: 1px solid var(--erd-minimap-border);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    cursor: pointer;
  }

  .mini-table {
    position: absolute;
    background: var(--erd-minimap-table);
    border: 0.5px solid var(--erd-minimap-table-border);
    border-radius: 1px;
    min-width: 2px;
    min-height: 2px;
  }

  .mini-table.active {
    background: var(--erd-minimap-table-active);
  }

  .mini-viewport {
    position: absolute;
    border: 1.5px solid #f97316;
    background: rgba(249, 115, 22, 0.08);
    border-radius: 1px;
    pointer-events: none;
  }
</style>

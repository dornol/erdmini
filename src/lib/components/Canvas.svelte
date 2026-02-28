<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import Minimap from './Minimap.svelte';

  let { children } = $props();

  let viewportEl: HTMLDivElement;
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };

  function onWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = viewportEl.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(3, Math.max(0.2, canvasState.scale * factor));

    // Keep cursor position fixed in world space
    canvasState.x = cursorX - (cursorX - canvasState.x) * (newScale / canvasState.scale);
    canvasState.y = cursorY - (cursorY - canvasState.y) * (newScale / canvasState.scale);
    canvasState.scale = newScale;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    // Only pan on background clicks (target is viewport or world div)
    const target = e.target as HTMLElement;
    if (target !== viewportEl && !target.classList.contains('canvas-world')) return;

    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    isPanning = true;
    panStart = { x: e.clientX - canvasState.x, y: e.clientY - canvasState.y };
  }

  function onMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    canvasState.x = e.clientX - panStart.x;
    canvasState.y = e.clientY - panStart.y;
  }

  function onMouseUp() {
    isPanning = false;
  }

  function resetView() {
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
  }

  $effect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-viewport"
  bind:this={viewportEl}
  onwheel={onWheel}
  onmousedown={onMouseDown}
  style="cursor: {isPanning ? 'grabbing' : 'default'}"
>
  <div
    class="canvas-world"
    style="transform: translate({canvasState.x}px, {canvasState.y}px) scale({canvasState.scale}); transform-origin: 0 0;"
  >
    {@render children()}
  </div>

  {#if erdStore.schema.tables.length > 0}
    <Minimap />
  {/if}

  <!-- Zoom indicator -->
  <div class="zoom-indicator">
    <span>{Math.round(canvasState.scale * 100)}%</span>
    <button onclick={resetView}>리셋</button>
  </div>
</div>

<style>
  .canvas-viewport {
    position: relative;
    flex: 1;
    overflow: hidden;
    background-color: #f8fafc;
    background-image:
      radial-gradient(circle, #cbd5e1 1px, transparent 1px);
    background-size: 24px 24px;
  }

  .canvas-world {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
  }

  .zoom-indicator {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    color: #64748b;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .zoom-indicator button {
    font-size: 11px;
    color: #3b82f6;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .zoom-indicator button:hover {
    text-decoration: underline;
  }
</style>

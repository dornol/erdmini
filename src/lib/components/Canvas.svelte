<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import CanvasHistory from './CanvasHistory.svelte';
  import Minimap from './Minimap.svelte';
  import * as m from '$lib/paraglide/messages';

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
    // Right-click drag: pan without deselecting
    if (e.button === 2) {
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX - canvasState.x, y: e.clientY - canvasState.y };
      return;
    }

    if (e.button !== 0) return;
    // Only pan on background clicks (target is viewport or world div)
    const target = e.target as HTMLElement;
    if (target !== viewportEl && !target.classList.contains('canvas-world')) return;

    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    isPanning = true;
    panStart = { x: e.clientX - canvasState.x, y: e.clientY - canvasState.y };
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    canvasState.x = e.clientX - panStart.x;
    canvasState.y = e.clientY - panStart.y;
  }

  function onMouseUp() {
    isPanning = false;
  }

  $effect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

  function resetView() {
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-viewport"
  bind:this={viewportEl}
  onwheel={onWheel}
  onmousedown={onMouseDown}
  oncontextmenu={onContextMenu}
  data-theme={themeStore.current}
  style="cursor: {isPanning ? 'grabbing' : 'default'}"
>
  <div
    class="canvas-world"
    style="transform: translate({canvasState.x}px, {canvasState.y}px) scale({canvasState.scale}); transform-origin: 0 0;"
  >
    {@render children()}
  </div>

  <CanvasHistory />

  {#if erdStore.schema.tables.length > 0}
    <Minimap />
  {/if}

  <div class="zoom-indicator">
    <span class="zoom-pct">{Math.round(canvasState.scale * 100)}%</span>
    <button class="zoom-reset" onclick={resetView}>{m.zoom_reset()}</button>
  </div>

</div>

<style>
  /* ── Theme: Modern (default) ── */
  /* 둥근 모서리, 부드러운 그림자, 다크 헤더 */
  .canvas-viewport[data-theme="modern"] {
    --erd-canvas-bg: #f8fafc;
    --erd-canvas-dot: #cbd5e1;
    --erd-card-bg: white;
    --erd-card-border: #e2e8f0;
    --erd-card-border-width: 2px;
    --erd-card-radius: 8px;
    --erd-header-radius: 6px 6px 0 0;
    --erd-card-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    --erd-card-selected-border: #3b82f6;
    --erd-card-selected-glow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    --erd-header-bg: #1e293b;
    --erd-header-text: white;
    --erd-header-delete: rgba(255, 255, 255, 0.5);
    --erd-header-border-bottom: none;
    --erd-comment-bg: #f8fafc;
    --erd-comment-text: #64748b;
    --erd-comment-border: #e2e8f0;
    --erd-col-text: #1e293b;
    --erd-col-type: #64748b;
    --erd-col-hover: #f1f5f9;
    --erd-col-border: transparent;
    --erd-fk-highlight: #dbeafe;
    --erd-badge-pk-bg: #fef3c7;
    --erd-badge-pk-border: #f59e0b;
    --erd-badge-pk-text: #92400e;
    --erd-badge-fk-bg: #dbeafe;
    --erd-badge-fk-border: #93c5fd;
    --erd-badge-fk-text: #1e40af;
    --erd-badge-uq-bg: #ede9fe;
    --erd-badge-uq-border: #c4b5fd;
    --erd-badge-uq-text: #6d28d9;
    --erd-badge-ai-bg: #d1fae5;
    --erd-badge-ai-border: #6ee7b7;
    --erd-badge-ai-text: #065f46;
    --erd-badge-radius: 3px;
    --erd-no-col-text: #94a3b8;
    --erd-line-color: #94a3b8;
    --erd-line-hover: #3b82f6;
    --erd-minimap-bg: rgba(255, 255, 255, 0.9);
    --erd-minimap-border: #e2e8f0;
    --erd-minimap-table: #93c5fd;
    --erd-minimap-table-border: #3b82f6;
    --erd-minimap-table-active: #3b82f6;
    --erd-zoom-bg: white;
    --erd-zoom-border: #e2e8f0;
    --erd-zoom-text: #64748b;
    --erd-zoom-btn: #3b82f6;
    --erd-tt-bg: #1e293b;
    --erd-tt-text: #e2e8f0;
    --erd-tt-title: white;
    --erd-tt-border: #334155;
    --erd-tt-label: #94a3b8;
    --erd-tt-mono: #a5f3fc;
    --erd-tt-no: #f87171;
    --erd-tt-radius: 8px;
    --erd-tt-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    --erd-tt-badge-pk: #f59e0b;
    --erd-tt-badge-fk: #3b82f6;
    --erd-tt-badge-uq: #8b5cf6;
    --erd-tt-badge-ai: #10b981;
    --erd-tt-badge-text: white;
  }

  /* ── Theme: Classic ── */
  /* 각진 모서리, 종이 톤, 고전 ERD 느낌 */
  .canvas-viewport[data-theme="classic"] {
    --erd-canvas-bg: #f5f0e4;
    --erd-canvas-dot: #d4c9b8;
    --erd-card-bg: #fdfaf3;
    --erd-card-border: #b8a080;
    --erd-card-border-width: 1.5px;
    --erd-card-radius: 1px;
    --erd-header-radius: 0;
    --erd-card-shadow: 1px 2px 0 rgba(120, 80, 20, 0.12);
    --erd-card-selected-border: #8b6914;
    --erd-card-selected-glow: 0 0 0 2px rgba(139, 105, 20, 0.3);
    --erd-header-bg: #5c4023;
    --erd-header-text: #fef3c7;
    --erd-header-delete: rgba(254, 243, 199, 0.5);
    --erd-header-border-bottom: 2px solid #3e2c1a;
    --erd-comment-bg: #f5efe3;
    --erd-comment-text: #8b7355;
    --erd-comment-border: #d4c4a8;
    --erd-col-text: #3e2c1a;
    --erd-col-type: #8b7355;
    --erd-col-hover: #f0e8d8;
    --erd-col-border: #e8dcc8;
    --erd-fk-highlight: #e8dcc8;
    --erd-badge-pk-bg: #fef3c7;
    --erd-badge-pk-border: #d4a017;
    --erd-badge-pk-text: #7c5e10;
    --erd-badge-fk-bg: #e8dcc8;
    --erd-badge-fk-border: #b8a080;
    --erd-badge-fk-text: #5c4a30;
    --erd-badge-uq-bg: #f0e6f6;
    --erd-badge-uq-border: #c9a8d8;
    --erd-badge-uq-text: #6b3a80;
    --erd-badge-ai-bg: #dce8d0;
    --erd-badge-ai-border: #8faa70;
    --erd-badge-ai-text: #3a5020;
    --erd-badge-radius: 1px;
    --erd-no-col-text: #b0a08a;
    --erd-line-color: #b0a08a;
    --erd-line-hover: #8b6914;
    --erd-minimap-bg: rgba(245, 240, 228, 0.92);
    --erd-minimap-border: #d4c4a8;
    --erd-minimap-table: #d4b88c;
    --erd-minimap-table-border: #a0845c;
    --erd-minimap-table-active: #8b6914;
    --erd-zoom-bg: #fdfaf3;
    --erd-zoom-border: #d4c4a8;
    --erd-zoom-text: #8b7355;
    --erd-zoom-btn: #8b6914;
    --erd-tt-bg: #fdfaf3;
    --erd-tt-text: #5c4a30;
    --erd-tt-title: #3e2c1a;
    --erd-tt-border: #d4c4a8;
    --erd-tt-label: #8b7355;
    --erd-tt-mono: #6b4c2a;
    --erd-tt-no: #c0392b;
    --erd-tt-radius: 1px;
    --erd-tt-shadow: 2px 3px 0 rgba(100, 70, 20, 0.18);
    --erd-tt-badge-pk: #d4a017;
    --erd-tt-badge-fk: #8b7355;
    --erd-tt-badge-uq: #8b5ca0;
    --erd-tt-badge-ai: #5a8a3a;
    --erd-tt-badge-text: white;
  }

  /* ── Theme: Blueprint ── */
  /* 직각, 얇은 윤곽선, 설계도 스타일 */
  .canvas-viewport[data-theme="blueprint"] {
    --erd-canvas-bg: #0c1a30;
    --erd-canvas-dot: #1a3050;
    --erd-card-bg: rgba(16, 36, 66, 0.85);
    --erd-card-border: #2a5a8f;
    --erd-card-border-width: 1px;
    --erd-card-radius: 0;
    --erd-header-radius: 0;
    --erd-card-shadow: none;
    --erd-card-selected-border: #60a5fa;
    --erd-card-selected-glow: 0 0 8px rgba(96, 165, 250, 0.35);
    --erd-header-bg: #1a4070;
    --erd-header-text: #93c5fd;
    --erd-header-delete: rgba(147, 197, 253, 0.5);
    --erd-header-border-bottom: 1px solid #2a5a8f;
    --erd-comment-bg: rgba(15, 30, 55, 0.6);
    --erd-comment-text: #5a90c0;
    --erd-comment-border: #2a5a8f;
    --erd-col-text: #bfdbfe;
    --erd-col-type: #5a90c0;
    --erd-col-hover: rgba(30, 58, 95, 0.5);
    --erd-col-border: #1a3050;
    --erd-fk-highlight: rgba(42, 90, 143, 0.35);
    --erd-badge-pk-bg: rgba(250, 204, 21, 0.12);
    --erd-badge-pk-border: #ca8a04;
    --erd-badge-pk-text: #facc15;
    --erd-badge-fk-bg: rgba(96, 165, 250, 0.12);
    --erd-badge-fk-border: #3b82f6;
    --erd-badge-fk-text: #93c5fd;
    --erd-badge-uq-bg: rgba(167, 139, 250, 0.12);
    --erd-badge-uq-border: #7c3aed;
    --erd-badge-uq-text: #c4b5fd;
    --erd-badge-ai-bg: rgba(52, 211, 153, 0.12);
    --erd-badge-ai-border: #059669;
    --erd-badge-ai-text: #6ee7b7;
    --erd-badge-radius: 0;
    --erd-no-col-text: #3a6a9a;
    --erd-line-color: #3a7ac0;
    --erd-line-hover: #60a5fa;
    --erd-minimap-bg: rgba(12, 26, 48, 0.92);
    --erd-minimap-border: #2a5a8f;
    --erd-minimap-table: #2a5a8f;
    --erd-minimap-table-border: #3b82f6;
    --erd-minimap-table-active: #60a5fa;
    --erd-zoom-bg: #102442;
    --erd-zoom-border: #2a5a8f;
    --erd-zoom-text: #5a90c0;
    --erd-zoom-btn: #60a5fa;
    --erd-tt-bg: #0a1628;
    --erd-tt-text: #93c5fd;
    --erd-tt-title: #bfdbfe;
    --erd-tt-border: #1a3050;
    --erd-tt-label: #5a90c0;
    --erd-tt-mono: #7dd3fc;
    --erd-tt-no: #f87171;
    --erd-tt-radius: 0;
    --erd-tt-shadow: 0 0 12px rgba(42, 90, 143, 0.3);
    --erd-tt-badge-pk: #ca8a04;
    --erd-tt-badge-fk: #2563eb;
    --erd-tt-badge-uq: #6d28d9;
    --erd-tt-badge-ai: #047857;
    --erd-tt-badge-text: white;
  }

  /* ── Theme: Minimal ── */
  /* 약간 둥근, 최소 그림자, 깔끔한 라이트 톤 */
  .canvas-viewport[data-theme="minimal"] {
    --erd-canvas-bg: #fafafa;
    --erd-canvas-dot: #e5e5e5;
    --erd-card-bg: white;
    --erd-card-border: #e5e5e5;
    --erd-card-border-width: 1px;
    --erd-card-radius: 4px;
    --erd-header-radius: 3px 3px 0 0;
    --erd-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    --erd-card-selected-border: #737373;
    --erd-card-selected-glow: 0 0 0 2px rgba(115, 115, 115, 0.12);
    --erd-header-bg: #f5f5f5;
    --erd-header-text: #262626;
    --erd-header-delete: rgba(38, 38, 38, 0.35);
    --erd-header-border-bottom: 1px solid #e5e5e5;
    --erd-comment-bg: #fafafa;
    --erd-comment-text: #a3a3a3;
    --erd-comment-border: #e5e5e5;
    --erd-col-text: #262626;
    --erd-col-type: #a3a3a3;
    --erd-col-hover: #f5f5f5;
    --erd-col-border: transparent;
    --erd-fk-highlight: #ebebeb;
    --erd-badge-pk-bg: #f5f5f5;
    --erd-badge-pk-border: #d4d4d4;
    --erd-badge-pk-text: #525252;
    --erd-badge-fk-bg: #f5f5f5;
    --erd-badge-fk-border: #d4d4d4;
    --erd-badge-fk-text: #525252;
    --erd-badge-uq-bg: #f5f5f5;
    --erd-badge-uq-border: #d4d4d4;
    --erd-badge-uq-text: #525252;
    --erd-badge-ai-bg: #f5f5f5;
    --erd-badge-ai-border: #d4d4d4;
    --erd-badge-ai-text: #525252;
    --erd-badge-radius: 2px;
    --erd-no-col-text: #d4d4d4;
    --erd-line-color: #d4d4d4;
    --erd-line-hover: #737373;
    --erd-minimap-bg: rgba(255, 255, 255, 0.92);
    --erd-minimap-border: #e5e5e5;
    --erd-minimap-table: #d4d4d4;
    --erd-minimap-table-border: #a3a3a3;
    --erd-minimap-table-active: #737373;
    --erd-zoom-bg: white;
    --erd-zoom-border: #e5e5e5;
    --erd-zoom-text: #a3a3a3;
    --erd-zoom-btn: #737373;
    --erd-tt-bg: white;
    --erd-tt-text: #525252;
    --erd-tt-title: #262626;
    --erd-tt-border: #e5e5e5;
    --erd-tt-label: #a3a3a3;
    --erd-tt-mono: #525252;
    --erd-tt-no: #dc2626;
    --erd-tt-radius: 4px;
    --erd-tt-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    --erd-tt-badge-pk: #a3a3a3;
    --erd-tt-badge-fk: #a3a3a3;
    --erd-tt-badge-uq: #a3a3a3;
    --erd-tt-badge-ai: #a3a3a3;
    --erd-tt-badge-text: white;
  }

  .canvas-viewport {
    position: relative;
    flex: 1;
    overflow: hidden;
    background-color: var(--erd-canvas-bg);
    background-image:
      radial-gradient(circle, var(--erd-canvas-dot) 1px, transparent 1px);
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
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--erd-zoom-bg);
    border: 1px solid var(--erd-zoom-border);
    border-radius: 6px;
    padding: 2px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .zoom-pct {
    font-size: 11px;
    font-weight: 600;
    color: var(--erd-zoom-text);
    padding: 0 8px;
    min-width: 36px;
    text-align: center;
    user-select: none;
  }

  .zoom-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 0 10px;
    border: none;
    background: transparent;
    color: var(--erd-zoom-btn);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .zoom-reset:hover {
    background: var(--erd-zoom-border);
  }

</style>

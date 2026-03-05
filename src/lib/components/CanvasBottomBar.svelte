<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType, LayoutOptions } from '$lib/utils/auto-layout';
  import { HEADER_H, ROW_H, COMMENT_H, BOTTOM_PAD } from '$lib/constants/layout';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { now } from '$lib/utils/common';
  import * as m from '$lib/paraglide/messages';

  let activeDropdown = $state<'layout' | 'align' | null>(null);
  function toggleDropdown(id: 'layout' | 'align') { activeDropdown = activeDropdown === id ? null : id; }
  function closeDropdown() { activeDropdown = null; }
  let layoutOpen = $derived(activeDropdown === 'layout');
  let alignOpen = $derived(activeDropdown === 'align');

  // Auto-arrange
  function applyLayout(type: LayoutType, options?: LayoutOptions) {
    const positions = computeLayout(erdStore.schema.tables, type, options);
    erdStore.applyLayout(positions);
  }

  const LAYOUT_TYPES: { type: LayoutType; label: () => string }[] = [
    { type: 'grid', label: () => m.layout_grid() },
    { type: 'hierarchical', label: () => m.layout_hierarchical() },
    { type: 'radial', label: () => m.layout_radial() },
  ];

  function tablesHaveGroups(): boolean {
    return erdStore.schema.tables.some((t) => t.group && t.group.length > 0);
  }

  // Align / distribute selected tables
  function getSelectedTables() {
    return erdStore.schema.tables.filter((t) => erdStore.selectedTableIds.has(t.id));
  }

  function tableHeight(t: { columns: { length: number }; comment?: string }): number {
    return HEADER_H + (t.comment ? COMMENT_H : 0) + t.columns.length * ROW_H + BOTTOM_PAD;
  }

  const ALIGN_GAP = 20;

  function alignTables(dir: 'left' | 'right' | 'top' | 'bottom') {
    const tables = getSelectedTables();
    if (tables.length < 2) return;

    const isHorizontal = dir === 'left' || dir === 'right';
    const sorted = [...tables].sort((a, b) =>
      isHorizontal ? a.position.y - b.position.y : a.position.x - b.position.x
    );

    let target: number;
    switch (dir) {
      case 'left': target = Math.min(...tables.map((t) => t.position.x)); break;
      case 'right': target = Math.max(...tables.map((t) => t.position.x + canvasState.getTableW(t.id))); break;
      case 'top': target = Math.min(...tables.map((t) => t.position.y)); break;
      case 'bottom': target = Math.max(...tables.map((t) => t.position.y + tableHeight(t))); break;
    }

    let cursor = isHorizontal
      ? Math.min(...sorted.map((t) => t.position.y))
      : Math.min(...sorted.map((t) => t.position.x));

    for (const t of sorted) {
      let x: number, y: number;
      switch (dir) {
        case 'left': x = target; y = cursor; break;
        case 'right': x = target - canvasState.getTableW(t.id); y = cursor; break;
        case 'top': x = cursor; y = target; break;
        case 'bottom': x = cursor; y = target - tableHeight(t); break;
      }
      erdStore.moveTable(t.id, x, y);
      cursor += (isHorizontal ? tableHeight(t) : canvasState.getTableW(t.id)) + ALIGN_GAP;
    }
    erdStore.schema.updatedAt = now();
  }

  function distributeTables(axis: 'h' | 'v') {
    const tables = getSelectedTables();
    if (tables.length < 3) return;
    if (axis === 'h') {
      const sorted = [...tables].sort((a, b) => a.position.x - b.position.x);
      const min = sorted[0].position.x;
      const max = sorted[sorted.length - 1].position.x;
      const step = (max - min) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        erdStore.moveTable(sorted[i].id, min + step * i, sorted[i].position.y);
      }
    } else {
      const sorted = [...tables].sort((a, b) => a.position.y - b.position.y);
      const min = sorted[0].position.y;
      const max = sorted[sorted.length - 1].position.y;
      const step = (max - min) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        erdStore.moveTable(sorted[i].id, sorted[i].position.x, min + step * i);
      }
    }
    erdStore.schema.updatedAt = now();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas-bottom-bar" class:disabled={permissionStore.isReadOnly}>
  <!-- Auto-layout dropdown -->
  <div class="bar-dropdown-wrap">
    <button
      class="bar-btn"
      onclick={() => toggleDropdown('layout')}
      aria-expanded={layoutOpen}
      aria-haspopup="menu"
      disabled={permissionStore.isReadOnly}
      title={m.toolbar_auto_layout()}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
        <rect x="10" y="1" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
        <rect x="5.5" y="11" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
        <line x1="3.5" y1="5" x2="3.5" y2="8" stroke="currentColor" stroke-width="1.2"/>
        <line x1="12.5" y1="5" x2="12.5" y2="8" stroke="currentColor" stroke-width="1.2"/>
        <line x1="3.5" y1="8" x2="12.5" y2="8" stroke="currentColor" stroke-width="1.2"/>
        <line x1="8" y1="8" x2="8" y2="11" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="bar-btn-label">{m.toolbar_auto_layout()}</span>
    </button>
    {#if layoutOpen}
      <div
        class="bar-dropdown-menu"
        role="menu"
        tabindex="-1"
        onmouseleave={() => closeDropdown()}
      >
        {#each LAYOUT_TYPES as { type, label }}
          <button
            class="bar-dropdown-item"
            role="menuitem"
            onclick={() => { applyLayout(type); closeDropdown(); }}
          >
            {label()}
          </button>
        {/each}
        {#if tablesHaveGroups()}
          <div class="bar-dropdown-divider" role="separator"></div>
          <div class="bar-dropdown-section-label">{m.layout_by_group()}</div>
          {#each LAYOUT_TYPES as { type, label }}
            <button
              class="bar-dropdown-item"
              role="menuitem"
              onclick={() => { applyLayout(type, { groupByGroup: true }); closeDropdown(); }}
            >
              {label()}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <span class="bar-sep"></span>

  <!-- Show/hide grid toggle -->
  <button
    class="bar-btn bar-btn-icon"
    class:bar-btn-active={canvasState.showGrid}
    onclick={() => (canvasState.showGrid = !canvasState.showGrid)}
    title={canvasState.showGrid ? m.grid_hide() : m.grid_show()}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
      <line x1="0.5" y1="5" x2="15.5" y2="5"/>
      <line x1="0.5" y1="11" x2="15.5" y2="11"/>
      <line x1="5" y1="0.5" x2="5" y2="15.5"/>
      <line x1="11" y1="0.5" x2="11" y2="15.5"/>
    </svg>
  </button>

  <!-- Snap to grid toggle -->
  <button
    class="bar-btn bar-btn-icon"
    class:bar-btn-active={canvasState.snapToGrid}
    onclick={() => (canvasState.snapToGrid = !canvasState.snapToGrid)}
    title={canvasState.snapToGrid ? 'Snap: ON' : 'Snap: OFF'}
    disabled={permissionStore.isReadOnly}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="9" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="1" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="9" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
  </button>

  <!-- Align/Distribute (visible when 2+ selected) -->
  {#if erdStore.selectedTableIds.size >= 2}
    <span class="bar-sep"></span>

    <div class="bar-dropdown-wrap">
      <button
        class="bar-btn bar-btn-icon"
        onclick={() => toggleDropdown('align')}
        title="Align / Distribute"
        disabled={permissionStore.isReadOnly}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <line x1="2" y1="1" x2="2" y2="15" stroke="currentColor" stroke-width="1.5"/>
          <rect x="5" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
          <rect x="5" y="10" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
        </svg>
      </button>
      {#if alignOpen}
        <div class="bar-dropdown-menu" role="menu" tabindex="-1" onmouseleave={() => closeDropdown()}>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('left'); closeDropdown(); }}>Align Left</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('right'); closeDropdown(); }}>Align Right</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('top'); closeDropdown(); }}>Align Top</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('bottom'); closeDropdown(); }}>Align Bottom</button>
          {#if erdStore.selectedTableIds.size >= 3}
            <div class="bar-dropdown-divider"></div>
            <button class="bar-dropdown-item" role="menuitem" onclick={() => { distributeTables('h'); closeDropdown(); }}>Distribute H</button>
            <button class="bar-dropdown-item" role="menuitem" onclick={() => { distributeTables('v'); closeDropdown(); }}>Distribute V</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .canvas-bottom-bar {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
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

  .canvas-bottom-bar.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .bar-dropdown-wrap {
    position: relative;
  }

  .bar-btn {
    display: flex;
    align-items: center;
    gap: 5px;
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
    white-space: nowrap;
  }

  .bar-btn:hover {
    background: var(--erd-zoom-border);
  }

  .bar-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .bar-btn-icon {
    padding: 0 7px;
    justify-content: center;
  }

  .bar-btn-active {
    background: var(--erd-zoom-btn);
    color: var(--erd-zoom-bg);
  }

  .bar-btn-active:hover {
    background: var(--erd-zoom-btn);
    opacity: 0.9;
  }

  .bar-btn-label {
    user-select: none;
  }

  .bar-sep {
    width: 1px;
    height: 16px;
    background: var(--erd-zoom-border);
    flex-shrink: 0;
  }

  .bar-dropdown-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--erd-zoom-bg);
    border: 1px solid var(--erd-zoom-border);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.12);
    min-width: 120px;
    z-index: 200;
  }

  .bar-dropdown-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: var(--erd-zoom-text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
  }

  .bar-dropdown-item:hover {
    background: var(--erd-zoom-border);
    color: var(--erd-zoom-btn);
  }

  .bar-dropdown-divider {
    height: 1px;
    background: var(--erd-zoom-border);
    margin: 4px 0;
  }

  .bar-dropdown-section-label {
    padding: 4px 12px 2px;
    font-size: 10px;
    font-weight: 600;
    color: var(--erd-zoom-text);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>

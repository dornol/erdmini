<script lang="ts">
  import { erdStore, canvasState, type ColumnDisplayMode, type LineType } from '$lib/store/erd.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType, LayoutOptions } from '$lib/utils/auto-layout';
  import { HEADER_H, ROW_H, COMMENT_H, BOTTOM_PAD } from '$lib/constants/layout';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { themeStore, type ThemeId } from '$lib/store/theme.svelte';
  import { now } from '$lib/utils/common';
  import { toastStore } from '$lib/store/toast.svelte';
  import * as m from '$lib/paraglide/messages';

  let { onfullscreen, fullscreenMode = false }: { onfullscreen?: () => void; fullscreenMode?: boolean } = $props();

  type BarDropdown = 'layout' | 'columns' | 'lines' | 'align' | 'theme';
  let activeDropdown = $state<BarDropdown | null>(null);
  function toggleDropdown(id: BarDropdown) { activeDropdown = activeDropdown === id ? null : id; }
  function closeDropdown() { activeDropdown = null; }
  let layoutOpen = $derived(activeDropdown === 'layout');
  let columnsOpen = $derived(activeDropdown === 'columns');
  let linesOpen = $derived(activeDropdown === 'lines');
  let alignOpen = $derived(activeDropdown === 'align');
  let themeOpen = $derived(activeDropdown === 'theme');

  const THEMES: { id: ThemeId; label: () => string; dot: string }[] = [
    { id: 'modern',    label: () => m.theme_modern(),    dot: '#1e293b' },
    { id: 'classic',   label: () => m.theme_classic(),   dot: '#6b4c2a' },
    { id: 'blueprint', label: () => m.theme_blueprint(), dot: '#1e4a7a' },
    { id: 'minimal',   label: () => m.theme_minimal(),   dot: '#f0f0f0' },
  ];

  const VIEW_MODES: { mode: ColumnDisplayMode; label: () => string; short: () => string }[] = [
    { mode: 'all', label: () => m.view_mode_all(), short: () => m.view_mode_all() },
    { mode: 'pk-fk-only', label: () => m.view_mode_pk_fk(), short: () => 'PK/FK' },
    { mode: 'names-only', label: () => m.view_mode_names_only(), short: () => m.view_mode_names_only() },
  ];

  const LINE_TYPES: { type: LineType; label: () => string }[] = [
    { type: 'bezier', label: () => m.line_type_bezier() },
    { type: 'orthogonal', label: () => m.line_type_orthogonal() },
    { type: 'rounded', label: () => m.line_type_rounded() },
  ];

  let currentViewLabel = $derived(VIEW_MODES.find(v => v.mode === canvasState.columnDisplayMode)?.short() ?? '');
  let currentLineLabel = $derived(LINE_TYPES.find(l => l.type === canvasState.lineType)?.label() ?? '');

  // Auto-arrange. Locked tables are excluded from layout input (their positions
  // stay put) and erdStore.applyLayout also skips them defensively.
  function applyLayout(type: LayoutType, options?: LayoutOptions) {
    const movable = erdStore.schema.tables.filter((t) => !t.locked);
    if (movable.length === 0) return;
    const positions = computeLayout(movable, type, options);
    erdStore.applyLayout(positions);
    toastStore.success(m.toast_layout_applied());
  }

  const LAYOUT_TYPES: { type: LayoutType; label: () => string }[] = [
    { type: 'grid', label: () => m.layout_grid() },
    { type: 'hierarchical', label: () => m.layout_hierarchical() },
    { type: 'radial', label: () => m.layout_radial() },
    { type: 'radial-tree', label: () => m.layout_radial_tree() },
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
<div class="canvas-bottom-bar">
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

  <!-- Column display mode dropdown -->
  <div class="bar-dropdown-wrap">
    <button
      class="bar-btn"
      onclick={() => toggleDropdown('columns')}
      aria-expanded={columnsOpen}
      aria-haspopup="menu"
      title={m.view_mode_title()}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
        <rect x="1" y="2" width="14" height="3" rx="0.5"/>
        <rect x="1" y="7" width="14" height="3" rx="0.5"/>
        <rect x="1" y="12" width="14" height="3" rx="0.5" opacity="0.4"/>
      </svg>
      <span class="bar-btn-label">{currentViewLabel}</span>
    </button>
    {#if columnsOpen}
      <div class="bar-dropdown-menu" role="menu" tabindex="-1" onmouseleave={() => closeDropdown()}>
        {#each VIEW_MODES as vm}
          <button
            class="bar-dropdown-item"
            class:bar-dropdown-item-active={canvasState.columnDisplayMode === vm.mode}
            role="menuitem"
            onclick={() => { canvasState.columnDisplayMode = vm.mode; closeDropdown(); }}
          >
            {vm.label()}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Line style dropdown -->
  <div class="bar-dropdown-wrap">
    <button
      class="bar-btn"
      onclick={() => toggleDropdown('lines')}
      aria-expanded={linesOpen}
      aria-haspopup="menu"
      title={m.line_type_title()}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M2 14 C2 6, 14 10, 14 2"/>
      </svg>
      <span class="bar-btn-label">{currentLineLabel}</span>
    </button>
    {#if linesOpen}
      <div class="bar-dropdown-menu" role="menu" tabindex="-1" onmouseleave={() => closeDropdown()}>
        {#each LINE_TYPES as lt}
          <button
            class="bar-dropdown-item"
            class:bar-dropdown-item-active={canvasState.lineType === lt.type}
            role="menuitem"
            onclick={() => { canvasState.lineType = lt.type; closeDropdown(); }}
          >
            {lt.label()}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <span class="bar-sep"></span>

  <!-- Show/hide relation lines toggle -->
  <button
    class="bar-btn bar-btn-icon"
    class:bar-btn-active={canvasState.showRelationLines}
    onclick={() => (canvasState.showRelationLines = !canvasState.showRelationLines)}
    title={canvasState.showRelationLines ? m.tooltip_hide_fk_lines() : m.tooltip_show_fk_lines()}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
      <path d="M2 12 C4 12, 12 4, 14 4"/>
      <circle cx="2" cy="12" r="2" fill="currentColor" stroke="none"/>
      <circle cx="14" cy="4" r="2" fill="currentColor" stroke="none"/>
    </svg>
  </button>

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
    title={canvasState.snapToGrid ? m.tooltip_snap_on() : m.tooltip_snap_off()}
    disabled={permissionStore.isReadOnly}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="9" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="1" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="9" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
  </button>

  <span class="bar-sep"></span>

  <!-- Theme dropdown -->
  <div class="bar-dropdown-wrap">
    <button
      class="bar-btn bar-btn-icon"
      onclick={() => toggleDropdown('theme')}
      aria-expanded={themeOpen}
      aria-haspopup="menu"
      title={m.toolbar_theme()}
    >
      <span class="theme-indicator" style="background:{THEMES.find(t => t.id === themeStore.current)?.dot ?? '#1e293b'}"></span>
    </button>
    {#if themeOpen}
      <div class="bar-dropdown-menu" role="menu" tabindex="-1" onmouseleave={() => closeDropdown()}>
        {#each THEMES as t}
          <button
            class="bar-dropdown-item"
            class:bar-dropdown-item-active={themeStore.current === t.id}
            role="menuitem"
            onclick={() => { themeStore.set(t.id); closeDropdown(); }}
          >
            <span class="theme-dot" style="background:{t.dot}"></span>
            {t.label()}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Align/Distribute (visible when 2+ selected) -->
  {#if erdStore.selectedTableIds.size >= 2}
    <span class="bar-sep"></span>

    <div class="bar-dropdown-wrap">
      <button
        class="bar-btn bar-btn-icon"
        onclick={() => toggleDropdown('align')}
        title={m.tooltip_align_distribute()}
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
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('left'); closeDropdown(); }}>{m.align_left()}</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('right'); closeDropdown(); }}>{m.align_right()}</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('top'); closeDropdown(); }}>{m.align_top()}</button>
          <button class="bar-dropdown-item" role="menuitem" onclick={() => { alignTables('bottom'); closeDropdown(); }}>{m.align_bottom()}</button>
          {#if erdStore.selectedTableIds.size >= 3}
            <div class="bar-dropdown-divider"></div>
            <button class="bar-dropdown-item" role="menuitem" onclick={() => { distributeTables('h'); closeDropdown(); }}>{m.distribute_h()}</button>
            <button class="bar-dropdown-item" role="menuitem" onclick={() => { distributeTables('v'); closeDropdown(); }}>{m.distribute_v()}</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if onfullscreen}
    <span class="bar-sep"></span>

    <!-- Fullscreen / Present toggle -->
    <button
      class="bar-btn bar-btn-icon"
      class:bar-btn-active={fullscreenMode}
      onclick={() => onfullscreen?.()}
      title={fullscreenMode ? m.fullscreen_exit() : m.toolbar_fullscreen()}
    >
      {#if fullscreenMode}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <polyline points="5,1 5,5 1,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="11,1 11,5 15,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="15,11 11,11 11,15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="1,11 5,11 5,15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <polyline points="1,5 1,1 5,1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="11,1 15,1 15,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="15,11 15,15 11,15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="5,15 1,15 1,11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </button>
  {/if}
</div>

<style>
  .canvas-bottom-bar {
    position: fixed;
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

  .bar-dropdown-item-active {
    color: var(--erd-zoom-btn);
    font-weight: 600;
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

  .theme-indicator {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid var(--erd-zoom-border);
  }

  .theme-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
    margin-right: 6px;
    vertical-align: middle;
    flex-shrink: 0;
  }
</style>

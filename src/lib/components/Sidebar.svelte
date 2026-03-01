<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import type { TableColorId } from '$lib/constants/table-colors';
  import { themeStore } from '$lib/store/theme.svelte';

  let {
    collapsed = false,
    ontoggle,
  }: {
    collapsed?: boolean;
    ontoggle?: () => void;
  } = $props();

  let searchQuery = $state('');
  let sortBy = $state<'creation' | 'name'>('creation');
  let viewMode = $state<'flat' | 'group'>('flat');
  let collapsedGroups = $state<Set<string>>(new Set());
  let sidebarWidth = $state(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('erdmini_sidebar_width')) || 240
      : 240
  );
  let resizing = $state(false);

  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMove(ev: MouseEvent) {
      sidebarWidth = Math.max(180, Math.min(480, startWidth + ev.clientX - startX));
    }
    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      localStorage.setItem('erdmini_sidebar_width', String(sidebarWidth));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const filteredTables = $derived(() => {
    let tables = erdStore.schema.tables;

    // Search filter (matches table name or column names)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      tables = tables.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortBy === 'name') {
      tables = [...tables].sort((a, b) => a.name.localeCompare(b.name));
    }

    return tables;
  });

  const groupedTables = $derived.by(() => {
    const tables = filteredTables();
    const groups = new Map<string, typeof tables>();
    for (const t of tables) {
      const g = t.group || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(t);
    }
    // Sort group names, with ungrouped ('') last
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    return sortedKeys.map((key) => ({
      name: key,
      label: key || m.sidebar_ungrouped(),
      tables: groups.get(key)!,
    }));
  });

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups = next;
  }

  function getColorDot(color?: string): string | null {
    if (!color) return null;
    const entry = TABLE_COLORS[color as TableColorId];
    return entry?.dot ?? null;
  }

  let tooltip = $state<{ text: string; x: number; y: number } | null>(null);

  function showTooltip(e: MouseEvent, text: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltip = { text, x: rect.left, y: rect.bottom + 4 };
  }

  function hideTooltip() {
    tooltip = null;
  }

  function getTableMeta(table: typeof erdStore.schema.tables[0]) {
    const colCount = table.columns.length;
    const fkCount = table.foreignKeys.length;
    const pkCols = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
    const fkDetails = table.foreignKeys.map(fk => {
      const srcCols = fk.columnIds.map(id => table.columns.find(c => c.id === id)?.name ?? '?');
      const refTable = erdStore.schema.tables.find(t => t.id === fk.referencedTableId);
      const refCols = fk.referencedColumnIds.map(id => refTable?.columns.find(c => c.id === id)?.name ?? '?');
      const srcLabel = srcCols.length === 1 ? srcCols[0] : `(${srcCols.join(', ')})`;
      const refLabel = refCols.length === 1 ? refCols[0] : `(${refCols.join(', ')})`;
      return `${srcLabel} → ${refTable?.name ?? '?'}.${refLabel}`;
    });
    const refs = erdStore.schema.tables.flatMap(t =>
      t.foreignKeys
        .filter(fk => fk.referencedTableId === table.id)
        .map(fk => {
          const srcCols = fk.columnIds.map(id => t.columns.find(c => c.id === id)?.name ?? '?');
          const refCols = fk.referencedColumnIds.map(id => table.columns.find(c => c.id === id)?.name ?? '?');
          const srcLabel = srcCols.length === 1 ? srcCols[0] : `(${srcCols.join(', ')})`;
          const refLabel = refCols.length === 1 ? refCols[0] : `(${refCols.join(', ')})`;
          return `${t.name}.${srcLabel} → ${refLabel}`;
        })
    );
    return { colCount, fkCount, fkDetails, pkCols, refCount: refs.length, refDetails: refs };
  }

  function onItemClick(e: MouseEvent, tableId: string) {
    if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(erdStore.selectedTableIds);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      erdStore.selectedTableIds = newSet;
    } else {
      erdStore.selectedTableId = tableId;
      erdStore.selectedTableIds = new Set([tableId]);
      const table = erdStore.schema.tables.find(t => t.id === tableId);
      if (table) {
        const vp = document.querySelector('.canvas-viewport')?.getBoundingClientRect();
        const cx = table.position.x + 110;
        const cy = table.position.y + 50;
        canvasState.x = -cx * canvasState.scale + (vp?.width ?? 800) / 2;
        canvasState.y = -cy * canvasState.scale + (vp?.height ?? 600) / 2;
      }
    }
  }

  async function bulkDelete() {
    const ids = [...erdStore.selectedTableIds];
    if (ids.length < 2) return;
    const ok = await dialogStore.confirm(m.dialog_bulk_delete_confirm({ count: ids.length }), {
      title: m.dialog_delete_table_title(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteTables(ids);
  }

  function duplicateTable(e: MouseEvent, tableId: string) {
    e.stopPropagation();
    erdStore.duplicateTable(tableId);
  }
</script>

{#if collapsed}
  <button class="expand-btn" onclick={ontoggle} title={m.sidebar_expand()}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
{:else}
  <aside class="sidebar" class:resizing style="width:{sidebarWidth}px">
    <div class="sidebar-header">
      <span>{m.sidebar_title()}</span>
      <div class="header-right">
        {#if erdStore.selectedTableIds.size >= 2}
          <button class="bulk-delete-btn" onclick={bulkDelete}>
            {m.sidebar_bulk_delete({ count: erdStore.selectedTableIds.size })}
          </button>
        {/if}
        <span class="count">{erdStore.schema.tables.length}</span>
        <button class="collapse-btn" onclick={ontoggle} title={m.sidebar_collapse()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="search-bar">
      <input
        type="text"
        class="search-input"
        placeholder={m.sidebar_search_placeholder()}
        bind:value={searchQuery}
      />
      <button
        class="sort-btn"
        title={sortBy === 'creation' ? m.sidebar_sort_by_name() : m.sidebar_sort_by_creation()}
        onclick={() => (sortBy = sortBy === 'creation' ? 'name' : 'creation')}
      >
        {sortBy === 'creation' ? m.sidebar_sort_creation() : m.sidebar_sort_name()}
      </button>
      <button
        class="sort-btn"
        class:active-mode={viewMode === 'group'}
        title={m.sidebar_group_by()}
        onclick={() => (viewMode = viewMode === 'flat' ? 'group' : 'flat')}
      >
        {m.sidebar_group_by()}
      </button>
    </div>

    <ul class="table-list">
      {#if viewMode === 'flat'}
        {#each filteredTables() as table (table.id)}
          {@const meta = getTableMeta(table)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="table-item"
            class:active={erdStore.selectedTableIds.has(table.id)}
            onclick={(e) => onItemClick(e, table.id)}
          >
            <div class="item-info">
              <div class="item-name-row">
                {#if getColorDot(table.color)}
                  <span class="item-color-dot" style="background:{getColorDot(table.color)}"></span>
                {/if}
                <span class="item-name">{table.name}</span>
                <span class="badge badge-cols">{meta.colCount}</span>
              </div>
              {#if meta.pkCols.length > 0 || meta.fkCount > 0 || meta.refCount > 0}
                <div class="meta-badges">
                  {#if meta.pkCols.length > 0}
                    <span class="badge badge-pk">{meta.pkCols.join(', ')}</span>
                  {/if}
                  {#if meta.fkCount > 0}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span class="badge badge-fk badge-hover"
                      onmouseenter={(e) => showTooltip(e, meta.fkDetails.join('\n'))}
                      onmouseleave={hideTooltip}
                    >→{meta.fkCount}</span>
                  {/if}
                  {#if meta.refCount > 0}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span class="badge badge-ref badge-hover"
                      onmouseenter={(e) => showTooltip(e, meta.refDetails.join('\n'))}
                      onmouseleave={hideTooltip}
                    >←{meta.refCount}</span>
                  {/if}
                </div>
              {/if}
              {#if table.comment}
                <span class="item-comment">{table.comment}</span>
              {/if}
            </div>
            <div class="item-actions">
              <button
                class="item-action-btn"
                title={m.action_duplicate()}
                onclick={(e) => duplicateTable(e, table.id)}
              >⧉</button>
              <button
                class="item-action-btn item-delete"
                title={m.action_delete()}
                onclick={async (e) => {
                  e.stopPropagation();
                  const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
                    title: m.dialog_delete_table_title(),
                    confirmText: m.action_delete(),
                    variant: 'danger',
                  });
                  if (ok) erdStore.deleteTable(table.id);
                }}
              >✕</button>
            </div>
          </li>
        {:else}
          <li class="empty-hint">
            {#if searchQuery.trim()}
              {m.sidebar_no_results()}
            {:else}
              {m.sidebar_empty()}
            {/if}
          </li>
        {/each}
      {:else}
        {#each groupedTables as group (group.name)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li class="group-header" onclick={() => toggleGroup(group.name)}>
            <span class="group-chevron" class:collapsed={collapsedGroups.has(group.name)}>▸</span>
            <span class="group-label">{group.label}</span>
            <span class="group-count">{group.tables.length}</span>
          </li>
          {#if !collapsedGroups.has(group.name)}
            {#each group.tables as table (table.id)}
              {@const meta = getTableMeta(table)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <li
                class="table-item table-item-grouped"
                class:active={erdStore.selectedTableIds.has(table.id)}
                onclick={(e) => onItemClick(e, table.id)}
              >
                <div class="item-info">
                  <div class="item-name-row">
                    {#if getColorDot(table.color)}
                      <span class="item-color-dot" style="background:{getColorDot(table.color)}"></span>
                    {/if}
                    <span class="item-name">{table.name}</span>
                    <span class="badge badge-cols">{meta.colCount}</span>
                  </div>
                  {#if table.comment}
                    <span class="item-comment">{table.comment}</span>
                  {/if}
                </div>
                <div class="item-actions">
                  <button
                    class="item-action-btn"
                    title={m.action_duplicate()}
                    onclick={(e) => duplicateTable(e, table.id)}
                  >⧉</button>
                  <button
                    class="item-action-btn item-delete"
                    title={m.action_delete()}
                    onclick={async (e) => {
                      e.stopPropagation();
                      const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
                        title: m.dialog_delete_table_title(),
                        confirmText: m.action_delete(),
                        variant: 'danger',
                      });
                      if (ok) erdStore.deleteTable(table.id);
                    }}
                  >✕</button>
                </div>
              </li>
            {/each}
          {/if}
        {:else}
          <li class="empty-hint">
            {#if searchQuery.trim()}
              {m.sidebar_no_results()}
            {:else}
              {m.sidebar_empty()}
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
    {#if tooltip}
      <div class="fixed-tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">
        {tooltip.text}
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={onResizeStart}></div>
  </aside>
{/if}

<style>
  .sidebar {
    position: relative;
    flex-shrink: 0;
    background: var(--app-panel-bg, #f8fafc);
    border-right: 1px solid var(--app-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar.resizing {
    user-select: none;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 4px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }

  .resize-handle:hover {
    background: #93c5fd;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    gap: 6px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .collapse-btn {
    background: none;
    border: none;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .collapse-btn:hover {
    color: var(--app-text-secondary, #475569);
    background: var(--app-hover-bg, #e2e8f0);
  }

  .expand-btn {
    position: absolute;
    left: 0;
    top: 48px;
    z-index: 50;
    background: var(--app-panel-bg, #f8fafc);
    border: 1px solid var(--app-border, #e2e8f0);
    border-left: none;
    border-radius: 0 6px 6px 0;
    padding: 8px 4px;
    cursor: pointer;
    color: var(--app-text-muted, #64748b);
    display: flex;
    align-items: center;
  }

  .expand-btn:hover {
    background: var(--app-hover-bg, #e2e8f0);
    color: var(--app-text, #1e293b);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
  }

  .search-input {
    flex: 1;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    outline: none;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
  }

  .search-input:focus {
    border-color: #93c5fd;
  }

  .search-input::placeholder {
    color: var(--app-text-faint, #94a3b8);
  }

  .sort-btn {
    background: none;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sort-btn:hover {
    background: var(--app-hover-bg, #e2e8f0);
    color: var(--app-text, #1e293b);
  }

  .bulk-delete-btn {
    background: #fee2e2;
    color: #ef4444;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .bulk-delete-btn:hover {
    background: #fecaca;
  }

  .count {
    background: var(--app-badge-bg, #e2e8f0);
    color: var(--app-text-secondary, #475569);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
  }

  .table-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: var(--app-scrollbar, #cbd5e1) transparent;
  }

  .table-list::-webkit-scrollbar {
    width: 6px;
  }

  .table-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-list::-webkit-scrollbar-thumb {
    background: var(--app-scrollbar, #cbd5e1);
    border-radius: 3px;
  }

  .table-list::-webkit-scrollbar-thumb:hover {
    background: var(--app-text-faint, #94a3b8);
  }

  .table-item {
    display: flex;
    align-items: flex-start;
    padding: 8px 14px;
    cursor: pointer;
    border-bottom: 1px solid var(--app-border-light, #f1f5f9);
    transition: background 0.1s;
  }

  .table-item:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .table-item.active {
    background: var(--app-active-bg, #eff6ff);
    border-left: 3px solid #3b82f6;
    padding-left: 11px;
  }

  .item-info {
    flex: 1;
    overflow: hidden;
  }

  .item-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .item-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
  }

  .meta-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
  }

  .badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    border: 1px solid;
    white-space: nowrap;
    line-height: 1.4;
  }

  .badge-pk {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .badge-cols {
    background: var(--app-badge-bg, #f1f5f9);
    border-color: var(--app-badge-border, #e2e8f0);
    color: var(--app-text-muted, #64748b);
  }

  .badge-fk {
    background: #dbeafe;
    border-color: #93c5fd;
    color: #1e40af;
  }

  .badge-ref {
    background: #ccfbf1;
    border-color: #5eead4;
    color: #0f766e;
  }

  .badge-hover {
    cursor: default;
  }

  .fixed-tooltip {
    position: fixed;
    background: #1e293b;
    color: #f1f5f9;
    font-size: 11px;
    font-weight: 400;
    padding: 6px 8px;
    border-radius: 4px;
    white-space: pre;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  }

  .item-comment {
    display: block;
    font-size: 11px;
    color: var(--app-text-faint, #94a3b8);
    font-style: italic;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .table-item:hover .item-actions {
    opacity: 1;
  }

  .item-action-btn {
    background: none;
    border: none;
    color: var(--app-text-faint, #cbd5e1);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
  }

  .item-action-btn:hover {
    color: #3b82f6;
    background: var(--app-active-bg, #eff6ff);
  }

  .item-delete:hover {
    color: #ef4444;
    background: #fee2e2;
  }

  .empty-hint {
    padding: 24px 14px;
    font-size: 12px;
    color: var(--app-text-faint, #94a3b8);
    text-align: center;
    line-height: 1.6;
    white-space: pre-line;
  }

  .active-mode {
    background: #dbeafe;
    color: #2563eb;
    border-color: #93c5fd;
  }

  .item-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    cursor: pointer;
    background: var(--app-hover-bg, #f1f5f9);
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    user-select: none;
  }

  .group-header:hover {
    background: var(--app-badge-bg, #e2e8f0);
  }

  .group-chevron {
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    transition: transform 0.15s;
    display: inline-block;
    transform: rotate(90deg);
  }

  .group-chevron.collapsed {
    transform: rotate(0deg);
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--app-text-secondary, #475569);
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .group-count {
    font-size: 10px;
    background: var(--app-badge-bg, #e2e8f0);
    color: var(--app-text-muted, #64748b);
    border-radius: 8px;
    padding: 0 6px;
  }

  .table-item-grouped {
    padding-left: 24px;
  }

  .table-item-grouped.active {
    padding-left: 21px;
  }
</style>

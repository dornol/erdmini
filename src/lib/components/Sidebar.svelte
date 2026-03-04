<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import * as m from '$lib/paraglide/messages';
  import { TABLE_COLORS, TABLE_COLOR_IDS } from '$lib/constants/table-colors';
  import type { TableColorId } from '$lib/constants/table-colors';
  import { themeStore } from '$lib/store/theme.svelte';
  import { getEffectiveColor } from '$lib/utils/table-color';
  import { now } from '$lib/utils/common';
  import VirtualList from './VirtualList.svelte';

  // Height constants for virtual rows
  const ROW_H_TABLE = 34;
  const ROW_H_TABLE_COMMENT = 48; // 34 + 14 for comment line
  const ROW_H_GROUP_HEADER = 28;
  const COLOR_PICKER_DOT = 18;
  const COLOR_PICKER_GAP = 4;
  const COLOR_PICKER_PAD_X = 28 + 14; // left + right padding
  const COLOR_PICKER_PAD_Y = 6 + 6;   // top + bottom padding
  const COLOR_PICKER_ITEMS = 1 + TABLE_COLOR_IDS.length; // none + colors
  function colorPickerHeight(width: number): number {
    const usable = width - COLOR_PICKER_PAD_X;
    const cols = Math.max(1, Math.floor((usable + COLOR_PICKER_GAP) / (COLOR_PICKER_DOT + COLOR_PICKER_GAP)));
    const rowCount = Math.ceil(COLOR_PICKER_ITEMS / cols);
    return rowCount * COLOR_PICKER_DOT + (rowCount - 1) * COLOR_PICKER_GAP + COLOR_PICKER_PAD_Y;
  }
  const ROW_H_NEW_GROUP = 36;
  const ROW_H_EMPTY = 60;

  type GroupData = { name: string; label: string; tables: import('$lib/types/erd').Table[] };

  type VirtualRow =
    | { type: 'table'; table: import('$lib/types/erd').Table; grouped: boolean; groupName: string; height: number; key: string }
    | { type: 'group-header'; group: GroupData; height: number; key: string }
    | { type: 'color-picker'; groupName: string; height: number; key: string }
    | { type: 'new-group'; height: number; key: string }
    | { type: 'empty-hint'; searching: boolean; height: number; key: string };

  let {
    collapsed = false,
    ontoggle,
    onbulkedit,
  }: {
    collapsed?: boolean;
    ontoggle?: () => void;
    onbulkedit?: () => void;
  } = $props();

  let searchQuery = $state('');
  let sortBy = $state<'creation' | 'name'>('creation');
  let viewMode = $state<'flat' | 'group'>('flat');
  let collapsedGroups = $state<Set<string>>(
    typeof localStorage !== 'undefined'
      ? new Set(JSON.parse(localStorage.getItem('erdmini_collapsed_groups') || '[]'))
      : new Set()
  );

  $effect(() => {
    localStorage.setItem('erdmini_collapsed_groups', JSON.stringify([...collapsedGroups]));
  });
  let sidebarWidth = $state(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('erdmini_sidebar_width')) || 240
      : 240
  );
  let resizing = $state(false);

  // Group drag & drop state
  let dragTableId = $state<string | null>(null);
  let dragOverGroup = $state<string | null>(null);

  // Group create & rename state
  let pendingNewGroups = $state<string[]>([]);
  let editingGroup = $state<string | null>(null);
  let editingGroupName = $state('');
  let newGroupInput = $state(false);
  let newGroupName = $state('');

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

    // Schema filter (when a specific schema is active)
    if (canvasState.activeSchema !== '(all)') {
      tables = tables.filter((t) => (t.schema ?? '') === canvasState.activeSchema);
    }

    if (searchQuery.trim()) {
      const raw = searchQuery.trim();
      const lower = raw.toLowerCase();

      // Prefix filters
      if (lower.startsWith('fk:')) {
        const fkQ = lower.slice(3).trim();
        tables = tables.filter((t) =>
          t.foreignKeys.some((fk) => {
            const refTable = erdStore.schema.tables.find((rt) => rt.id === fk.referencedTableId);
            return refTable && refTable.name.toLowerCase().includes(fkQ);
          })
        );
      } else if (lower.startsWith('group:')) {
        const groupQ = lower.slice(6).trim();
        tables = tables.filter((t) =>
          (t.group || '').toLowerCase().includes(groupQ)
        );
      } else if (lower.startsWith('locked:')) {
        tables = tables.filter((t) => t.locked);
      } else if (lower.startsWith('type:')) {
        const typeQ = lower.slice(5).trim();
        tables = tables.filter(t => t.columns.some(c => c.type.toLowerCase().includes(typeQ)));
      } else if (lower.startsWith('has:')) {
        const attr = lower.slice(4).trim();
        tables = tables.filter(t => tableHasAttr(t, attr));
      } else if (lower.startsWith('no:')) {
        const attr = lower.slice(3).trim();
        tables = tables.filter(t => !tableHasAttr(t, attr));
      } else if (lower.startsWith('color:')) {
        const colorQ = lower.slice(6).trim();
        tables = tables.filter(t => {
          const eff = getEffectiveColor(t, erdStore.schema);
          return eff && eff.toLowerCase().includes(colorQ);
        });
      } else {
        // Default: search table name, column names, column comments, comment, FK ref table names, group
        tables = tables.filter((t) =>
          t.name.toLowerCase().includes(lower) ||
          t.columns.some((c) => c.name.toLowerCase().includes(lower) || (c.comment && c.comment.toLowerCase().includes(lower))) ||
          (t.comment && t.comment.toLowerCase().includes(lower)) ||
          t.foreignKeys.some((fk) => {
            const refTable = erdStore.schema.tables.find((rt) => rt.id === fk.referencedTableId);
            return refTable && refTable.name.toLowerCase().includes(lower);
          }) ||
          (t.group && t.group.toLowerCase().includes(lower))
        );
      }
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
    // Add pending empty groups
    for (const pg of pendingNewGroups) {
      if (!groups.has(pg)) groups.set(pg, []);
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

  function getColorDot(table: import('$lib/types/erd').Table): string | null {
    const colorId = getEffectiveColor(table, erdStore.schema);
    if (!colorId) return null;
    const entry = TABLE_COLORS[colorId];
    return entry?.dot ?? null;
  }

  function getGroupColorDot(groupName: string): string | null {
    const colorId = erdStore.schema.groupColors?.[groupName];
    if (!colorId) return null;
    const entry = TABLE_COLORS[colorId as TableColorId];
    return entry?.dot ?? null;
  }

  let groupColorPicker = $state<string | null>(null);

  function toggleGroupColorPicker(e: MouseEvent, groupName: string) {
    e.stopPropagation();
    groupColorPicker = groupColorPicker === groupName ? null : groupName;
  }

  function setGroupColor(group: string, colorId: string | undefined) {
    erdStore.updateGroupColor(group, colorId);
    groupColorPicker = null;
  }

  import type { Table } from '$lib/types/erd';

  let searchFocused = $state(false);
  let hintIndex = $state(-1);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  const SEARCH_PREFIXES = [
    { key: 'fk:', desc: () => m.search_hint_fk() },
    { key: 'group:', desc: () => m.search_hint_group() },
    { key: 'locked:', desc: () => m.search_hint_locked() },
    { key: 'type:', desc: () => m.search_hint_type() },
    { key: 'has:', desc: () => m.search_hint_has() },
    { key: 'no:', desc: () => m.search_hint_no() },
    { key: 'color:', desc: () => m.search_hint_color() },
  ];

  function tableHasAttr(t: Table, attr: string): boolean {
    switch (attr) {
      case 'pk': return t.columns.some(c => c.primaryKey);
      case 'fk': return t.foreignKeys.length > 0;
      case 'index': case 'idx': return (t.indexes?.length ?? 0) > 0;
      case 'comment': return !!(t.comment) || t.columns.some(c => !!c.comment);
      case 'domain': return t.columns.some(c => !!c.domainId);
      case 'unique': case 'uq': return t.columns.some(c => c.unique) || (t.uniqueKeys?.length ?? 0) > 0;
      case 'auto': case 'ai': return t.columns.some(c => c.autoIncrement);
      case 'default': return t.columns.some(c => c.defaultValue !== undefined && c.defaultValue !== '');
      case 'color': return !!t.color;
      case 'enum': return t.columns.some(c => c.type === 'ENUM' || (c.enumValues && c.enumValues.length > 0));
      case 'locked': return !!t.locked;
      default: return false;
    }
  }

  let richTooltip = $state<{ table: Table; top: number } | null>(null);

  function showRichTooltip(e: MouseEvent, table: Table) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    richTooltip = { table, top: rect.top };
  }

  function hideRichTooltip() {
    richTooltip = null;
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

  function startNewGroup() {
    newGroupInput = true;
    newGroupName = '';
  }

  function confirmNewGroup() {
    const name = newGroupName.trim();
    if (!name) { cancelNewGroup(); return; }
    const existingGroups = new Set(erdStore.schema.tables.map(t => t.group).filter(Boolean));
    if (existingGroups.has(name) || pendingNewGroups.includes(name)) { cancelNewGroup(); return; }
    pendingNewGroups = [...pendingNewGroups, name];
    newGroupInput = false;
    newGroupName = '';
  }

  function cancelNewGroup() {
    newGroupInput = false;
    newGroupName = '';
  }

  function startEditGroup(e: MouseEvent, groupName: string) {
    e.stopPropagation();
    editingGroup = groupName;
    editingGroupName = groupName;
  }

  function confirmEditGroup() {
    const newName = editingGroupName.trim();
    const oldName = editingGroup;
    editingGroup = null;
    if (!oldName || !newName || oldName === newName) return;
    // Check if it's a pending-only group (no tables yet)
    const isPending = pendingNewGroups.includes(oldName);
    if (isPending) {
      pendingNewGroups = pendingNewGroups.map(g => g === oldName ? newName : g);
    } else {
      erdStore.renameGroup(oldName, newName);
      // Also update pending if it was somehow in both
      if (pendingNewGroups.includes(oldName)) {
        pendingNewGroups = pendingNewGroups.map(g => g === oldName ? newName : g);
      }
    }
  }

  function cancelEditGroup() {
    editingGroup = null;
    editingGroupName = '';
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

  let allSelectedLocked = $derived.by(() => {
    const ids = erdStore.selectedTableIds;
    if (ids.size < 2) return false;
    return [...ids].every(id => erdStore.schema.tables.find(t => t.id === id)?.locked);
  });

  function bulkToggleLock() {
    const ids = [...erdStore.selectedTableIds];
    if (ids.length < 2) return;
    const newLocked = !allSelectedLocked;
    for (const id of ids) {
      const table = erdStore.schema.tables.find(t => t.id === id);
      if (table) table.locked = newLocked;
    }
    erdStore.schema.updatedAt = now();
  }

  function onTableDragStart(e: DragEvent, tableId: string) {
    if (permissionStore.isReadOnly) { e.preventDefault(); return; }
    dragTableId = tableId;
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onGroupDragOver(e: DragEvent, groupName: string) {
    if (!dragTableId) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOverGroup = groupName;
  }

  function onGroupDragLeave() {
    dragOverGroup = null;
  }

  function onGroupDrop(e: DragEvent, groupName: string) {
    e.preventDefault();
    if (!dragTableId) return;
    const table = erdStore.schema.tables.find(t => t.id === dragTableId);
    const currentGroup = table?.group || '';
    if (currentGroup !== groupName) {
      erdStore.updateTableGroup(dragTableId, groupName || undefined);
      // Remove from pending if a table was assigned to this group
      if (groupName && pendingNewGroups.includes(groupName)) {
        pendingNewGroups = pendingNewGroups.filter(g => g !== groupName);
      }
    }
    dragTableId = null;
    dragOverGroup = null;
  }

  function onTableDragEnd() {
    dragTableId = null;
    dragOverGroup = null;
  }

  function duplicateTable(e: MouseEvent, tableId: string) {
    e.stopPropagation();
    erdStore.duplicateTable(tableId);
  }

  let virtualListRef = $state<ReturnType<typeof VirtualList> | null>(null);

  const virtualRows = $derived.by((): VirtualRow[] => {
    const rows: VirtualRow[] = [];
    if (viewMode === 'flat') {
      const tables = filteredTables();
      if (tables.length === 0) {
        rows.push({ type: 'empty-hint', searching: !!searchQuery.trim(), height: ROW_H_EMPTY, key: '__empty__' });
      } else {
        for (const table of tables) {
          rows.push({
            type: 'table',
            table,
            grouped: false,
            groupName: '',
            height: table.comment ? ROW_H_TABLE_COMMENT : ROW_H_TABLE,
            key: table.id,
          });
        }
      }
    } else {
      // Group view
      if (!permissionStore.isReadOnly) {
        rows.push({ type: 'new-group', height: ROW_H_NEW_GROUP, key: '__new_group__' });
      }
      const groups = groupedTables;
      if (groups.length === 0) {
        rows.push({ type: 'empty-hint', searching: !!searchQuery.trim(), height: ROW_H_EMPTY, key: '__empty__' });
      } else {
        for (const group of groups) {
          rows.push({
            type: 'group-header',
            group,
            height: ROW_H_GROUP_HEADER,
            key: `__gh_${group.name}`,
          });
          if (groupColorPicker === group.name) {
            rows.push({
              type: 'color-picker',
              groupName: group.name,
              height: colorPickerHeight(sidebarWidth),
              key: `__cp_${group.name}`,
            });
          }
          if (!collapsedGroups.has(group.name)) {
            for (const table of group.tables) {
              rows.push({
                type: 'table',
                table,
                grouped: true,
                groupName: group.name,
                height: table.comment ? ROW_H_TABLE_COMMENT : ROW_H_TABLE,
                key: table.id,
              });
            }
          }
        }
      }
    }
    return rows;
  });

  // Scroll reset on search/view/sort change
  $effect(() => {
    void searchQuery; void viewMode; void sortBy;
    virtualListRef?.scrollToTop();
  });

  // Canvas selection → sidebar scroll
  let internalClick = false;
  $effect(() => {
    const id = erdStore.selectedTableId;
    if (!id || internalClick) { internalClick = false; return; }
    const idx = virtualRows.findIndex(r => r.type === 'table' && r.table.id === id);
    if (idx >= 0) virtualListRef?.scrollToIndex(idx, 'smooth');
  });

  // Auto-scroll during drag near edges
  function onDragOverContainer(e: DragEvent) {
    if (!dragTableId) return;
    const container = virtualListRef?.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const edge = 40;
    if (y < edge) {
      container.scrollTop -= 8;
    } else if (y > rect.height - edge) {
      container.scrollTop += 8;
    }
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
      <div class="header-top-row">
        <span>{m.sidebar_title()}</span>
        <div class="header-right">
          <span class="count">{erdStore.schema.tables.length}</span>
          <button class="collapse-btn" onclick={ontoggle} title={m.sidebar_collapse()}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      {#if erdStore.selectedTableIds.size >= 2}
        <div class="header-bulk-actions">
          {#if !permissionStore.isReadOnly}
            <button class="bulk-edit-btn" onclick={() => onbulkedit?.()}>
              {m.bulk_edit_title()}({erdStore.selectedTableIds.size})
            </button>
            <button class="bulk-lock-btn" class:locked={allSelectedLocked} onclick={bulkToggleLock}>
              {allSelectedLocked ? m.sidebar_bulk_unlock({ count: erdStore.selectedTableIds.size }) : m.sidebar_bulk_lock({ count: erdStore.selectedTableIds.size })}
            </button>
          {/if}
          <button class="bulk-delete-btn" onclick={bulkDelete}>
            {m.sidebar_bulk_delete({ count: erdStore.selectedTableIds.size })}
          </button>
        </div>
      {/if}
    </div>

    <div class="search-bar">
      <div class="search-input-wrap">
        <input
          type="text"
          class="search-input"
          placeholder={m.sidebar_search_placeholder()}
          bind:value={searchQuery}
          bind:this={searchInputEl}
          onfocus={() => { searchFocused = true; hintIndex = -1; }}
          onblur={() => { searchFocused = false; hintIndex = -1; }}
          onkeydown={(e) => {
            if (!searchFocused || searchQuery.trim()) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              hintIndex = (hintIndex + 1) % SEARCH_PREFIXES.length;
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              hintIndex = hintIndex <= 0 ? SEARCH_PREFIXES.length - 1 : hintIndex - 1;
            } else if (e.key === 'Enter' && hintIndex >= 0) {
              e.preventDefault();
              searchQuery = SEARCH_PREFIXES[hintIndex].key;
              hintIndex = -1;
            } else if (e.key === 'Escape') {
              searchFocused = false;
              hintIndex = -1;
            }
          }}
        />
        {#if searchFocused && !searchQuery.trim()}
          <div class="search-hints">
            <div class="search-hints-title">{m.search_hint_title()}</div>
            {#each SEARCH_PREFIXES as prefix, i}
              <button
                class="search-hint-item"
                class:hint-active={hintIndex === i}
                onmousedown={(e) => {
                  e.preventDefault();
                  searchQuery = prefix.key;
                  hintIndex = -1;
                  searchInputEl?.focus();
                }}
              >
                <span class="hint-prefix">{prefix.key}</span>
                <span class="hint-desc">{prefix.desc()}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
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

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <VirtualList bind:this={virtualListRef} items={virtualRows} class="table-list thin-scrollbar" ondragover={onDragOverContainer}>
      {#snippet children(row: VirtualRow, _index: number)}
        {#if row.type === 'table'}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="table-item"
            class:table-item-grouped={row.grouped}
            class:active={erdStore.selectedTableIds.has(row.table.id)}
            class:dragging={dragTableId === row.table.id}
            draggable={row.grouped && !permissionStore.isReadOnly}
            onclick={(e) => { internalClick = true; onItemClick(e, row.table.id); }}
            ondragstart={(e) => onTableDragStart(e, row.table.id)}
            ondragend={onTableDragEnd}
            ondragover={row.grouped ? (e) => onGroupDragOver(e, row.groupName) : undefined}
            ondrop={row.grouped ? (e) => onGroupDrop(e, row.groupName) : undefined}
            onmouseenter={(e) => showRichTooltip(e, row.table)}
            onmouseleave={hideRichTooltip}
          >
            <div class="item-info">
              <div class="item-name-row">
                {#if getColorDot(row.table)}
                  <span class="item-color-dot" style="background:{getColorDot(row.table)}"></span>
                {/if}
                <span class="item-name">{row.table.name}</span>
                {#if row.table.locked}<span class="item-lock" title="Locked">🔒</span>{/if}
                <span class="badge badge-cols">{row.table.columns.length}</span>
              </div>
              {#if row.table.comment}
                <span class="item-comment">{row.table.comment}</span>
              {/if}
            </div>
            <div class="item-actions">
              <button
                class="item-action-btn"
                title={m.action_duplicate()}
                onclick={(e) => duplicateTable(e, row.table.id)}
              >⧉</button>
              <button
                class="item-action-btn item-delete"
                title={m.action_delete()}
                onclick={async (e) => {
                  e.stopPropagation();
                  const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: row.table.name }), {
                    title: m.dialog_delete_table_title(),
                    confirmText: m.action_delete(),
                    variant: 'danger',
                  });
                  if (ok) erdStore.deleteTable(row.table.id);
                }}
              >✕</button>
            </div>
          </div>
        {:else if row.type === 'group-header'}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="group-header"
            class:drag-target={dragOverGroup === row.group.name}
            onclick={() => toggleGroup(row.group.name)}
            ondragover={(e) => onGroupDragOver(e, row.group.name)}
            ondragleave={onGroupDragLeave}
            ondrop={(e) => onGroupDrop(e, row.group.name)}
          >
            <span class="group-chevron" class:collapsed={collapsedGroups.has(row.group.name)}>▸</span>
            {#if row.group.name}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="group-color-dot"
                style="background:{getGroupColorDot(row.group.name) ?? 'transparent'};{getGroupColorDot(row.group.name) ? '' : 'border:1.5px dashed #94a3b8'}"
                onclick={(e) => toggleGroupColorPicker(e, row.group.name)}
                title={m.table_color()}
              ></span>
            {/if}
            {#if editingGroup === row.group.name && row.group.name}
              <input
                class="group-edit-input"
                type="text"
                bind:value={editingGroupName}
                onkeydown={(e) => { if (e.key === 'Enter') confirmEditGroup(); if (e.key === 'Escape') cancelEditGroup(); }}
                onblur={confirmEditGroup}
                onclick={(e) => e.stopPropagation()}
                autofocus
              />
            {:else}
              <span class="group-label">{row.group.label}</span>
              {#if row.group.name && !permissionStore.isReadOnly}
                <button
                  class="group-edit-btn"
                  title={m.sidebar_rename_group()}
                  onclick={(e) => startEditGroup(e, row.group.name)}
                >✎</button>
              {/if}
            {/if}
            <span class="group-count">{row.group.tables.length}</span>
          </div>
        {:else if row.type === 'color-picker'}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="group-color-picker" onclick={(e) => e.stopPropagation()}>
            <button
              class="gc-dot gc-dot-none"
              class:active={!erdStore.schema.groupColors?.[row.groupName]}
              title={m.table_color_none()}
              onclick={() => setGroupColor(row.groupName, undefined)}
            >{#if !erdStore.schema.groupColors?.[row.groupName]}✓{/if}</button>
            {#each TABLE_COLOR_IDS as colorId}
              <button
                class="gc-dot"
                class:active={erdStore.schema.groupColors?.[row.groupName] === colorId}
                style="background:{TABLE_COLORS[colorId].dot}"
                title={colorId}
                onclick={() => setGroupColor(row.groupName, colorId)}
              >{#if erdStore.schema.groupColors?.[row.groupName] === colorId}✓{/if}</button>
            {/each}
          </div>
        {:else if row.type === 'new-group'}
          <div class="new-group-row">
            {#if newGroupInput}
              <input
                class="new-group-input"
                type="text"
                placeholder={m.sidebar_new_group_placeholder()}
                bind:value={newGroupName}
                onkeydown={(e) => { if (e.key === 'Enter') confirmNewGroup(); if (e.key === 'Escape') cancelNewGroup(); }}
                onblur={confirmNewGroup}
                autofocus
              />
            {:else}
              <button class="new-group-btn" onclick={startNewGroup}>+ {m.sidebar_new_group()}</button>
            {/if}
          </div>
        {:else if row.type === 'empty-hint'}
          <div class="empty-hint">
            {#if row.searching}
              {m.sidebar_no_results()}
            {:else}
              {m.sidebar_empty()}
            {/if}
          </div>
        {/if}
      {/snippet}
    </VirtualList>

    <!-- Memos Section -->
    {#if (erdStore.schema.memos ?? []).length > 0}
      <div class="memo-section">
        <div class="memo-section-header">
          <span>{m.sidebar_memos()}</span>
          <span class="count">{erdStore.schema.memos.length}</span>
        </div>
        <div class="memo-list thin-scrollbar">
          {#each erdStore.schema.memos as memo (memo.id)}
            {@const MEMO_DOTS: Record<string, string> = {
              yellow: '#facc15', blue: '#60a5fa', green: '#4ade80',
              pink: '#f472b6', purple: '#c084fc', orange: '#fb923c',
            }}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="memo-item"
              class:active={erdStore.selectedMemoIds.has(memo.id)}
              onclick={() => {
                erdStore.selectedTableId = null;
                erdStore.selectedTableIds = new Set();
                erdStore.selectedMemoId = memo.id;
                erdStore.selectedMemoIds = new Set([memo.id]);
              }}
            >
              <span class="item-color-dot" style="background:{MEMO_DOTS[memo.color ?? 'yellow'] ?? '#facc15'}"></span>
              <span class="memo-preview">{memo.content ? memo.content.split('\n')[0].slice(0, 30) || m.memo_placeholder() : m.memo_placeholder()}</span>
              <button
                class="memo-delete-btn"
                title={m.action_delete()}
                onclick={(e) => {
                  e.stopPropagation();
                  erdStore.deleteMemo(memo.id);
                }}
              >✕</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if richTooltip}
      {@const tt = richTooltip}
      {@const meta = getTableMeta(tt.table)}
      {@const tooltipTop = Math.min(tt.top, (typeof window !== 'undefined' ? window.innerHeight : 600) - 300)}
      <div class="rich-tooltip" style="left:{sidebarWidth + 4}px;top:{tooltipTop}px">
        <div class="rt-header">
          {#if getColorDot(tt.table)}
            <span class="item-color-dot" style="background:{getColorDot(tt.table)}"></span>
          {/if}
          <span class="rt-name">{tt.table.name}</span>
        </div>
        {#if tt.table.comment}
          <div class="rt-comment">{tt.table.comment}</div>
        {/if}
        <div class="rt-columns">
          {#each tt.table.columns as col}
            <div class="rt-col-row">
              <span class="rt-badges">
                {#if col.primaryKey}<span class="rt-badge rt-badge-pk">PK</span>{/if}
                {#if tt.table.foreignKeys.some(fk => fk.columnIds.includes(col.id))}<span class="rt-badge rt-badge-fk">FK</span>{/if}
                {#if col.unique || tt.table.uniqueKeys.some(uk => uk.columnIds.includes(col.id))}<span class="rt-badge rt-badge-uq">UQ</span>{/if}
                {#if col.autoIncrement}<span class="rt-badge rt-badge-ai">AI</span>{/if}
              </span>
              <span class="rt-col-name">{col.name}</span>
              <span class="rt-col-type">{col.type}{#if col.length}({col.length}{#if col.scale},{col.scale}{/if}){/if}{#if col.nullable}?{/if}</span>
            </div>
          {/each}
        </div>
        {#if meta.fkDetails.length > 0}
          <div class="rt-fk-section">
            <span class="rt-fk-label">FK →</span>
            {#each meta.fkDetails as detail}
              <div class="rt-fk-row">{detail}</div>
            {/each}
          </div>
        {/if}
        {#if meta.refDetails.length > 0}
          <div class="rt-fk-section">
            <span class="rt-fk-label">Ref ←</span>
            {#each meta.refDetails as detail}
              <div class="rt-fk-row">{detail}</div>
            {/each}
          </div>
        {/if}
        {#if tt.table.uniqueKeys.length > 0}
          <div class="rt-fk-section">
            <span class="rt-fk-label">Unique</span>
            {#each tt.table.uniqueKeys as uk}
              <div class="rt-fk-row">{uk.name ? uk.name + ': ' : ''}{uk.columnIds.map(id => tt.table.columns.find(c => c.id === id)?.name ?? '?').join(', ')}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={onResizeStart}>
      <div class="resize-grip">
        <span></span><span></span><span></span>
      </div>
    </div>
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
    right: -5px;
    width: 10px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: rgba(147, 197, 253, 0.3);
  }

  .resize-grip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: 3px;
    opacity: 0.4;
    transition: opacity 0.15s;
  }

  .resize-handle:hover .resize-grip,
  .resize-handle:active .resize-grip {
    opacity: 1;
  }

  .resize-grip span {
    display: block;
    width: 4px;
    height: 1px;
    background: #94a3b8;
    border-radius: 1px;
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    gap: 6px;
  }

  .header-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header-bulk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
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

  .search-input-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .search-input-wrap .search-input {
    width: 100%;
    box-sizing: border-box;
  }

  .search-hints {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--app-panel-bg, #fff);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 4px 0;
    margin-top: 2px;
  }

  .search-hints-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--app-text-faint, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 4px 8px 2px;
  }

  .search-hint-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    color: var(--app-text, #1e293b);
  }

  .search-hint-item:hover,
  .search-hint-item.hint-active {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .hint-prefix {
    font-weight: 600;
    color: #3b82f6;
    font-family: monospace;
    font-size: 11px;
    flex-shrink: 0;
  }

  .hint-desc {
    color: var(--app-text-muted, #64748b);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .bulk-edit-btn {
    background: #dbeafe;
    color: #2563eb;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .bulk-edit-btn:hover {
    background: #bfdbfe;
  }

  .bulk-lock-btn {
    background: #fef3c7;
    color: #b45309;
    border: 1px solid #fcd34d;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .bulk-lock-btn:hover {
    background: #fde68a;
  }

  .bulk-lock-btn.locked {
    background: #d1fae5;
    color: #047857;
    border-color: #6ee7b7;
  }

  .bulk-lock-btn.locked:hover {
    background: #a7f3d0;
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

  :global(.table-list) {
    padding: 0;
    margin: 0;
    flex: 1;
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

  .item-lock {
    font-size: 10px;
    flex-shrink: 0;
    opacity: 0.6;
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

  .badge-cols {
    background: var(--app-badge-bg, #f1f5f9);
    border-color: var(--app-badge-border, #e2e8f0);
    color: var(--app-text-muted, #64748b);
  }

  .rich-tooltip {
    position: fixed;
    background: #1e293b;
    color: #f1f5f9;
    font-size: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    min-width: 200px;
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
  }

  .rt-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .rt-name {
    font-weight: 700;
    font-size: 13px;
  }

  .rt-comment {
    font-size: 11px;
    font-style: italic;
    color: #94a3b8;
    margin-bottom: 6px;
  }

  .rt-columns {
    display: grid;
    grid-template-columns: max-content auto 1fr;
    gap: 1px 4px;
    border-top: 1px solid #334155;
    padding-top: 6px;
    font-size: 11px;
    line-height: 1.6;
    align-items: center;
  }

  .rt-col-row {
    display: contents;
  }

  .rt-badges {
    display: flex;
    gap: 2px;
    justify-content: flex-end;
  }

  .rt-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 0 3px;
    border-radius: 2px;
    line-height: 1.5;
  }

  .rt-badge-pk {
    background: #f59e0b;
    color: #451a03;
  }

  .rt-badge-fk {
    background: #3b82f6;
    color: #fff;
  }

  .rt-badge-uq {
    background: #8b5cf6;
    color: #fff;
  }

  .rt-badge-ai {
    background: #10b981;
    color: #fff;
  }

  .rt-col-name {
    font-weight: 500;
    flex-shrink: 0;
  }

  .rt-col-type {
    color: #94a3b8;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rt-fk-section {
    border-top: 1px solid #334155;
    margin-top: 6px;
    padding-top: 4px;
  }

  .rt-fk-label {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .rt-fk-row {
    font-size: 11px;
    color: #cbd5e1;
    padding-left: 4px;
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

  .table-item-grouped.dragging {
    opacity: 0.4;
  }

  .group-header.drag-target {
    background: #dbeafe;
    border-bottom-color: #3b82f6;
    box-shadow: inset 0 0 0 1px #93c5fd;
  }

  .table-item-grouped {
    padding-left: 24px;
  }

  .table-item-grouped.active {
    padding-left: 21px;
  }

  .group-color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .group-color-dot:hover {
    transform: scale(1.3);
  }

  .group-color-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, 18px);
    gap: 4px;
    padding: 6px 14px 6px 28px;
    background: var(--app-panel-bg, #f8fafc);
    border-bottom: 1px solid var(--app-border, #e2e8f0);
  }

  .gc-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 10px;
    color: #fff;
    font-weight: 700;
    text-shadow: 0 0 2px rgba(0,0,0,0.4);
    transition: border-color 0.15s, transform 0.1s;
  }

  .gc-dot:hover {
    transform: scale(1.15);
  }

  .gc-dot.active {
    border-color: #1e293b;
    box-shadow: 0 0 0 1px white inset;
  }

  .gc-dot-none {
    background: #fff;
    border: 1.5px dashed #cbd5e1;
    color: #64748b;
    text-shadow: none;
  }

  .gc-dot-none.active {
    border-style: solid;
    border-color: #1e293b;
  }

  .new-group-row {
    padding: 4px 14px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
  }

  .new-group-btn {
    width: 100%;
    padding: 5px 8px;
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
    background: none;
    border: 1.5px dashed var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
  }

  .new-group-btn:hover {
    background: var(--app-hover-bg, #f1f5f9);
    color: var(--app-text, #1e293b);
    border-color: #93c5fd;
  }

  .new-group-input {
    width: 100%;
    padding: 5px 8px;
    font-size: 11px;
    border: 1.5px solid #93c5fd;
    border-radius: 4px;
    outline: none;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    box-sizing: border-box;
  }

  .new-group-input::placeholder {
    color: var(--app-text-faint, #94a3b8);
  }

  .group-edit-input {
    flex: 1;
    padding: 1px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 1px solid #93c5fd;
    border-radius: 3px;
    outline: none;
    background: var(--app-input-bg, white);
    color: var(--app-text-secondary, #475569);
    min-width: 0;
  }

  .group-edit-btn {
    background: none;
    border: none;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .group-header:hover .group-edit-btn {
    opacity: 1;
  }

  .group-edit-btn:hover {
    color: #3b82f6;
  }

  .memo-section {
    border-top: 1px solid var(--app-border, #e2e8f0);
    flex-shrink: 0;
  }

  .memo-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
  }

  .memo-list {
    padding: 0 6px 8px;
    max-height: 150px;
    overflow-y: auto;
  }

  .memo-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .memo-item:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .memo-item.active {
    background: var(--app-active-bg, #eff6ff);
  }

  .memo-preview {
    flex: 1;
    font-size: 12px;
    color: var(--app-text-secondary, #475569);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memo-delete-btn {
    display: none;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 3px;
    background: none;
    color: var(--app-text-muted, #94a3b8);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    text-align: center;
  }

  .memo-item:hover .memo-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .memo-delete-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
</style>

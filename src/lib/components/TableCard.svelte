<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { fkDragStore } from '$lib/store/fk-drag.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { collabStore } from '$lib/store/collab.svelte';
  import { memoDragState } from '$lib/store/memo-drag.svelte';
  import type { Table } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import { themeStore } from '$lib/store/theme.svelte';
  import { TABLE_W, HEADER_H, ROW_H } from '$lib/constants/layout';
  import { getEffectiveColor } from '$lib/utils/table-color';

  let { table }: { table: Table } = $props();

  const MEMO_CHIP_COLORS: Record<string, { header: string; text: string }> = {
    yellow:  { header: '#facc15', text: '#713f12' },
    blue:    { header: '#60a5fa', text: '#1e3a5f' },
    green:   { header: '#4ade80', text: '#14532d' },
    pink:    { header: '#f472b6', text: '#831843' },
    purple:  { header: '#c084fc', text: '#581c87' },
    orange:  { header: '#fb923c', text: '#7c2d12' },
  };

  let cardWidth = $state(TABLE_W);
  $effect(() => {
    canvasState.setTableWidth(table.id, cardWidth);
  });

  let isEditing = $state(false);
  let editName = $state('');
  let schemaDropdownOpen = $state(false);
  let isDragging = $state(false);
  let dragStart = { mouseX: 0, mouseY: 0, tableX: 0, tableY: 0 };
  let groupDragStarts: Map<string, { x: number; y: number }> | null = null;

  let isSelected = $derived(erdStore.selectedTableIds.has(table.id));
  let isHovered = $state(false);
  let isMemoDragTarget = $derived(memoDragState.isDragging && memoDragState.hoverTableId === table.id);
  let attachedMemos = $derived(erdStore.schema.memos.filter((mm) => mm.attachedTableId === table.id));
  let isColumnHovered = $state(false);

  // Resolve column names from IDs for tooltip display
  function colNames(columnIds: string[]): string {
    return columnIds.map((id) => table.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
  }

  let hasConstraintInfo = $derived(
    (table.uniqueKeys?.length ?? 0) > 0 || (table.indexes?.length ?? 0) > 0
  );

  // Remote peer selection glow
  let remoteSelectColor = $derived.by(() => {
    for (const [peerId, tableIds] of collabStore.remoteSelections) {
      if (tableIds.includes(table.id)) {
        const peer = collabStore.peers.find((p) => p.peerId === peerId);
        if (peer) return peer.color;
      }
    }
    return null;
  });

  // Set of column IDs that are FK source columns
  let fkSourceIds = $derived(new Set(table.foreignKeys.flatMap((fk) => fk.columnIds)));

  // Set of column IDs that are part of composite unique keys
  let uniqueKeyColIds = $derived(new Set((table.uniqueKeys ?? []).flatMap((uk) => uk.columnIds)));

  // Filtered columns based on display mode
  let displayColumns = $derived.by(() => {
    const mode = canvasState.columnDisplayMode;
    if (mode === 'all') return table.columns;
    if (mode === 'pk-fk-only') {
      return table.columns.filter((c) => c.primaryKey || fkSourceIds.has(c.id));
    }
    return table.columns; // names-only still shows all columns
  });
  let isFiltered = $derived(displayColumns.length < table.columns.length);

  // Per-table header color override (table.color > groupColor > none)
  let headerColorOverride = $derived.by(() => {
    const colorId = getEffectiveColor(table, erdStore.schema);
    if (!colorId) return null;
    const entry = TABLE_COLORS[colorId];
    if (!entry) return null;
    return entry.themes[themeStore.current];
  });

  function onHeaderDblClick() {
    if (permissionStore.isReadOnly) return;
    isEditing = true;
    editName = table.name;
  }

  function onNameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') isEditing = false;
  }

  function commitName() {
    if (editName.trim()) erdStore.updateTableName(table.id, editName.trim());
    isEditing = false;
  }

  function assignSchema(schema: string | undefined) {
    erdStore.updateTableSchema(table.id, schema);
    schemaDropdownOpen = false;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(erdStore.selectedTableIds);
      if (newSet.has(table.id)) {
        newSet.delete(table.id);
      } else {
        newSet.add(table.id);
      }
      erdStore.selectedTableIds = newSet;
      return;
    }

    // Multi-drag: if table is already in a multi-selection group
    if (erdStore.selectedTableIds.has(table.id) && erdStore.selectedTableIds.size > 1) {
      if (!table.locked && !permissionStore.isReadOnly) {
        isDragging = true;
        dragStart = { mouseX: e.clientX, mouseY: e.clientY, tableX: 0, tableY: 0 };
        groupDragStarts = new Map();
        for (const id of erdStore.selectedTableIds) {
          const t = erdStore.schema.tables.find((tbl) => tbl.id === id);
          if (t && !t.locked) groupDragStarts.set(id, { x: t.position.x, y: t.position.y });
        }
      }
      return;
    }

    erdStore.selectedTableId = table.id;
    erdStore.selectedTableIds = new Set([table.id]);
    if (!table.locked && !permissionStore.isReadOnly) isDragging = true;
    dragStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      tableX: table.position.x,
      tableY: table.position.y,
    };
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.mouseX) / canvasState.scale;
    const dy = (e.clientY - dragStart.mouseY) / canvasState.scale;
    if (groupDragStarts && groupDragStarts.size > 1) {
      const moves = [...groupDragStarts].map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy }));
      erdStore.moveTables(moves);
    } else {
      erdStore.moveTable(table.id, dragStart.tableX + dx, dragStart.tableY + dy);
    }
  }

  function onMouseUp() {
    isDragging = false;
    groupDragStarts = null;
  }

  // ── Touch handlers (iPad/mobile) ──
  function onTouchStartCard(e: TouchEvent) {
    if (e.touches.length >= 2) {
      isDragging = false;
      groupDragStarts = null;
      return;
    }
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const touch = e.touches[0];

    if (erdStore.selectedTableIds.has(table.id) && erdStore.selectedTableIds.size > 1) {
      if (!table.locked && !permissionStore.isReadOnly) {
        isDragging = true;
        dragStart = { mouseX: touch.clientX, mouseY: touch.clientY, tableX: 0, tableY: 0 };
        groupDragStarts = new Map();
        for (const id of erdStore.selectedTableIds) {
          const t = erdStore.schema.tables.find((tbl) => tbl.id === id);
          if (t && !t.locked) groupDragStarts.set(id, { x: t.position.x, y: t.position.y });
        }
      }
      return;
    }

    erdStore.selectedTableId = table.id;
    erdStore.selectedTableIds = new Set([table.id]);
    if (!table.locked && !permissionStore.isReadOnly) isDragging = true;
    dragStart = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      tableX: table.position.x,
      tableY: table.position.y,
    };
  }

  function onTouchMoveCard(e: TouchEvent) {
    if (!isDragging) return;
    if (e.touches.length >= 2) {
      isDragging = false;
      groupDragStarts = null;
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    const dx = (touch.clientX - dragStart.mouseX) / canvasState.scale;
    const dy = (touch.clientY - dragStart.mouseY) / canvasState.scale;
    if (groupDragStarts && groupDragStarts.size > 1) {
      const moves = [...groupDragStarts].map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy }));
      erdStore.moveTables(moves);
    } else {
      erdStore.moveTable(table.id, dragStart.tableX + dx, dragStart.tableY + dy);
    }
  }

  function onTouchEndCard() {
    isDragging = false;
    groupDragStarts = null;
  }

  function onColumnDblClick(e: MouseEvent, colId: string) {
    if (permissionStore.isReadOnly) return;
    e.stopPropagation();
    erdStore.editingColumnInfo = {
      tableId: table.id,
      columnId: colId,
      anchorX: e.clientX,
      anchorY: e.clientY,
    };
  }

  async function onDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
      title: m.dialog_delete_table_title(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteTable(table.id);
  }

  $effect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMoveCard, { passive: false });
    window.addEventListener('touchend', onTouchEndCard);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMoveCard);
      window.removeEventListener('touchend', onTouchEndCard);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="table-card"
  class:selected={isSelected}
  class:locked={table.locked}
  class:fk-dragging={fkDragStore.active}
  class:memo-drop-target={isMemoDragTarget}
  data-table-id={table.id}
  bind:offsetWidth={cardWidth}
  style="left: {table.position.x}px; top: {table.position.y}px; cursor: {table.locked ? 'default' : isDragging ? 'grabbing' : 'grab'}; z-index: {isHovered ? 20 : isSelected ? 10 : 1}{remoteSelectColor ? `; box-shadow: 0 0 0 2px ${remoteSelectColor}40, 0 0 8px ${remoteSelectColor}30` : ''}"
  onmousedown={onMouseDown}
  ontouchstart={onTouchStartCard}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
>
  <!-- Attached memo chips (rendered above the card via absolute positioning) -->
  {#if attachedMemos.length > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="memo-chips" onmousedown={(e) => e.stopPropagation()}>
      {#each attachedMemos as mm}
        {@const chipColor = MEMO_CHIP_COLORS[mm.color ?? 'yellow'] ?? MEMO_CHIP_COLORS.yellow}
        <button
          class="memo-chip"
          style="background:{chipColor.header}; color:{chipColor.text}"
          title={mm.content ? `${mm.content}\n\nClick to detach` : 'Click to detach'}
          disabled={permissionStore.isReadOnly}
          onmousedown={(e) => e.stopPropagation()}
          onclick={() => erdStore.detachMemo(mm.id)}
        >
          <span class="chip-pin">📌</span>
          <span class="chip-content">{mm.content.slice(0, 20) || '(empty)'}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Header -->
  <div
    class="table-header"
    ondblclick={onHeaderDblClick}
    style={headerColorOverride ? `background:${headerColorOverride.headerBg}; --erd-header-text:${headerColorOverride.headerText}` : ''}
  >
    {#if isEditing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="name-input"
        bind:value={editName}
        onblur={commitName}
        onkeydown={onNameKeyDown}
        autofocus
        onclick={(e) => e.stopPropagation()}
        onmousedown={(e) => e.stopPropagation()}
      />
    {:else}
      <span class="table-name">{table.name}</span>
      {#if table.locked}<span class="lock-icon" title="Locked">🔒</span>{/if}
    {/if}
    {#if (erdStore.schema.schemas?.length ?? 0) > 0}
      <div class="schema-selector">
        <button
          class="schema-badge-btn"
          class:assigned={!!table.schema}
          onmousedown={(e) => e.stopPropagation()}
          onclick={(e) => { e.stopPropagation(); if (!permissionStore.isReadOnly) schemaDropdownOpen = !schemaDropdownOpen; }}
          title={table.schema ? `Schema: ${table.schema} — click to change` : 'Assign to schema'}
        >{table.schema ?? 'schema…'}</button>

        {#if schemaDropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="schema-dropdown-backdrop"
            onmousedown={(e) => { e.stopPropagation(); schemaDropdownOpen = false; }}
          ></div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="schema-dropdown" onmousedown={(e) => e.stopPropagation()}>
            {#each erdStore.schema.schemas ?? [] as s}
              <button
                class="schema-option"
                class:active={table.schema === s}
                onclick={() => assignSchema(s)}
              >{s}</button>
            {/each}
            {#if table.schema}
              <div class="schema-divider"></div>
              <button class="schema-option none-opt" onclick={() => assignSchema(undefined)}>
                Remove schema
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {:else if table.schema}
      <span class="schema-badge" title={table.schema}>{table.schema}</span>
    {/if}
    <button class="delete-btn" onclick={onDeleteClick} title={m.action_delete()}>✕</button>
  </div>

  <!-- Table-level tooltip: Unique Keys & Indexes (shown on card hover, hidden when column hovered) -->
  {#if hasConstraintInfo && isHovered && !isColumnHovered && !isDragging && !fkDragStore.active}
    <div class="table-tooltip">
      {#if (table.uniqueKeys?.length ?? 0) > 0}
        <div class="ttt-section">
          <div class="ttt-heading">Unique Keys</div>
          {#each table.uniqueKeys as uk}
            <div class="ttt-item">
              {#if uk.name}<span class="ttt-name">{uk.name}</span>{/if}
              <span class="ttt-cols">({colNames(uk.columnIds)})</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if (table.indexes?.length ?? 0) > 0}
        <div class="ttt-section">
          <div class="ttt-heading">Indexes</div>
          {#each table.indexes as idx}
            <div class="ttt-item">
              {#if idx.name}<span class="ttt-name">{idx.name}</span>{/if}
              <span class="ttt-cols">({colNames(idx.columnIds)})</span>
              {#if idx.unique}<span class="ttt-unique">UNIQUE</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Comment (optional) -->
  {#if table.comment}
    <div class="table-comment">{table.comment}</div>
  {/if}

  <!-- Columns -->
  <div class="column-list">
    {#if isFiltered}
      <div class="col-filter-hint">({displayColumns.length}/{table.columns.length})</div>
    {/if}
    {#each displayColumns as col, colIdx (col.id)}
      {@const fk = table.foreignKeys.find((f) => f.columnIds.includes(col.id))}
      {@const fkPairIdx = fk ? fk.columnIds.indexOf(col.id) : -1}
      {@const refTable = fk ? erdStore.schema.tables.find((t) => t.id === fk.referencedTableId) : undefined}
      {@const refCol = (refTable && fk && fkPairIdx >= 0) ? refTable.columns.find((c) => c.id === fk.referencedColumnIds[fkPairIdx]) : undefined}
      {@const isFkHighlighted = erdStore.hoveredFkInfo.some((hfk) =>
        (hfk.sourceTableId === table.id && hfk.sourceColumnIds.includes(col.id)) ||
        (hfk.refTableId === table.id && hfk.refColumnIds.includes(col.id))
      )}
      {@const isUkHighlighted = erdStore.hoveredUkInfo?.tableId === table.id && erdStore.hoveredUkInfo.columnIds.includes(col.id)}
      {@const isIdxHighlighted = erdStore.hoveredIdxInfo?.tableId === table.id && erdStore.hoveredIdxInfo.columnIds.includes(col.id)}
      {@const isFkDragTarget = fkDragStore.active && fkDragStore.targetTableId === table.id && fkDragStore.targetColumnId === col.id}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="column-row"
        class:fk-highlighted={isFkHighlighted || isUkHighlighted || isIdxHighlighted}
        class:fk-drag-target={isFkDragTarget}
        data-table-id={table.id}
        data-column-id={col.id}
        ondblclick={(e) => onColumnDblClick(e, col.id)}
        onmouseenter={() => {
          isColumnHovered = true;
          erdStore.hoveredColumnInfo = { tableId: table.id, columnId: col.id };
          if (fk) {
            erdStore.hoveredFkInfo = [{
              sourceTableId: table.id, sourceColumnIds: fk.columnIds,
              refTableId: fk.referencedTableId, refColumnIds: fk.referencedColumnIds,
            }];
          } else if (col.primaryKey) {
            erdStore.hoveredFkInfo = erdStore.schema.tables.flatMap((t) =>
              t.foreignKeys.filter((f) => f.referencedTableId === table.id && f.referencedColumnIds.includes(col.id))
                .map((f) => ({
                  sourceTableId: t.id, sourceColumnIds: f.columnIds,
                  refTableId: table.id, refColumnIds: f.referencedColumnIds,
                }))
            );
          }
        }}
        onmouseleave={() => {
          isColumnHovered = false;
          erdStore.hoveredColumnInfo = null;
          erdStore.hoveredFkInfo = [];
        }}
      >

        <!-- Key badge: PK (gold) or FK (blue) or nothing -->
        <div class="col-key">
          {#if col.primaryKey}
            <span class="key-badge pk" title="Primary Key">PK</span>
          {:else if fkSourceIds.has(col.id)}
            <span class="key-badge fk" title="Foreign Key">FK</span>
          {/if}
        </div>

        <!-- Column name -->
        <span class="col-name">{col.name}</span>

        <!-- Type + nullable indicator -->
        {#if canvasState.columnDisplayMode !== 'names-only'}
          <span class="col-type">
            {col.type}{col.length ? `(${col.length})` : ''}{col.nullable ? '?' : ''}
          </span>

          <!-- Attribute badges: UQ / AI / CK -->
          {#if ((col.unique || uniqueKeyColIds.has(col.id)) && !col.primaryKey) || col.autoIncrement || col.check}
            <div class="col-attrs">
              {#if (col.unique || uniqueKeyColIds.has(col.id)) && !col.primaryKey}
                <span class="attr uq" title="Unique">U</span>
              {/if}
              {#if col.autoIncrement}
                <span class="attr ai" title="Auto Increment">AI</span>
              {/if}
              {#if col.check}
                <span class="attr ck" title="CHECK ({col.check})">CK</span>
              {/if}
            </div>
          {/if}
        {/if}

        <!-- FK drag handle -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fk-handle"
          title={m.fk_drag_hint()}
          onmousedown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const commentH = table.comment ? 26 : 0;
            const sx = table.position.x + canvasState.getTableW(table.id);
            const sy = table.position.y + HEADER_H + commentH + colIdx * ROW_H + ROW_H / 2;
            fkDragStore.begin(table.id, col.id, sx, sy);
          }}
        ></div>

        <!-- Tooltip (shown via CSS :hover) -->
        <div class="col-tooltip">
          <div class="tt-title">{col.name}</div>

          <div class="tt-row">
            <span class="tt-label">{m.column_type()}</span>
            <span class="tt-mono">{col.type}{col.length ? `(${col.length})` : ''}</span>
          </div>
          <div class="tt-row">
            <span class="tt-label">Nullable</span>
            <span class:tt-yes={col.nullable} class:tt-no={!col.nullable}>
              {col.nullable ? 'YES' : 'NO'}
            </span>
          </div>

          <div class="tt-badges">
            {#if col.primaryKey}
              <span class="tt-badge pk">Primary Key</span>
            {/if}
            {#if fk && refTable && refCol}
              <span class="tt-badge fk">FK → {refTable.name}.{refCol.name}</span>
            {/if}
            {#if (col.unique || uniqueKeyColIds.has(col.id)) && !col.primaryKey}
              <span class="tt-badge uq">Unique</span>
            {/if}
            {#if col.autoIncrement}
              <span class="tt-badge ai">Auto Increment</span>
            {/if}
          </div>

          {#if col.defaultValue}
            <div class="tt-row">
              <span class="tt-label">{m.column_default()}</span>
              <span class="tt-mono">{col.defaultValue}</span>
            </div>
          {/if}

          {#if col.comment}
            <div class="tt-comment">{col.comment}</div>
          {/if}
        </div>

      </div>
    {/each}
    {#if displayColumns.length === 0}
      <div class="no-columns">{m.card_no_columns()}</div>
    {/if}
    {#if !permissionStore.isReadOnly && !table.locked}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="add-column-row"
        onmousedown={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          const colId = erdStore.addColumn(table.id);
          if (colId) {
            erdStore.editingColumnInfo = {
              tableId: table.id,
              columnId: colId,
              anchorX: e.clientX,
              anchorY: e.clientY,
            };
          }
        }}
      >+</div>
    {/if}
  </div>
</div>

<style>
  .table-card {
    position: absolute;
    min-width: 220px;
    max-width: 400px;
    width: max-content;
    background: var(--erd-card-bg);
    border: var(--erd-card-border-width) var(--erd-card-border-style, solid) var(--erd-card-border);
    border-radius: var(--erd-card-radius);
    box-shadow: var(--erd-card-shadow);
    user-select: none;
    transition: box-shadow 0.15s, border-color 0.15s;
  }

  .table-card.selected {
    border-color: var(--erd-card-selected-border);
    box-shadow: var(--erd-card-selected-glow), var(--erd-card-shadow);
  }

  .table-card.locked {
    opacity: 0.8;
    border-style: dashed;
  }

  .table-card.memo-drop-target {
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35);
  }

  /* ── Header ── */
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--erd-header-bg);
    border-radius: var(--erd-header-radius);
    border-bottom: var(--erd-header-border-bottom);
    gap: 8px;
  }

  .table-name {
    color: var(--erd-header-text);
    font-weight: 600;
    font-size: 13px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: var(--erd-header-text-transform, none);
    letter-spacing: var(--erd-header-letter-spacing, normal);
  }

  .name-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 3px;
    color: var(--erd-header-text);
    font-size: 13px;
    font-weight: 600;
    padding: 1px 4px;
    outline: none;
  }

  .lock-icon {
    font-size: 10px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  /* ── Attached memo chips ── */
  .memo-chips {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    padding-bottom: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: all;
    box-sizing: border-box;
  }

  .memo-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 10px;
    border: none;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
    width: 100%;
    box-sizing: border-box;
    opacity: 0.9;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: opacity 0.12s, filter 0.12s;
    text-align: left;
  }

  .memo-chip:hover:not(:disabled) {
    opacity: 1;
    filter: brightness(0.92);
  }

  .memo-chip:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .chip-pin {
    font-size: 10px;
    flex-shrink: 0;
    line-height: 1;
  }

  .chip-content {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  .schema-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255,255,255,0.15);
    color: var(--erd-header-text);
    flex-shrink: 0;
    white-space: nowrap;
    opacity: 0.8;
  }

  /* ── Schema selector dropdown ── */
  .schema-selector {
    position: relative;
    flex-shrink: 0;
  }

  .schema-badge-btn {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    border: none;
    background: rgba(255,255,255,0.15);
    color: var(--erd-header-text);
    white-space: nowrap;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, opacity 0.12s;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .schema-badge-btn.assigned {
    opacity: 1;
  }

  .schema-badge-btn:not(.assigned) {
    opacity: 0;
    font-style: italic;
    background: rgba(255,255,255,0.08);
  }

  .table-header:hover .schema-badge-btn:not(.assigned) {
    opacity: 0.5;
  }

  .schema-badge-btn:hover {
    background: rgba(255,255,255,0.28);
    opacity: 1 !important;
  }

  .schema-dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .schema-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1001;
    background: var(--app-panel-bg, #fff);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    min-width: 110px;
    overflow: hidden;
  }

  .schema-option {
    display: block;
    width: 100%;
    padding: 6px 10px;
    text-align: left;
    background: none;
    border: none;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    color: var(--app-text, #1e293b);
    white-space: nowrap;
    transition: background 0.1s;
  }

  .schema-option:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .schema-option.active {
    font-weight: 700;
    color: #3b82f6;
  }

  .schema-divider {
    height: 1px;
    background: var(--app-border, #e2e8f0);
    margin: 2px 0;
  }

  .schema-option.none-opt {
    font-size: 11px;
    color: #ef4444;
  }

  .schema-option.none-opt:hover {
    background: rgba(239,68,68,0.07);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--erd-header-delete);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }

  .table-header:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: #f87171 !important;
    background: rgba(255, 255, 255, 0.1);
  }

  /* ── Table comment ── */
  .table-comment {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--erd-comment-text);
    font-style: italic;
    background: var(--erd-comment-bg);
    border-bottom: 1px solid var(--erd-comment-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Column list ── */
  .column-list {
    padding: 4px 0;
  }

  .column-row {
    position: relative;        /* tooltip anchor */
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 4px;
    font-size: 12px;
    border-bottom: 1px solid var(--erd-col-border);
  }

  .column-row:last-child {
    border-bottom: none;
  }

  .column-row:hover {
    background: var(--erd-col-hover);
  }

  .column-row.fk-highlighted {
    background: var(--erd-fk-highlight);
  }

  /* Key badge (PK / FK) */
  .col-key {
    width: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .key-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: var(--erd-badge-radius);
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .key-badge.pk {
    background: var(--erd-badge-pk-bg);
    color: var(--erd-badge-pk-text);
    border: 1px solid var(--erd-badge-pk-border);
  }

  .key-badge.fk {
    background: var(--erd-badge-fk-bg);
    color: var(--erd-badge-fk-text);
    border: 1px solid var(--erd-badge-fk-border);
  }

  /* Column name */
  .col-name {
    flex: 1;
    color: var(--erd-col-text);
    white-space: nowrap;
  }

  /* Type + nullable (trailing ?) */
  .col-type {
    color: var(--erd-col-type);
    font-size: 11px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* Attribute badges: UQ / AI */
  .col-attrs {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .attr {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: var(--erd-badge-radius);
    line-height: 1.4;
  }

  .attr.uq {
    background: var(--erd-badge-uq-bg);
    color: var(--erd-badge-uq-text);
    border: 1px solid var(--erd-badge-uq-border);
  }

  .attr.ai {
    background: var(--erd-badge-ai-bg);
    color: var(--erd-badge-ai-text);
    border: 1px solid var(--erd-badge-ai-border);
  }

  .attr.ck {
    background: var(--erd-badge-ck-bg, #fef3c7);
    color: var(--erd-badge-ck-text, #a16207);
    border: 1px solid var(--erd-badge-ck-border, #fbbf24);
  }

  .col-filter-hint {
    padding: 1px 8px;
    font-size: 10px;
    color: var(--erd-col-type, #64748b);
    text-align: right;
    opacity: 0.7;
  }

  .no-columns {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--erd-no-col-text);
    font-style: italic;
  }

  .add-column-row {
    text-align: center;
    font-size: 13px;
    color: var(--erd-col-type, #94a3b8);
    cursor: pointer;
    padding: 0;
    border-top: 1px dashed var(--erd-card-border, #e2e8f0);
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease;
  }

  .table-card:hover .add-column-row {
    max-height: 26px;
    padding: 2px 0;
    opacity: 1;
  }

  .add-column-row:hover {
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  }

  /* ── FK drag handle ── */
  .fk-handle {
    position: absolute;
    right: -4px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--erd-badge-fk-border, #93c5fd);
    border: 1.5px solid var(--erd-badge-fk-text, #1e40af);
    opacity: 0;
    cursor: crosshair;
    transition: opacity 0.12s, transform 0.12s;
    z-index: 10;
  }

  .column-row:hover .fk-handle {
    opacity: 0.7;
  }

  .fk-handle:hover {
    opacity: 1 !important;
    transform: translateY(-50%) scale(1.3);
  }

  .column-row.fk-drag-target {
    background: var(--erd-badge-fk-bg, #dbeafe);
    outline: 2px solid var(--erd-badge-fk-border, #93c5fd);
    outline-offset: -2px;
  }

  /* Hide tooltips while FK dragging */
  .table-card.fk-dragging .col-tooltip {
    display: none !important;
  }

  /* ── Table-level tooltip (Unique Keys & Indexes) ── */
  .table-tooltip {
    position: absolute;
    left: calc(100% + 10px);
    top: 0;
    z-index: 200;
    background: var(--erd-tt-bg);
    color: var(--erd-tt-text);
    border: 1px solid var(--erd-tt-border);
    border-radius: var(--erd-tt-radius);
    padding: 8px 10px;
    min-width: 160px;
    max-width: 300px;
    box-shadow: var(--erd-tt-shadow);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }

  .ttt-section + .ttt-section {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--erd-tt-border);
  }

  .ttt-heading {
    font-weight: 700;
    font-size: 11px;
    color: var(--erd-tt-title);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ttt-item {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
    font-size: 11px;
  }

  .ttt-name {
    color: var(--erd-tt-mono);
    font-family: monospace;
    font-size: 11px;
  }

  .ttt-cols {
    color: var(--erd-tt-label);
    font-size: 11px;
  }

  .ttt-unique {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: var(--erd-badge-radius);
    background: var(--erd-badge-uq-bg);
    color: var(--erd-badge-uq-text);
    border: 1px solid var(--erd-badge-uq-border);
  }

  /* ── Tooltip ── */
  .col-tooltip {
    display: none;
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 200;
    background: var(--erd-tt-bg);
    color: var(--erd-tt-text);
    border: 1px solid var(--erd-tt-border);
    border-radius: var(--erd-tt-radius);
    padding: 10px 12px;
    min-width: 190px;
    max-width: 280px;
    box-shadow: var(--erd-tt-shadow);
    font-size: 12px;
    white-space: nowrap;
  }

  .column-row:hover .col-tooltip {
    display: block;
  }

  .tt-title {
    font-weight: 700;
    font-size: 13px;
    color: var(--erd-tt-title);
    margin-bottom: 7px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--erd-tt-border);
  }

  .tt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .tt-label {
    color: var(--erd-tt-label);
    font-size: 11px;
    flex-shrink: 0;
  }

  .tt-mono {
    font-family: monospace;
    font-size: 11px;
    color: var(--erd-tt-mono);
  }

  .tt-yes { color: var(--erd-tt-label); }
  .tt-no  { color: var(--erd-tt-no); font-weight: 600; }

  .tt-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 4px;
  }

  .tt-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--erd-badge-radius);
    letter-spacing: 0.02em;
  }

  .tt-badge.pk  { background: var(--erd-tt-badge-pk); color: var(--erd-tt-badge-text); }
  .tt-badge.fk  { background: var(--erd-tt-badge-fk); color: var(--erd-tt-badge-text); max-width: 240px; white-space: normal; word-break: break-all; }
  .tt-badge.uq  { background: var(--erd-tt-badge-uq); color: var(--erd-tt-badge-text); }
  .tt-badge.ai  { background: var(--erd-tt-badge-ai); color: var(--erd-tt-badge-text); }

  .tt-comment {
    font-style: italic;
    color: var(--erd-tt-label);
    font-size: 11px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--erd-tt-border);
    white-space: normal;
    word-break: break-word;
  }
</style>

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
  import TableCardHeader from './table-card/TableCardHeader.svelte';
  import TableCardColumnRow from './table-card/TableCardColumnRow.svelte';
  import TableCardFooter from './table-card/TableCardFooter.svelte';

  let { table }: { table: Table } = $props();

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
  let isNew = $derived(erdStore.lastAddedTableId === table.id);

  $effect(() => {
    if (isNew) {
      const timer = setTimeout(() => { erdStore.lastAddedTableId = null; }, 600);
      return () => clearTimeout(timer);
    }
  });

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

  // Schemas list
  let schemas = $derived(erdStore.schema.schemas ?? []);

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

  // Unified drag start for mouse and touch
  function startDrag(clientX: number, clientY: number, ctrlKey = false) {
    if (ctrlKey) {
      const newSet = new Set(erdStore.selectedTableIds);
      if (newSet.has(table.id)) newSet.delete(table.id);
      else newSet.add(table.id);
      erdStore.selectedTableIds = newSet;
      return;
    }

    if (erdStore.selectedTableIds.has(table.id) && erdStore.selectedTableIds.size > 1) {
      if (!table.locked && !permissionStore.isReadOnly) {
        isDragging = true;
        dragStart = { mouseX: clientX, mouseY: clientY, tableX: 0, tableY: 0 };
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
    dragStart = { mouseX: clientX, mouseY: clientY, tableX: table.position.x, tableY: table.position.y };
  }

  // Unified drag move
  function continueDrag(clientX: number, clientY: number) {
    if (!isDragging) return;
    const dx = (clientX - dragStart.mouseX) / canvasState.scale;
    const dy = (clientY - dragStart.mouseY) / canvasState.scale;
    if (groupDragStarts && groupDragStarts.size > 1) {
      const moves = [...groupDragStarts].map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy }));
      erdStore.moveTables(moves);
    } else {
      erdStore.moveTable(table.id, dragStart.tableX + dx, dragStart.tableY + dy);
    }
  }

  function endDrag() {
    isDragging = false;
    groupDragStarts = null;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    startDrag(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
  }

  function onMouseMove(e: MouseEvent) { continueDrag(e.clientX, e.clientY); }
  function onMouseUp() { endDrag(); }

  function onTouchStartCard(e: TouchEvent) {
    if (e.touches.length >= 2) { endDrag(); return; }
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }

  function onTouchMoveCard(e: TouchEvent) {
    if (e.touches.length >= 2) { endDrag(); return; }
    e.preventDefault();
    continueDrag(e.touches[0].clientX, e.touches[0].clientY);
  }

  function onTouchEndCard() { endDrag(); }

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

  function onFkDragStart(e: MouseEvent, colId: string, colIdx: number) {
    e.stopPropagation();
    e.preventDefault();
    const commentH = table.comment ? 26 : 0;
    const sx = table.position.x + canvasState.getTableW(table.id);
    const sy = table.position.y + HEADER_H + commentH + colIdx * ROW_H + ROW_H / 2;
    fkDragStore.begin(table.id, colId, sx, sy);
  }

  function onColumnMouseEnter(colId: string) {
    isColumnHovered = true;
    erdStore.hoveredColumnInfo = { tableId: table.id, columnId: colId };
    const fk = table.foreignKeys.find((f) => f.columnIds.includes(colId));
    if (fk) {
      erdStore.hoveredFkInfo = [{
        sourceTableId: table.id, sourceColumnIds: fk.columnIds,
        refTableId: fk.referencedTableId, refColumnIds: fk.referencedColumnIds,
      }];
    } else {
      const col = table.columns.find((c) => c.id === colId);
      if (col?.primaryKey) {
        erdStore.hoveredFkInfo = erdStore.schema.tables.flatMap((t) =>
          t.foreignKeys.filter((f) => f.referencedTableId === table.id && f.referencedColumnIds.includes(colId))
            .map((f) => ({
              sourceTableId: t.id, sourceColumnIds: f.columnIds,
              refTableId: table.id, refColumnIds: f.referencedColumnIds,
            }))
        );
      }
    }
  }

  function onColumnMouseLeave() {
    isColumnHovered = false;
    erdStore.hoveredColumnInfo = null;
    erdStore.hoveredFkInfo = [];
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
  class:flash-new={isNew}
  data-table-id={table.id}
  bind:offsetWidth={cardWidth}
  style="left: {table.position.x}px; top: {table.position.y}px; cursor: {table.locked ? 'default' : isDragging ? 'grabbing' : 'grab'}; z-index: {isHovered ? 20 : isSelected ? 10 : 1}{remoteSelectColor ? `; box-shadow: 0 0 0 2px ${remoteSelectColor}40, 0 0 8px ${remoteSelectColor}30` : ''}"
  onmousedown={onMouseDown}
  ontouchstart={onTouchStartCard}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
>
  <TableCardHeader
    {table}
    {isEditing}
    {editName}
    {schemaDropdownOpen}
    {headerColorOverride}
    {schemas}
    {attachedMemos}
    onheaderdblclick={onHeaderDblClick}
    onnamekeydown={onNameKeyDown}
    oncommitname={commitName}
    oneditnameinput={(val) => editName = val}
    onschematoggle={() => schemaDropdownOpen = !schemaDropdownOpen}
    onschemaassign={assignSchema}
    ondeleteclick={onDeleteClick}
    ondetachmemo={(memoId) => erdStore.detachMemo(memoId)}
  />

  <TableCardFooter
    {table}
    {isHovered}
    {isColumnHovered}
    {isDragging}
    isFkDragging={fkDragStore.active}
  />

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
      {@const isLintHighlighted = erdStore.highlightedColumn?.tableId === table.id && erdStore.highlightedColumn?.columnId === col.id}
      <TableCardColumnRow
        {col}
        {colIdx}
        {table}
        {fk}
        refTableName={refTable?.name}
        refColName={refCol?.name}
        isFkSource={fkSourceIds.has(col.id)}
        isUniqueKeyCol={uniqueKeyColIds.has(col.id)}
        {isFkHighlighted}
        {isUkHighlighted}
        {isIdxHighlighted}
        {isFkDragTarget}
        {isLintHighlighted}
        ondblclick={(e) => onColumnDblClick(e, col.id)}
        onmouseenter={() => onColumnMouseEnter(col.id)}
        onmouseleave={onColumnMouseLeave}
        onfkdragstart={(e) => onFkDragStart(e, col.id, colIdx)}
      />
    {/each}
    {#if displayColumns.length === 0}
      <div class="no-columns">{m.card_no_columns()}</div>
    {/if}
    {#if !permissionStore.isReadOnly && !table.locked}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
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

  .table-card.flash-new {
    animation: flash-new 0.5s ease-out;
  }

  @keyframes flash-new {
    0% { transform: scale(0.92); opacity: 0.5; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4); }
    50% { transform: scale(1.02); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.2); }
    100% { transform: scale(1); opacity: 1; box-shadow: var(--erd-card-shadow); }
  }

  /* Hide tooltips while FK dragging — targets child component tooltips */
  .table-card.fk-dragging :global(.col-tooltip) {
    display: none !important;
  }

  /* ── Column list ── */
  .column-list {
    /* No top padding: first .column-row must start exactly at HEADER_H + commentH,
       matching the colY() formula in RelationLines.svelte. Bottom padding = BOTTOM_PAD. */
    padding: 0 0 8px 0;
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
</style>

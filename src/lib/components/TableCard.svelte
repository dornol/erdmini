<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import type { Table } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  let { table }: { table: Table } = $props();

  let isEditing = $state(false);
  let editName = $state('');
  let isDragging = $state(false);
  let dragStart = { mouseX: 0, mouseY: 0, tableX: 0, tableY: 0 };

  let isSelected = $derived(erdStore.selectedTableIds.has(table.id));

  // Set of column IDs that are FK source columns
  let fkSourceIds = $derived(new Set(table.foreignKeys.map((fk) => fk.columnId)));

  function onHeaderDblClick() {
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

    erdStore.selectedTableId = table.id;
    erdStore.selectedTableIds = new Set([table.id]);
    isDragging = true;
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
    erdStore.moveTable(table.id, dragStart.tableX + dx, dragStart.tableY + dy);
  }

  function onMouseUp() {
    isDragging = false;
  }

  function onColumnDblClick(e: MouseEvent, colId: string) {
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
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="table-card"
  class:selected={isSelected}
  style="left: {table.position.x}px; top: {table.position.y}px; cursor: {isDragging ? 'grabbing' : 'grab'}; z-index: {isSelected ? 10 : 1}"
  onmousedown={onMouseDown}
>
  <!-- Header -->
  <div class="table-header" ondblclick={onHeaderDblClick}>
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
    {/if}
    <button class="delete-btn" onclick={onDeleteClick} title={m.action_delete()}>✕</button>
  </div>

  <!-- Comment (optional) -->
  {#if table.comment}
    <div class="table-comment">{table.comment}</div>
  {/if}

  <!-- Columns -->
  <div class="column-list">
    {#each table.columns as col (col.id)}
      {@const fk = table.foreignKeys.find((f) => f.columnId === col.id)}
      {@const refTable = fk ? erdStore.schema.tables.find((t) => t.id === fk.referencedTableId) : undefined}
      {@const refCol = refTable ? refTable.columns.find((c) => c.id === fk!.referencedColumnId) : undefined}
      {@const isFkHighlighted = erdStore.hoveredFkInfo.some((hfk) =>
        (hfk.sourceTableId === table.id && hfk.sourceColumnId === col.id) ||
        (hfk.refTableId === table.id && hfk.refColumnId === col.id)
      )}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="column-row"
        class:fk-highlighted={isFkHighlighted}
        ondblclick={(e) => onColumnDblClick(e, col.id)}
        onmouseenter={() => {
          erdStore.hoveredColumnInfo = { tableId: table.id, columnId: col.id };
          if (fk) {
            erdStore.hoveredFkInfo = [{
              sourceTableId: table.id, sourceColumnId: col.id,
              refTableId: fk.referencedTableId, refColumnId: fk.referencedColumnId,
            }];
          } else if (col.primaryKey) {
            erdStore.hoveredFkInfo = erdStore.schema.tables.flatMap((t) =>
              t.foreignKeys.filter((f) => f.referencedTableId === table.id && f.referencedColumnId === col.id)
                .map((f) => ({
                  sourceTableId: t.id, sourceColumnId: f.columnId,
                  refTableId: table.id, refColumnId: col.id,
                }))
            );
          }
        }}
        onmouseleave={() => {
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
        <span class="col-type">
          {col.type}{col.length ? `(${col.length})` : ''}{col.nullable ? '?' : ''}
        </span>

        <!-- Attribute badges: UQ / AI -->
        {#if (col.unique && !col.primaryKey) || col.autoIncrement}
          <div class="col-attrs">
            {#if col.unique && !col.primaryKey}
              <span class="attr uq" title="Unique">U</span>
            {/if}
            {#if col.autoIncrement}
              <span class="attr ai" title="Auto Increment">AI</span>
            {/if}
          </div>
        {/if}

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
            {#if col.unique && !col.primaryKey}
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
    {#if table.columns.length === 0}
      <div class="no-columns">{m.card_no_columns()}</div>
    {/if}
  </div>
</div>

<style>
  .table-card {
    position: absolute;
    min-width: 220px;
    background: var(--erd-card-bg);
    border: var(--erd-card-border-width) solid var(--erd-card-border);
    border-radius: var(--erd-card-radius);
    box-shadow: var(--erd-card-shadow);
    user-select: none;
    transition: box-shadow 0.15s, border-color 0.15s;
  }

  .table-card.selected {
    border-color: var(--erd-card-selected-border);
    box-shadow: var(--erd-card-selected-glow), var(--erd-card-shadow);
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
    overflow: hidden;
    text-overflow: ellipsis;
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

  .no-columns {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--erd-no-col-text);
    font-style: italic;
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

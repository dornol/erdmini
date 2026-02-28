<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import type { Table } from '$lib/types/erd';

  let { table }: { table: Table } = $props();

  let isEditing = $state(false);
  let editName = $state('');
  let isDragging = $state(false);
  let dragStart = { mouseX: 0, mouseY: 0, tableX: 0, tableY: 0 };

  let isSelected = $derived(erdStore.selectedTableId === table.id);

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

    erdStore.selectedTableId = table.id;
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

  function onDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    if (window.confirm(`"${table.name}" 테이블을 삭제하시겠습니까?`)) {
      erdStore.deleteTable(table.id);
    }
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
    <button class="delete-btn" onclick={onDeleteClick} title="테이블 삭제">✕</button>
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
      <div class="column-row">

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
            <span class="tt-label">타입</span>
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
              <span class="tt-label">기본값</span>
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
      <div class="no-columns">컬럼 없음</div>
    {/if}
  </div>
</div>

<style>
  .table-card {
    position: absolute;
    min-width: 220px;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    user-select: none;
    transition: box-shadow 0.15s, border-color 0.15s;
  }

  .table-card.selected {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* ── Header ── */
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #1e293b;
    border-radius: 6px 6px 0 0;
    gap: 8px;
  }

  .table-name {
    color: white;
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
    color: white;
    font-size: 13px;
    font-weight: 600;
    padding: 1px 4px;
    outline: none;
  }

  .delete-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
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
    color: #64748b;
    font-style: italic;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
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
  }

  .column-row:hover {
    background: #f1f5f9;
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
    border-radius: 3px;
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .key-badge.pk {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
  }

  .key-badge.fk {
    background: #dbeafe;
    color: #1e40af;
    border: 1px solid #93c5fd;
  }

  /* Column name */
  .col-name {
    flex: 1;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Type + nullable (trailing ?) */
  .col-type {
    color: #64748b;
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
    border-radius: 2px;
    line-height: 1.4;
  }

  .attr.uq {
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #c4b5fd;
  }

  .attr.ai {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .no-columns {
    padding: 6px 10px;
    font-size: 12px;
    color: #94a3b8;
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
    background: #1e293b;
    color: #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 190px;
    max-width: 280px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    font-size: 12px;
    white-space: nowrap;
  }

  .column-row:hover .col-tooltip {
    display: block;
  }

  .tt-title {
    font-weight: 700;
    font-size: 13px;
    color: white;
    margin-bottom: 7px;
    padding-bottom: 7px;
    border-bottom: 1px solid #334155;
  }

  .tt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .tt-label {
    color: #94a3b8;
    font-size: 11px;
    flex-shrink: 0;
  }

  .tt-mono {
    font-family: monospace;
    font-size: 11px;
    color: #a5f3fc;
  }

  .tt-yes { color: #94a3b8; }
  .tt-no  { color: #f87171; font-weight: 600; }

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
    border-radius: 3px;
    letter-spacing: 0.02em;
  }

  .tt-badge.pk  { background: #f59e0b; color: white; }
  .tt-badge.fk  { background: #3b82f6; color: white; max-width: 240px; white-space: normal; word-break: break-all; }
  .tt-badge.uq  { background: #8b5cf6; color: white; }
  .tt-badge.ai  { background: #10b981; color: white; }

  .tt-comment {
    font-style: italic;
    color: #94a3b8;
    font-size: 11px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid #334155;
    white-space: normal;
    word-break: break-word;
  }
</style>

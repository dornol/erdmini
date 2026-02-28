<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import type { Table } from '$lib/types/erd';

  let { table }: { table: Table } = $props();

  let isEditing = $state(false);
  let editName = $state('');
  let isDragging = $state(false);
  let dragStart = { mouseX: 0, mouseY: 0, tableX: 0, tableY: 0 };

  let isSelected = $derived(erdStore.selectedTableId === table.id);

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
      <div class="column-row">
        {#if col.primaryKey}
          <span class="pk-icon" title="Primary Key">🔑</span>
        {:else}
          <span class="pk-icon"></span>
        {/if}
        <span class="col-name">{col.name}</span>
        <span class="col-type">{col.type}{col.length ? `(${col.length})` : ''}</span>
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
    min-width: 200px;
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

  .column-list {
    padding: 4px 0;
  }

  .column-row {
    display: flex;
    align-items: center;
    padding: 3px 10px;
    gap: 6px;
    font-size: 12px;
  }

  .column-row:hover {
    background: #f1f5f9;
  }

  .pk-icon {
    width: 14px;
    font-size: 10px;
    flex-shrink: 0;
  }

  .col-name {
    flex: 1;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-type {
    color: #64748b;
    font-size: 11px;
    flex-shrink: 0;
  }

  .no-columns {
    padding: 6px 10px;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
  }
</style>

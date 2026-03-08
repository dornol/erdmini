<script lang="ts">
  import { tick } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import FkModal from './FkModal.svelte';
  import UniqueKeyModal from './UniqueKeyModal.svelte';
  import IndexModal from './IndexModal.svelte';
  import TableEditorHeader from './table-editor/TableEditorHeader.svelte';
  import TableEditorColumnRow from './table-editor/TableEditorColumnRow.svelte';
  import * as m from '$lib/paraglide/messages';

  let selectedTable = $derived(erdStore.selectedTable);

  // All distinct group names for datalist autocomplete
  let existingGroups = $derived(
    [...new Set(erdStore.schema.tables.map((t) => t.group).filter(Boolean))] as string[]
  );

  // FK modal
  let showFkModal = $state(false);
  let editingFkId = $state<string | undefined>(undefined);

  // UK modal
  let showUkModal = $state(false);

  // Index modal
  let showIdxModal = $state(false);

  function getUkLabel(uk: { columnIds: string[] }) {
    const colNames = uk.columnIds.map((id) => selectedTable?.columns.find((c) => c.id === id)?.name ?? '?');
    return `(${colNames.join(', ')})`;
  }

  function getIdxLabel(idx: { columnIds: string[] }) {
    const colNames = idx.columnIds.map((id) => selectedTable?.columns.find((c) => c.id === id)?.name ?? '?');
    return `(${colNames.join(', ')})`;
  }

  function getFkLabel(fk: { columnIds: string[]; referencedTableId: string; referencedColumnIds: string[]; onDelete: string }) {
    const colNames = fk.columnIds.map((id) => selectedTable?.columns.find((c) => c.id === id)?.name ?? '?');
    const refTable = erdStore.schema.tables.find((t) => t.id === fk.referencedTableId);
    const refColNames = fk.referencedColumnIds.map((id) => refTable?.columns.find((c) => c.id === id)?.name ?? '?');
    return {
      colName: colNames.length === 1 ? colNames[0] : `(${colNames.join(', ')})`,
      refTableName: refTable?.name ?? '?',
      refColName: refColNames.length === 1 ? refColNames[0] : `(${refColNames.join(', ')})`,
      onDelete: fk.onDelete,
    };
  }

  // Column drag reorder
  let dragColId = $state<string | null>(null);
  let dragOverIdx = $state<number | null>(null);

  function onDragStart(e: DragEvent, colId: string) {
    dragColId = colId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', colId);
    }
  }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverIdx = idx;
  }

  function onDrop(e: DragEvent, toIdx: number) {
    e.preventDefault();
    if (dragColId && selectedTable) {
      erdStore.moveColumnToIndex(selectedTable.id, dragColId, toIdx);
    }
    dragColId = null;
    dragOverIdx = null;
  }

  function onDragEnd() {
    dragColId = null;
    dragOverIdx = null;
  }

  // Add column and immediately open popup for editing
  let addBtnEl = $state<HTMLButtonElement | undefined>(undefined);

  async function addColumnAndEdit() {
    const newColId = erdStore.addColumn(selectedTable!.id);
    if (!newColId) return;
    await tick();
    const rect = addBtnEl!.getBoundingClientRect();
    erdStore.editingColumnInfo = {
      tableId: selectedTable!.id,
      columnId: newColId,
      anchorX: rect.left,
      anchorY: rect.top,
    };
  }

  // Open popup for existing column
  function openColumnPopup(colId: string, e: MouseEvent) {
    if (!selectedTable) return;
    const row = (e.currentTarget as HTMLElement);
    const rect = row.getBoundingClientRect();
    erdStore.editingColumnInfo = {
      tableId: selectedTable.id,
      columnId: colId,
      anchorX: rect.left,
      anchorY: rect.top + rect.height / 2,
    };
  }
</script>

{#if selectedTable}
  <aside class="editor" class:readonly={permissionStore.isReadOnly}>
    {#if permissionStore.isReadOnly}
      <div class="readonly-notice">Read Only</div>
    {/if}

    <TableEditorHeader
      table={selectedTable}
      schema={erdStore.schema}
      {existingGroups}
    />

    <!-- Columns (compact) -->
    <div class="section columns-section thin-scrollbar">
      <div class="section-header">
        <span class="field-label">{m.editor_columns()}</span>
        <button class="add-col-btn" bind:this={addBtnEl} onclick={addColumnAndEdit}>
          {m.action_add()}
        </button>
      </div>

      <div class="columns-list" role="listbox" aria-label="Columns">
        {#each selectedTable.columns as col, idx (col.id)}
          <TableEditorColumnRow
            {col}
            {idx}
            tableId={selectedTable.id}
            foreignKeys={selectedTable.foreignKeys}
            {dragOverIdx}
            {dragColId}
            ondragstart={onDragStart}
            ondragover={onDragOver}
            ondrop={onDrop}
            ondragend={onDragEnd}
            onopenPopup={openColumnPopup}
          />
        {:else}
          <p class="no-cols">{m.editor_no_columns()}</p>
        {/each}
      </div>
    </div>

    <!-- Foreign Keys -->
    <div class="section fk-section thin-scrollbar">
      <div class="section-header">
        <span class="field-label">Foreign Keys</span>
        <button class="add-col-btn" onclick={() => { editingFkId = undefined; showFkModal = true; }}>{m.fk_add()}</button>
      </div>

      {#each selectedTable.foreignKeys as fk (fk.id)}
        {@const label = getFkLabel(fk)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fk-row"
          onmouseenter={() => {
            erdStore.hoveredFkInfo = [{
              sourceTableId: selectedTable!.id,
              sourceColumnIds: fk.columnIds,
              refTableId: fk.referencedTableId,
              refColumnIds: fk.referencedColumnIds,
            }];
          }}
          onmouseleave={() => { erdStore.hoveredFkInfo = []; }}
        >
          <span class="fk-col">{label.colName}</span>
          <span class="fk-arrow">→</span>
          <span class="fk-ref">{label.refTableName}.{label.refColName}</span>
          <span class="fk-action">{label.onDelete}</span>
          <button
            class="icon-btn"
            title={m.action_edit()}
            onclick={() => { editingFkId = fk.id; showFkModal = true; }}
          >✎</button>
          <button
            class="icon-btn del"
            title={m.fk_delete()}
            onclick={() => erdStore.deleteForeignKey(selectedTable!.id, fk.id)}
          >✕</button>
        </div>
      {:else}
        <p class="no-cols">{m.editor_no_fk()}</p>
      {/each}
    </div>

    <!-- Unique Keys -->
    <div class="section uk-section thin-scrollbar">
      <div class="section-header">
        <span class="field-label">{m.uq_section()}</span>
        <button class="add-col-btn" onclick={() => (showUkModal = true)}>{m.uq_add()}</button>
      </div>

      {#each selectedTable.uniqueKeys as uk (uk.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fk-row"
          onmouseenter={() => { erdStore.hoveredUkInfo = { tableId: selectedTable!.id, columnIds: uk.columnIds }; }}
          onmouseleave={() => { erdStore.hoveredUkInfo = null; }}
        >
          <span class="fk-col">{getUkLabel(uk)}</span>
          {#if uk.name}
            <span class="fk-action">{uk.name}</span>
          {/if}
          <span style="flex:1"></span>
          <button
            class="icon-btn del"
            title={m.uq_delete()}
            onclick={() => erdStore.deleteUniqueKey(selectedTable!.id, uk.id)}
          >&#x2715;</button>
        </div>
      {:else}
        <p class="no-cols">{m.uq_no_keys()}</p>
      {/each}
    </div>

    <!-- Indexes -->
    <div class="section idx-section thin-scrollbar">
      <div class="section-header">
        <span class="field-label">{m.idx_section()}</span>
        <button class="add-col-btn" onclick={() => (showIdxModal = true)}>{m.idx_add()}</button>
      </div>

      {#each (selectedTable.indexes ?? []) as idx (idx.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fk-row"
          onmouseenter={() => { erdStore.hoveredIdxInfo = { tableId: selectedTable!.id, columnIds: idx.columnIds }; }}
          onmouseleave={() => { erdStore.hoveredIdxInfo = null; }}
        >
          <span class="fk-col">{getIdxLabel(idx)}</span>
          {#if idx.unique}
            <span class="idx-unique-badge">UQ</span>
          {/if}
          {#if idx.name}
            <span class="fk-action">{idx.name}</span>
          {/if}
          <span style="flex:1"></span>
          <button
            class="icon-btn del"
            title={m.idx_delete()}
            onclick={() => erdStore.deleteIndex(selectedTable!.id, idx.id)}
          >&#x2715;</button>
        </div>
      {:else}
        <p class="no-cols">{m.idx_no_indexes()}</p>
      {/each}
    </div>
  </aside>
{:else}
  <aside class="editor editor-empty">
    <p>{m.editor_no_table()}</p>
  </aside>
{/if}

{#if showFkModal && selectedTable}
  <FkModal tableId={selectedTable.id} editFkId={editingFkId} onclose={() => { showFkModal = false; editingFkId = undefined; }} />
{/if}

{#if showUkModal && selectedTable}
  <UniqueKeyModal tableId={selectedTable.id} onclose={() => (showUkModal = false)} />
{/if}

{#if showIdxModal && selectedTable}
  <IndexModal tableId={selectedTable.id} onclose={() => (showIdxModal = false)} />
{/if}

<style>
  .editor {
    width: 320px;
    flex-shrink: 0;
    background: var(--app-card-bg, white);
    border-left: 1px solid var(--app-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor.readonly {
    pointer-events: none;
    opacity: 0.7;
  }

  .editor.readonly .readonly-notice {
    pointer-events: auto;
  }

  .readonly-notice {
    padding: 6px 16px;
    background: #7c3aed20;
    border-bottom: 1px solid #7c3aed40;
    color: #a78bfa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-align: center;
  }

  .editor-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--app-text-faint, #94a3b8);
    font-size: 13px;
  }

  .section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-border-light, #f1f5f9);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .columns-section {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .fk-section,
  .uk-section,
  .idx-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    max-height: 200px;
  }

  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .add-col-btn {
    font-size: 11px;
    color: #3b82f6;
    background: none;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .add-col-btn:hover {
    background: #eff6ff;
  }

  .columns-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .icon-btn {
    background: none;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .icon-btn:hover {
    background: var(--app-hover-bg, #f1f5f9);
    color: var(--app-text, #1e293b);
  }

  .icon-btn.del:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
  }

  .no-cols {
    font-size: 12px;
    color: var(--app-text-faint, #94a3b8);
    text-align: center;
    padding: 16px 0;
  }

  /* FK rows */
  .fk-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: var(--app-panel-bg, #f8fafc);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    font-size: 11px;
  }

  .fk-col {
    color: var(--app-text, #1e293b);
    font-weight: 600;
    flex-shrink: 0;
  }

  .fk-arrow {
    color: var(--app-text-faint, #94a3b8);
    flex-shrink: 0;
  }

  .fk-ref {
    color: #3b82f6;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fk-action {
    color: var(--app-text-muted, #64748b);
    font-size: 10px;
    flex-shrink: 0;
  }

  .idx-unique-badge {
    font-size: 9px;
    font-weight: 700;
    color: #7c3aed;
    background: #ede9fe;
    border: 1px solid #c4b5fd;
    border-radius: 3px;
    padding: 0 4px;
    flex-shrink: 0;
  }
</style>

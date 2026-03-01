<script lang="ts">
  import { tick } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import FkModal from './FkModal.svelte';
  import UniqueKeyModal from './UniqueKeyModal.svelte';
  import IndexModal from './IndexModal.svelte';
  import * as m from '$lib/paraglide/messages';
  import { TABLE_COLOR_IDS, TABLE_COLORS } from '$lib/constants/table-colors';
  import { now } from '$lib/utils/common';

  let selectedTable = $derived(erdStore.selectedTable);

  let tableNameInput = $state('');
  let tableCommentInput = $state('');
  let tableGroupInput = $state('');
  // Plain variable (not $state) — holds the ID of the table being edited.
  // Canvas mousedown sets selectedTableId=null BEFORE blur fires, so we can't
  // rely on selectedTable in blur handlers. capturedTableId persists through that gap.
  let capturedTableId: string | null = null;

  // All distinct group names for datalist autocomplete
  let existingGroups = $derived(
    [...new Set(erdStore.schema.tables.map((t) => t.group).filter(Boolean))] as string[]
  );

  // Color & Group section collapsible (collapsed by default)
  let colorGroupExpanded = $state(false);

  $effect(() => {
    if (selectedTable) {
      tableNameInput = selectedTable.name;
      tableCommentInput = selectedTable.comment ?? '';
      tableGroupInput = selectedTable.group ?? '';
      capturedTableId = selectedTable.id;
    }
  });

  function onTableNameBlur() {
    if (capturedTableId && tableNameInput.trim()) {
      erdStore.updateTableName(capturedTableId, tableNameInput.trim());
    }
  }

  function onTableNameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLElement).blur();
  }

  function saveComment() {
    if (capturedTableId) {
      erdStore.updateTableComment(capturedTableId, tableCommentInput);
    }
  }

  function saveGroup() {
    if (capturedTableId) {
      erdStore.updateTableGroup(capturedTableId, tableGroupInput.trim() || undefined);
    }
  }

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
  let addBtnEl: HTMLButtonElement;

  async function addColumnAndEdit() {
    const newColId = erdStore.addColumn(selectedTable!.id);
    if (!newColId) return;
    await tick();
    const rect = addBtnEl.getBoundingClientRect();
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

  // Check if column is referenced by any FK
  function isFK(colId: string): boolean {
    if (!selectedTable) return false;
    return selectedTable.foreignKeys.some((fk) => fk.columnIds.includes(colId));
  }
</script>

{#if selectedTable}
  <aside class="editor">
    <div class="editor-header">
      <span class="editor-title">{m.editor_title()}</span>
      <button
        class="lock-btn"
        class:locked={selectedTable.locked}
        title={selectedTable.locked ? 'Unlock position' : 'Lock position'}
        onclick={() => {
          const table = erdStore.schema.tables.find((t) => t.id === selectedTable!.id);
          if (table) {
            table.locked = !table.locked;
            erdStore.schema.updatedAt = now();
          }
        }}
      >
        {selectedTable.locked ? '🔒' : '🔓'}
      </button>
    </div>

    <!-- Table name & comment -->
    <div class="section">
      <label class="field-label" for="tbl-name">{m.editor_table_name()}</label>
      <input
        id="tbl-name"
        class="text-input"
        bind:value={tableNameInput}
        onblur={onTableNameBlur}
        onkeydown={onTableNameKeyDown}
      />
      <label class="field-label" for="tbl-comment" style="margin-top:8px">{m.column_comment()}</label>
      <input
        id="tbl-comment"
        class="text-input"
        bind:value={tableCommentInput}
        oninput={saveComment}
        onblur={saveComment}
        placeholder={m.optional()}
      />
    </div>

    <!-- Color & Group (collapsible) -->
    <div class="section color-group-section">
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div class="cg-header" onclick={() => (colorGroupExpanded = !colorGroupExpanded)}>
        <span class="cg-toggle">{colorGroupExpanded ? '▼' : '▶'}</span>
        <span class="cg-label">{m.table_color()} & {m.table_group()}</span>
        {#if !colorGroupExpanded}
          {#if selectedTable.color}
            <span class="cg-dot" style="background:{TABLE_COLORS[selectedTable.color]?.dot ?? '#ccc'}"></span>
          {/if}
          {#if selectedTable.group}
            <span class="cg-group-text">{selectedTable.group}</span>
          {/if}
        {/if}
      </div>

      {#if colorGroupExpanded}
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="field-label" style="margin-top:8px">{m.table_color()}</label>
        <div class="color-dots">
          <button
            class="color-dot color-dot-none"
            class:active={!selectedTable.color}
            title={m.table_color_none()}
            onclick={() => erdStore.updateTableColor(selectedTable!.id, undefined)}
          >
            {#if !selectedTable.color}<span class="dot-check">✓</span>{/if}
          </button>
          {#each TABLE_COLOR_IDS as colorId}
            <button
              class="color-dot"
              class:active={selectedTable.color === colorId}
              style="background:{TABLE_COLORS[colorId].dot}"
              title={colorId}
              onclick={() => erdStore.updateTableColor(selectedTable!.id, colorId)}
            >
              {#if selectedTable.color === colorId}<span class="dot-check">✓</span>{/if}
            </button>
          {/each}
        </div>

        <label class="field-label" for="tbl-group" style="margin-top:8px">{m.table_group()}</label>
        <input
          id="tbl-group"
          class="text-input"
          list="group-list"
          bind:value={tableGroupInput}
          oninput={saveGroup}
          onblur={saveGroup}
          placeholder={m.table_group_placeholder()}
        />
        <datalist id="group-list">
          {#each existingGroups as g}
            <option value={g}></option>
          {/each}
        </datalist>
      {/if}
    </div>

    <!-- Columns (compact) -->
    <div class="section columns-section">
      <div class="section-header">
        <span class="field-label">{m.editor_columns()}</span>
        <button class="add-col-btn" bind:this={addBtnEl} onclick={addColumnAndEdit}>
          {m.action_add()}
        </button>
      </div>

      <div class="columns-list">
        {#each selectedTable.columns as col, idx (col.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
          <div
            class="col-row"
            class:drag-over={dragOverIdx === idx}
            class:dragging={dragColId === col.id}
            draggable="true"
            role="listitem"
            ondragstart={(e) => onDragStart(e, col.id)}
            ondragover={(e) => onDragOver(e, idx)}
            ondrop={(e) => onDrop(e, idx)}
            ondragend={onDragEnd}
            onclick={(e) => {
              // Don't open popup if clicking drag handle or delete button
              const target = e.target as HTMLElement;
              if (target.closest('.drag-handle') || target.closest('.col-del-btn')) return;
              openColumnPopup(col.id, e);
            }}
          >
            <span class="drag-handle" title={m.editor_drag_hint()}>⠿</span>
            {#if col.primaryKey}
              <span class="col-badge col-badge-pk">PK</span>
            {:else if isFK(col.id)}
              <span class="col-badge col-badge-fk">FK</span>
            {/if}
            <span class="col-name">{col.name}</span>
            <span class="col-type-badge">{col.type}{col.length ? `(${col.length}${col.scale != null ? `,${col.scale}` : ''})` : ''}</span>
            <button
              class="col-del-btn"
              title={m.action_delete()}
              onclick={async (e) => {
                e.stopPropagation();
                const table = selectedTable!;
                // Count FKs in this table that use this column
                let fkCount = table.foreignKeys.filter((fk) => fk.columnIds.includes(col.id)).length;
                // Count FKs in other tables that reference this column
                fkCount += erdStore.schema.tables
                  .filter((t) => t.id !== table.id)
                  .reduce((sum, t) => sum + t.foreignKeys.filter(
                    (fk) => fk.referencedTableId === table.id && fk.referencedColumnIds.includes(col.id)
                  ).length, 0);
                if (fkCount > 0) {
                  const ok = await dialogStore.confirm(
                    m.column_delete_fk_confirm({ count: fkCount }),
                    { title: m.action_delete(), confirmText: m.action_delete(), variant: 'danger' }
                  );
                  if (!ok) return;
                }
                erdStore.deleteColumn(table.id, col.id);
              }}
            >✕</button>
          </div>
        {:else}
          <p class="no-cols">{m.editor_no_columns()}</p>
        {/each}
      </div>
    </div>

    <!-- Foreign Keys -->
    <div class="section fk-section">
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
    <div class="section uk-section">
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
    <div class="section idx-section">
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

  .editor-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--app-text-faint, #94a3b8);
    font-size: 13px;
  }

  .editor-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .lock-btn {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .lock-btn:hover {
    opacity: 1;
  }

  .lock-btn.locked {
    opacity: 1;
  }

  .editor-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .columns-section::-webkit-scrollbar {
    width: 6px;
  }

  .columns-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .columns-section::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .columns-section::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  .fk-section,
  .uk-section,
  .idx-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    max-height: 200px;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .fk-section::-webkit-scrollbar,
  .uk-section::-webkit-scrollbar,
  .idx-section::-webkit-scrollbar {
    width: 5px;
  }

  .fk-section::-webkit-scrollbar-track,
  .uk-section::-webkit-scrollbar-track,
  .idx-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .fk-section::-webkit-scrollbar-thumb,
  .uk-section::-webkit-scrollbar-thumb,
  .idx-section::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .fk-section::-webkit-scrollbar-thumb:hover,
  .uk-section::-webkit-scrollbar-thumb:hover,
  .idx-section::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
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

  .text-input {
    width: 100%;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--app-text, #1e293b);
    background: var(--app-input-bg, white);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: #3b82f6;
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

  /* Compact column row */
  .col-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 6px;
    background: var(--app-panel-bg, #f8fafc);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.15s;
    user-select: none;
  }

  .col-row:hover {
    background: var(--app-hover-bg, #f1f5f9);
    border-color: var(--app-border, #e2e8f0);
  }

  .col-row.dragging {
    opacity: 0.4;
  }

  .col-row.drag-over {
    border-color: #3b82f6;
    border-top: 2px solid #3b82f6;
  }

  .drag-handle {
    cursor: grab;
    color: var(--app-text-faint, #94a3b8);
    font-size: 12px;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    color: var(--app-text-secondary, #475569);
  }

  .col-badge {
    font-size: 9px;
    font-weight: 700;
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
    line-height: 1.2;
  }

  .col-badge-pk {
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
  }

  .col-badge-fk {
    color: #1d4ed8;
    background: #dbeafe;
    border: 1px solid #93c5fd;
  }

  .col-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-type-badge {
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    background: var(--app-card-bg, white);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 3px;
    padding: 1px 5px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .col-del-btn {
    display: none;
    background: none;
    border: none;
    font-size: 10px;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    padding: 0 3px;
    line-height: 1;
    flex-shrink: 0;
  }

  .col-row:hover .col-del-btn {
    display: block;
  }

  .col-del-btn:hover {
    color: #ef4444;
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

  /* Color & Group collapsible header */
  .color-group-section {
    padding: 8px 16px;
    border-bottom: 1px solid var(--app-border-light, #f1f5f9);
  }

  .cg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    padding: 2px 0;
  }

  .cg-toggle {
    font-size: 9px;
    color: var(--app-text-muted, #64748b);
    flex-shrink: 0;
    width: 10px;
  }

  .cg-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .cg-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cg-group-text {
    font-size: 11px;
    color: var(--app-text-secondary, #475569);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .color-dots {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: border-color 0.15s, transform 0.1s;
    flex-shrink: 0;
  }

  .color-dot:hover {
    transform: scale(1.15);
  }

  .color-dot.active {
    border-color: #1e293b;
    box-shadow: 0 0 0 1px white inset;
  }

  .color-dot-none {
    background: #ffffff;
    border: 2px dashed #cbd5e1;
  }

  .color-dot-none.active {
    border-style: solid;
    border-color: #1e293b;
  }

  .dot-check {
    font-size: 11px;
    color: #ffffff;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 0 2px rgba(0,0,0,0.4);
  }

  .color-dot-none .dot-check {
    color: #64748b;
    text-shadow: none;
  }
</style>

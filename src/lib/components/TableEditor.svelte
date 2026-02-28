<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { COLUMN_TYPES } from '$lib/types/erd';
  import type { Column } from '$lib/types/erd';
  import FkModal from './FkModal.svelte';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';

  let selectedTable = $derived(erdStore.selectedTable);

  let tableNameInput = $state('');
  let tableCommentInput = $state('');
  // Plain variable (not $state) — holds the ID of the table being edited.
  // Canvas mousedown sets selectedTableId=null BEFORE blur fires, so we can't
  // rely on selectedTable in blur handlers. capturedTableId persists through that gap.
  let capturedTableId: string | null = null;

  $effect(() => {
    if (selectedTable) {
      tableNameInput = selectedTable.name;
      tableCommentInput = selectedTable.comment ?? '';
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

  // Fields managed by a domain — manual edits to these auto-unlink the domain
  const DOMAIN_FIELDS: (keyof Column)[] = [
    'type', 'length', 'nullable', 'primaryKey', 'unique', 'autoIncrement', 'defaultValue',
  ];

  function onColumnChange(col: Column, field: keyof Column, value: unknown) {
    if (!selectedTable) return;
    const patch: Partial<Column> = { [field]: value };
    // Unlink domain if user manually overrides a domain-managed field
    if (col.domainId && DOMAIN_FIELDS.includes(field)) {
      patch.domainId = undefined;
    }
    erdStore.updateColumn(selectedTable.id, col.id, patch);
  }

  // Domain apply — stores the domainId so future domain updates propagate
  function applyDomain(colId: string, domainId: string) {
    if (!selectedTable) return;
    const domain = erdStore.schema.domains.find((d) => d.id === domainId);
    if (!domain) return;
    erdStore.updateColumn(selectedTable.id, colId, {
      domainId,
      type: domain.type,
      length: domain.length,
      nullable: domain.nullable,
      primaryKey: domain.primaryKey,
      unique: domain.unique,
      autoIncrement: domain.autoIncrement,
      defaultValue: domain.defaultValue,
    });
  }

  // FK modal
  let showFkModal = $state(false);

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

  let hasDomains = $derived(erdStore.schema.domains.length > 0);

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
</script>

{#if selectedTable}
  <aside class="editor">
    <div class="editor-header">
      <span class="editor-title">{m.editor_title()}</span>
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

    <!-- Columns -->
    <div class="section columns-section">
      <div class="section-header">
        <span class="field-label">{m.editor_columns()}</span>
        <button class="add-col-btn" onclick={() => erdStore.addColumn(selectedTable!.id)}>
          {m.action_add()}
        </button>
      </div>

      <div class="columns-list">
        {#each selectedTable.columns as col, idx (col.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
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
          >
            <!-- Drag handle + Name -->
            <div class="col-name-row">
              <span class="drag-handle" title={m.editor_drag_hint()}>⠿</span>
              <input
              class="col-input col-name"
              value={col.name}
              oninput={(e) => onColumnChange(col, 'name', (e.target as HTMLInputElement).value)}
              placeholder={m.column_name()}
            />
            </div>

            <!-- Type + Domain apply/badge -->
            <div class="col-type-row">
              <div class="col-type">
                <SearchableSelect
                  options={COLUMN_TYPES.map((t) => ({ value: t, label: t }))}
                  value={col.type}
                  onchange={(v) => onColumnChange(col, 'type', v)}
                  size="sm"
                />
              </div>
              {#if hasDomains}
                {#if col.domainId}
                  {@const linkedDomain = erdStore.schema.domains.find((d) => d.id === col.domainId)}
                  <div class="domain-badge" title={m.domain_linked_hint()}>
                    <span class="domain-badge-name">{linkedDomain?.name ?? '?'}</span>
                    <button
                      class="domain-unlink"
                      aria-label={m.domain_unlink()}
                      onclick={() => onColumnChange(col, 'domainId', undefined)}
                    >✕</button>
                  </div>
                {:else}
                  <div class="domain-select" title={m.domain_apply()}>
                    <SearchableSelect
                      options={erdStore.schema.domains.map((d) => ({ value: d.id, label: d.name }))}
                      value=""
                      onchange={(v) => { if (v) applyDomain(col.id, v); }}
                      placeholder={m.domain_select_placeholder()}
                      size="sm"
                    />
                  </div>
                {/if}
              {/if}
            </div>

            <!-- Flags -->
            <div class="col-flags">
              <label title="Primary Key">
                <input
                  type="checkbox"
                  checked={col.primaryKey}
                  onchange={(e) => onColumnChange(col, 'primaryKey', (e.target as HTMLInputElement).checked)}
                />
                <span>PK</span>
              </label>
              <label title="Not Null">
                <input
                  type="checkbox"
                  checked={!col.nullable}
                  onchange={(e) => onColumnChange(col, 'nullable', !(e.target as HTMLInputElement).checked)}
                />
                <span>NN</span>
              </label>
              <label title="Unique">
                <input
                  type="checkbox"
                  checked={col.unique}
                  onchange={(e) => onColumnChange(col, 'unique', (e.target as HTMLInputElement).checked)}
                />
                <span>UQ</span>
              </label>
              <label title="Auto Increment">
                <input
                  type="checkbox"
                  checked={col.autoIncrement}
                  onchange={(e) => onColumnChange(col, 'autoIncrement', (e.target as HTMLInputElement).checked)}
                />
                <span>AI</span>
              </label>
            </div>

            <!-- Column comment -->
            <input
              class="col-input col-comment"
              value={col.comment ?? ''}
              oninput={(e) => onColumnChange(col, 'comment', (e.target as HTMLInputElement).value || undefined)}
              placeholder={m.column_comment() + ' ' + m.optional()}
            />

            <!-- Move up/down/delete -->
            <div class="col-actions">
              <button
                class="icon-btn"
                title={m.action_move_up()}
                onclick={() => erdStore.moveColumnUp(selectedTable!.id, col.id)}
              >↑</button>
              <button
                class="icon-btn"
                title={m.action_move_down()}
                onclick={() => erdStore.moveColumnDown(selectedTable!.id, col.id)}
              >↓</button>
              <button
                class="icon-btn del"
                title={m.action_delete()}
                onclick={() => erdStore.deleteColumn(selectedTable!.id, col.id)}
              >✕</button>
            </div>
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
        <button class="add-col-btn" onclick={() => (showFkModal = true)}>{m.fk_add()}</button>
      </div>

      {#each selectedTable.foreignKeys as fk (fk.id)}
        {@const label = getFkLabel(fk)}
        <div class="fk-row">
          <span class="fk-col">{label.colName}</span>
          <span class="fk-arrow">→</span>
          <span class="fk-ref">{label.refTableName}.{label.refColName}</span>
          <span class="fk-action">{label.onDelete}</span>
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
  </aside>
{:else}
  <aside class="editor editor-empty">
    <p>{m.editor_no_table()}</p>
  </aside>
{/if}

{#if showFkModal && selectedTable}
  <FkModal tableId={selectedTable.id} onclose={() => (showFkModal = false)} />
{/if}

<style>
  .editor {
    width: 320px;
    flex-shrink: 0;
    background: white;
    border-left: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 13px;
  }

  .editor-header {
    padding: 10px 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .editor-title {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section {
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
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

  .fk-section {
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
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .text-input {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 13px;
    color: #1e293b;
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
    gap: 6px;
  }

  .col-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .col-row.dragging {
    opacity: 0.4;
  }

  .col-row.drag-over {
    border-color: #3b82f6;
    border-top: 2px solid #3b82f6;
  }

  .col-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .drag-handle {
    cursor: grab;
    color: #94a3b8;
    font-size: 14px;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    color: #475569;
  }

  .col-type-row {
    display: flex;
    gap: 4px;
  }

  .col-input {
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 4px 7px;
    font-size: 12px;
    color: #1e293b;
    background: white;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .col-input:focus {
    border-color: #3b82f6;
  }

  .col-type {
    flex: 1;
    min-width: 0;
  }

  .domain-select {
    width: 80px;
    flex-shrink: 0;
  }

  .domain-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    background: #dbeafe;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    padding: 2px 6px;
    flex-shrink: 0;
    max-width: 90px;
  }

  .domain-badge-name {
    font-size: 10px;
    color: #1d4ed8;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .domain-unlink {
    background: none;
    border: none;
    font-size: 9px;
    color: #93c5fd;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  }

  .domain-unlink:hover {
    color: #ef4444;
  }

  .col-comment {
    font-size: 11px;
    color: #64748b;
    font-style: italic;
  }

  .col-flags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .col-flags label {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: #475569;
    cursor: pointer;
    user-select: none;
  }

  .col-flags input[type="checkbox"] {
    cursor: pointer;
  }

  .col-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .icon-btn {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: #64748b;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .icon-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  .icon-btn.del:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
  }

  .no-cols {
    font-size: 12px;
    color: #94a3b8;
    text-align: center;
    padding: 16px 0;
  }

  /* FK rows */
  .fk-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 11px;
  }

  .fk-col {
    color: #1e293b;
    font-weight: 600;
    flex-shrink: 0;
  }

  .fk-arrow {
    color: #94a3b8;
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
    color: #64748b;
    font-size: 10px;
    flex-shrink: 0;
  }
</style>

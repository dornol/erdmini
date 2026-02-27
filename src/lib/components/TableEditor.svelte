<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { COLUMN_TYPES } from '$lib/types/erd';
  import type { Column } from '$lib/types/erd';
  import FkModal from './FkModal.svelte';

  let selectedTable = $derived(erdStore.selectedTable);

  let tableNameInput = $state('');
  let tableCommentInput = $state('');

  $effect(() => {
    if (selectedTable) {
      tableNameInput = selectedTable.name;
      tableCommentInput = selectedTable.comment ?? '';
    }
  });

  function onTableNameBlur() {
    if (selectedTable && tableNameInput.trim()) {
      erdStore.updateTableName(selectedTable.id, tableNameInput.trim());
    }
  }

  function onTableNameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLElement).blur();
  }

  function onTableCommentBlur() {
    if (selectedTable) {
      erdStore.updateTableComment(selectedTable.id, tableCommentInput);
    }
  }

  function onColumnChange(col: Column, field: keyof Column, value: unknown) {
    if (!selectedTable) return;
    erdStore.updateColumn(selectedTable.id, col.id, { [field]: value } as Partial<Column>);
  }

  // Domain apply
  function applyDomain(colId: string, domainId: string) {
    if (!selectedTable) return;
    const domain = erdStore.schema.domains.find((d) => d.id === domainId);
    if (!domain) return;
    erdStore.updateColumn(selectedTable.id, colId, {
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

  function getFkLabel(fk: { columnId: string; referencedTableId: string; referencedColumnId: string; onDelete: string }) {
    const col = selectedTable?.columns.find((c) => c.id === fk.columnId);
    const refTable = erdStore.schema.tables.find((t) => t.id === fk.referencedTableId);
    const refCol = refTable?.columns.find((c) => c.id === fk.referencedColumnId);
    return {
      colName: col?.name ?? '?',
      refTableName: refTable?.name ?? '?',
      refColName: refCol?.name ?? '?',
      onDelete: fk.onDelete,
    };
  }

  let hasDomains = $derived(erdStore.schema.domains.length > 0);
</script>

{#if selectedTable}
  <aside class="editor">
    <div class="editor-header">
      <span class="editor-title">테이블 편집</span>
    </div>

    <!-- Table name & comment -->
    <div class="section">
      <label class="field-label" for="tbl-name">테이블명</label>
      <input
        id="tbl-name"
        class="text-input"
        bind:value={tableNameInput}
        onblur={onTableNameBlur}
        onkeydown={onTableNameKeyDown}
      />
      <label class="field-label" for="tbl-comment" style="margin-top:8px">코멘트</label>
      <input
        id="tbl-comment"
        class="text-input"
        bind:value={tableCommentInput}
        onblur={onTableCommentBlur}
        placeholder="(선택)"
      />
    </div>

    <!-- Columns -->
    <div class="section columns-section">
      <div class="section-header">
        <span class="field-label">컬럼</span>
        <button class="add-col-btn" onclick={() => erdStore.addColumn(selectedTable!.id)}>
          + 추가
        </button>
      </div>

      <div class="columns-list">
        {#each selectedTable.columns as col (col.id)}
          <div class="col-row">
            <!-- Name -->
            <input
              class="col-input col-name"
              value={col.name}
              oninput={(e) => onColumnChange(col, 'name', (e.target as HTMLInputElement).value)}
              placeholder="이름"
            />

            <!-- Type + Domain apply -->
            <div class="col-type-row">
              <select
                class="col-select col-type"
                value={col.type}
                onchange={(e) => onColumnChange(col, 'type', (e.target as HTMLSelectElement).value)}
              >
                {#each COLUMN_TYPES as t}
                  <option value={t}>{t}</option>
                {/each}
              </select>
              {#if hasDomains}
                <select
                  class="col-select domain-select"
                  title="도메인 적용"
                  value=""
                  onchange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    if (v) { applyDomain(col.id, v); (e.target as HTMLSelectElement).value = ''; }
                  }}
                >
                  <option value="">도메인▼</option>
                  {#each erdStore.schema.domains as domain}
                    <option value={domain.id}>{domain.name}</option>
                  {/each}
                </select>
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
              placeholder="코멘트 (선택)"
            />

            <!-- Move up/down/delete -->
            <div class="col-actions">
              <button
                class="icon-btn"
                title="위로"
                onclick={() => erdStore.moveColumnUp(selectedTable!.id, col.id)}
              >↑</button>
              <button
                class="icon-btn"
                title="아래로"
                onclick={() => erdStore.moveColumnDown(selectedTable!.id, col.id)}
              >↓</button>
              <button
                class="icon-btn del"
                title="삭제"
                onclick={() => erdStore.deleteColumn(selectedTable!.id, col.id)}
              >✕</button>
            </div>
          </div>
        {:else}
          <p class="no-cols">컬럼이 없습니다.</p>
        {/each}
      </div>
    </div>

    <!-- Foreign Keys -->
    <div class="section fk-section">
      <div class="section-header">
        <span class="field-label">Foreign Keys</span>
        <button class="add-col-btn" onclick={() => (showFkModal = true)}>+ FK 추가</button>
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
            title="FK 삭제"
            onclick={() => erdStore.deleteForeignKey(selectedTable!.id, fk.id)}
          >✕</button>
        </div>
      {:else}
        <p class="no-cols">FK가 없습니다.</p>
      {/each}
    </div>
  </aside>
{:else}
  <aside class="editor editor-empty">
    <p>테이블을 선택하세요</p>
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
  }

  .col-type-row {
    display: flex;
    gap: 4px;
  }

  .col-input, .col-select {
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

  .col-input:focus, .col-select:focus {
    border-color: #3b82f6;
  }

  .col-type {
    flex: 1;
  }

  .domain-select {
    width: auto;
    flex-shrink: 0;
    font-size: 11px;
    color: #64748b;
    padding: 4px 5px;
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

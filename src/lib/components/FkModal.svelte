<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { REFERENTIAL_ACTIONS } from '$lib/types/erd';
  import type { ReferentialAction } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';

  interface Props {
    tableId: string;
    editFkId?: string;
    onclose: () => void;
  }

  let { tableId, editFkId, onclose }: Props = $props();

  let selectedTable = $derived(erdStore.schema.tables.find((t) => t.id === tableId));
  let allTables = $derived(erdStore.schema.tables);

  let fkRefTableId = $state('');
  let fkOnDelete = $state<ReferentialAction>('RESTRICT');
  let fkOnUpdate = $state<ReferentialAction>('RESTRICT');

  // Composite FK: list of column pairs
  let columnPairs = $state<{ srcColId: string; refColId: string }[]>([{ srcColId: '', refColId: '' }]);

  let isEditMode = $derived(!!editFkId);

  // Initialize from existing FK when editing
  $effect(() => {
    if (editFkId && selectedTable) {
      const fk = selectedTable.foreignKeys.find((f) => f.id === editFkId);
      if (fk) {
        fkRefTableId = fk.referencedTableId;
        fkOnDelete = fk.onDelete ?? 'RESTRICT';
        fkOnUpdate = fk.onUpdate ?? 'RESTRICT';
        columnPairs = fk.columnIds.map((srcId, i) => ({
          srcColId: srcId,
          refColId: fk.referencedColumnIds[i] ?? '',
        }));
      }
    }
  });

  let refTableColumns = $derived(
    erdStore.schema.tables.find((t) => t.id === fkRefTableId)?.columns ?? [],
  );

  function addPair() {
    columnPairs = [...columnPairs, { srcColId: '', refColId: '' }];
  }

  function removePair(idx: number) {
    columnPairs = columnPairs.filter((_, i) => i !== idx);
  }

  let canSubmit = $derived(
    fkRefTableId !== '' &&
    columnPairs.length > 0 &&
    columnPairs.every((p) => p.srcColId !== '' && p.refColId !== ''),
  );

  function submit() {
    if (!canSubmit) return;
    const columnIds = columnPairs.map((p) => p.srcColId);
    const referencedColumnIds = columnPairs.map((p) => p.refColId);
    if (isEditMode && editFkId) {
      erdStore.updateForeignKey(tableId, editFkId, columnIds, fkRefTableId, referencedColumnIds, fkOnDelete, fkOnUpdate);
    } else {
      erdStore.addForeignKey(tableId, columnIds, fkRefTableId, referencedColumnIds, fkOnDelete, fkOnUpdate);
    }
    onclose();
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="backdrop"
  role="dialog"
  aria-modal="true"
  aria-label={m.fk_add()}
  tabindex="-1"
  onclick={onBackdropClick}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">{isEditMode ? m.fk_edit_title({ name: selectedTable?.name ?? '' }) : m.fk_modal_title({ name: selectedTable?.name ?? '' })}</span>
      <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>✕</button>
    </div>

    <div class="modal-body">
      <div class="form-row">
        <label for="fkm-ref-table">{m.fk_ref_table()}</label>
        <SearchableSelect
          options={allTables.map((t) => ({ value: t.id, label: t.name }))}
          value={fkRefTableId}
          onchange={(v) => (fkRefTableId = v)}
          placeholder={m.select_placeholder()}
          size="md"
        />
      </div>

      <!-- Column pairs -->
      <div class="pairs-section">
        <div class="pairs-header">
          <span class="pairs-label">{m.fk_column_label()} / {m.fk_ref_column()}</span>
          <button class="btn-add-pair" onclick={addPair}>{m.fk_add_pair()}</button>
        </div>
        {#each columnPairs as pair, idx}
          <div class="pair-row">
            <div class="pair-select">
              <SearchableSelect
                options={(selectedTable?.columns ?? [])
                  .filter((c) => c.id === pair.srcColId || !columnPairs.some((p) => p.srcColId === c.id))
                  .map((c) => ({ value: c.id, label: c.name }))}
                value={pair.srcColId}
                onchange={(v) => (pair.srcColId = v)}
                placeholder={m.fk_source_column()}
                size="md"
              />
            </div>
            <span class="pair-arrow">→</span>
            <div class="pair-select">
              <SearchableSelect
                options={refTableColumns
                  .filter((c) => c.id === pair.refColId || !columnPairs.some((p) => p.refColId === c.id))
                  .map((c) => ({ value: c.id, label: c.name }))}
                value={pair.refColId}
                onchange={(v) => (pair.refColId = v)}
                placeholder={m.fk_ref_column()}
                disabled={!fkRefTableId}
                size="md"
              />
            </div>
            {#if columnPairs.length > 1}
              <button class="btn-remove-pair" onclick={() => removePair(idx)}>✕</button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="form-row-2col">
        <div class="form-row">
          <span class="form-label">ON DELETE</span>
          <SearchableSelect
            options={REFERENTIAL_ACTIONS.map((a) => ({ value: a, label: a }))}
            value={fkOnDelete}
            onchange={(v) => (fkOnDelete = v as ReferentialAction)}
            size="md"
          />
        </div>
        <div class="form-row">
          <span class="form-label">ON UPDATE</span>
          <SearchableSelect
            options={REFERENTIAL_ACTIONS.map((a) => ({ value: a, label: a }))}
            value={fkOnUpdate}
            onchange={(v) => (fkOnUpdate = v as ReferentialAction)}
            size="md"
          />
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick={onclose}>{m.action_cancel()}</button>
      <button
        class="btn-submit"
        onclick={submit}
        disabled={!canSubmit}
      >
        {isEditMode ? m.action_confirm() : m.action_add_submit()}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 480px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #e2e8f0;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #ef4444;
    background: #fee2e2;
  }

  .modal-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-row label,
  .form-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }


  /* Column pairs section */
  .pairs-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pairs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pairs-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-add-pair {
    font-size: 11px;
    color: #3b82f6;
    background: none;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-add-pair:hover {
    background: #eff6ff;
  }

  .pair-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pair-select {
    flex: 1;
    min-width: 0;
  }

  .pair-arrow {
    color: #94a3b8;
    font-size: 14px;
    flex-shrink: 0;
  }

  .btn-remove-pair {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: #94a3b8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .btn-remove-pair:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 18px;
    border-top: 1px solid #e2e8f0;
  }

  .btn-cancel {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 6px 16px;
    font-size: 13px;
    color: #64748b;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: #f1f5f9;
  }

  .btn-submit {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-submit:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .btn-submit:not(:disabled):hover {
    background: #2563eb;
  }
</style>

<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';
  import ModalBackdrop from './ModalBackdrop.svelte';

  interface Props {
    tableId: string;
    mode: 'unique-key' | 'index';
    onclose: () => void;
  }

  let { tableId, mode, onclose }: Props = $props();

  let selectedTable = $derived(erdStore.schema.tables.find((t) => t.id === tableId));

  let selectedColumnIds = $state<string[]>(['']);
  let constraintName = $state('');
  let isUnique = $state(false);

  const minColumns = $derived(mode === 'unique-key' ? 2 : 1);

  function addColumn() {
    selectedColumnIds = [...selectedColumnIds, ''];
  }

  function removeColumn(idx: number) {
    selectedColumnIds = selectedColumnIds.filter((_, i) => i !== idx);
  }

  let canSubmit = $derived(
    selectedColumnIds.filter((id) => id !== '').length >= minColumns,
  );

  function submit() {
    if (!canSubmit) return;
    const ids = selectedColumnIds.filter((id) => id !== '');
    if (mode === 'unique-key') {
      erdStore.addUniqueKey(tableId, ids, constraintName.trim() || undefined);
    } else {
      erdStore.addIndex(tableId, ids, isUnique, constraintName.trim() || undefined);
    }
    onclose();
  }

  const title = $derived(
    mode === 'unique-key'
      ? m.uq_modal_title({ name: selectedTable?.name ?? '' })
      : m.idx_modal_title({ name: selectedTable?.name ?? '' }),
  );
  const namePlaceholder = $derived(mode === 'unique-key' ? m.uq_name_placeholder() : m.idx_name_placeholder());
  const columnLabel = $derived(mode === 'unique-key' ? m.uq_column_select() : m.idx_column_select());
  const addColumnLabel = $derived(mode === 'unique-key' ? m.uq_add_column() : m.idx_add_column());
  const ariaLabel = $derived(mode === 'unique-key' ? m.uq_section() : m.idx_section());
</script>

<ModalBackdrop {onclose}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
    <div class="modal-header">
      <span class="modal-title">{title}</span>
      <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>&#x2715;</button>
    </div>

    <div class="modal-body">
      <!-- Constraint/Index name -->
      <div class="form-row">
        <label for="constraint-name">{namePlaceholder}</label>
        <input
          id="constraint-name"
          class="text-input"
          bind:value={constraintName}
          placeholder={namePlaceholder}
        />
      </div>

      {#if mode === 'index'}
        <!-- Unique checkbox (index mode only) -->
        <div class="form-row">
          <label class="unique-label">
            <input type="checkbox" bind:checked={isUnique} />
            <span>{m.idx_unique()}</span>
          </label>
        </div>
      {/if}

      <!-- Column selection -->
      <div class="cols-section">
        <div class="cols-header">
          <span class="cols-label">{columnLabel}</span>
          <button class="btn-add-col" onclick={addColumn}>{addColumnLabel}</button>
        </div>
        {#each selectedColumnIds as colId, idx}
          <div class="col-row">
            <div class="col-select">
              <SearchableSelect
                options={(selectedTable?.columns ?? [])
                  .filter((c) => c.id === colId || !selectedColumnIds.includes(c.id))
                  .map((c) => ({ value: c.id, label: c.name }))}
                value={colId}
                onchange={(v) => (selectedColumnIds[idx] = v)}
                placeholder={columnLabel}
                size="md"
              />
            </div>
            {#if selectedColumnIds.length > 1}
              <button class="btn-remove-col" onclick={() => removeColumn(idx)}>&#x2715;</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick={onclose}>{m.action_cancel()}</button>
      <button
        class="btn-submit"
        onclick={submit}
        disabled={!canSubmit}
      >
        {m.action_add_submit()}
      </button>
    </div>
  </div>
</ModalBackdrop>

<style>
  .modal {
    background: white;
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 420px;
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

  .form-row label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .unique-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    text-transform: none !important;
    font-size: 13px !important;
    color: #1e293b !important;
  }

  .unique-label input[type="checkbox"] {
    cursor: pointer;
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

  .cols-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cols-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cols-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-add-col {
    font-size: 11px;
    color: #3b82f6;
    background: none;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-add-col:hover {
    background: #eff6ff;
  }

  .col-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .col-select {
    flex: 1;
    min-width: 0;
  }

  .btn-remove-col {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: #94a3b8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .btn-remove-col:hover {
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

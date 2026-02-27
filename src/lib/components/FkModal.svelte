<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { REFERENTIAL_ACTIONS } from '$lib/types/erd';
  import type { ReferentialAction } from '$lib/types/erd';

  interface Props {
    tableId: string;
    onclose: () => void;
  }

  let { tableId, onclose }: Props = $props();

  let selectedTable = $derived(erdStore.schema.tables.find((t) => t.id === tableId));
  let otherTables = $derived(erdStore.schema.tables.filter((t) => t.id !== tableId));

  let fkColumnId = $state('');
  let fkRefTableId = $state('');
  let fkRefColumnId = $state('');
  let fkOnDelete = $state<ReferentialAction>('RESTRICT');
  let fkOnUpdate = $state<ReferentialAction>('RESTRICT');

  let refTableColumns = $derived(
    erdStore.schema.tables.find((t) => t.id === fkRefTableId)?.columns ?? [],
  );

  function submit() {
    if (!fkColumnId || !fkRefTableId || !fkRefColumnId) return;
    erdStore.addForeignKey(tableId, fkColumnId, fkRefTableId, fkRefColumnId, fkOnDelete, fkOnUpdate);
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
  aria-label="FK 추가"
  tabindex="-1"
  onclick={onBackdropClick}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">FK 추가 — {selectedTable?.name ?? ''}</span>
      <button class="close-btn" onclick={onclose} aria-label="닫기">✕</button>
    </div>

    <div class="modal-body">
      <div class="form-row">
        <label for="fkm-col">컬럼</label>
        <select id="fkm-col" bind:value={fkColumnId}>
          <option value="">선택...</option>
          {#each selectedTable?.columns ?? [] as col}
            <option value={col.id}>{col.name}</option>
          {/each}
        </select>
      </div>

      <div class="form-row">
        <label for="fkm-ref-table">참조 테이블</label>
        <select id="fkm-ref-table" bind:value={fkRefTableId}>
          <option value="">선택...</option>
          {#each otherTables as t}
            <option value={t.id}>{t.name}</option>
          {/each}
        </select>
      </div>

      <div class="form-row">
        <label for="fkm-ref-col">참조 컬럼</label>
        <select id="fkm-ref-col" bind:value={fkRefColumnId} disabled={!fkRefTableId}>
          <option value="">선택...</option>
          {#each refTableColumns as col}
            <option value={col.id}>{col.name}</option>
          {/each}
        </select>
      </div>

      <div class="form-row-2col">
        <div class="form-row">
          <label for="fkm-on-delete">ON DELETE</label>
          <select id="fkm-on-delete" bind:value={fkOnDelete}>
            {#each REFERENTIAL_ACTIONS as a}
              <option value={a}>{a}</option>
            {/each}
          </select>
        </div>
        <div class="form-row">
          <label for="fkm-on-update">ON UPDATE</label>
          <select id="fkm-on-update" bind:value={fkOnUpdate}>
            {#each REFERENTIAL_ACTIONS as a}
              <option value={a}>{a}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick={onclose}>취소</button>
      <button
        class="btn-submit"
        onclick={submit}
        disabled={!fkColumnId || !fkRefTableId || !fkRefColumnId}
      >
        추가
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

  .form-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-row label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-row select {
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 7px 10px;
    font-size: 13px;
    color: #1e293b;
    background: white;
    outline: none;
    width: 100%;
  }

  .form-row select:focus {
    border-color: #3b82f6;
  }

  .form-row select:disabled {
    background: #f8fafc;
    color: #94a3b8;
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

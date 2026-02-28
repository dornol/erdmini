<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { COLUMN_TYPES } from '$lib/types/erd';
  import type { ColumnDomain, ColumnType } from '$lib/types/erd';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let editingId = $state<string | null>(null);
  let showForm = $state(false);

  let formName = $state('');
  let formType = $state<ColumnType>('VARCHAR');
  let formLength = $state<number | undefined>(255);
  let formNullable = $state(false);
  let formPrimaryKey = $state(false);
  let formUnique = $state(false);
  let formAutoIncrement = $state(false);
  let formDefaultValue = $state('');
  let formComment = $state('');

  let hasLength = $derived(
    formType === 'VARCHAR' || formType === 'CHAR' || formType === 'DECIMAL',
  );

  function resetForm() {
    formName = '';
    formType = 'VARCHAR';
    formLength = 255;
    formNullable = false;
    formPrimaryKey = false;
    formUnique = false;
    formAutoIncrement = false;
    formDefaultValue = '';
    formComment = '';
    editingId = null;
    showForm = false;
  }

  function startAdd() {
    resetForm();
    showForm = true;
  }

  function startEdit(domain: ColumnDomain) {
    editingId = domain.id;
    formName = domain.name;
    formType = domain.type;
    formLength = domain.length;
    formNullable = domain.nullable;
    formPrimaryKey = domain.primaryKey;
    formUnique = domain.unique;
    formAutoIncrement = domain.autoIncrement;
    formDefaultValue = domain.defaultValue ?? '';
    formComment = domain.comment ?? '';
    showForm = true;
  }

  function submitForm() {
    if (!formName.trim()) return;
    const fields = {
      name: formName.trim(),
      type: formType,
      length: hasLength ? formLength : undefined,
      nullable: formNullable,
      primaryKey: formPrimaryKey,
      unique: formUnique,
      autoIncrement: formAutoIncrement,
      defaultValue: formDefaultValue || undefined,
      comment: formComment || undefined,
    };
    if (editingId) {
      erdStore.updateDomain(editingId, fields);
    } else {
      erdStore.addDomain(fields);
    }
    resetForm();
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
  aria-label="컬럼 도메인 관리"
  tabindex="-1"
  onclick={onBackdropClick}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">컬럼 도메인 관리</span>
      <button class="close-btn" onclick={onclose} aria-label="닫기">✕</button>
    </div>

    <div class="modal-body">
      <!-- Domain table -->
      <div class="table-wrapper">
        <table class="domain-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>타입</th>
              <th>길이</th>
              <th>NULL</th>
              <th>PK</th>
              <th>UQ</th>
              <th>AI</th>
              <th>기본값</th>
              <th>설명</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {#each erdStore.schema.domains as domain (domain.id)}
              <tr class:editing={editingId === domain.id}>
                <td class="td-name">{domain.name}</td>
                <td class="td-mono">{domain.type}</td>
                <td class="td-mono">{domain.length ?? '—'}</td>
                <td class="td-null">{domain.nullable ? 'NULL' : 'NOT NULL'}</td>
                <td class="td-badge">{#if domain.primaryKey}<span class="badge pk">PK</span>{/if}</td>
                <td class="td-badge">{#if domain.unique}<span class="badge uq">UQ</span>{/if}</td>
                <td class="td-badge">{#if domain.autoIncrement}<span class="badge ai">AI</span>{/if}</td>
                <td class="td-mono td-optional">{domain.defaultValue ?? '—'}</td>
                <td class="td-comment">{domain.comment ?? '—'}</td>
                <td class="td-actions">
                  <button class="icon-btn" onclick={() => startEdit(domain)}>수정</button>
                  <button
                    class="icon-btn del"
                    onclick={() => erdStore.deleteDomain(domain.id)}
                    aria-label="도메인 삭제"
                  >✕</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="10" class="empty-cell">도메인이 없습니다.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Add/Edit form -->
      {#if showForm}
        <div class="form-section">
          <div class="form-section-title">{editingId ? '도메인 수정' : '도메인 추가'}</div>

          <div class="form-row">
            <label for="dm-name">이름</label>
            <input id="dm-name" class="input" bind:value={formName} placeholder="도메인 이름" />
          </div>

          <div class="form-row-2col">
            <div class="form-row">
              <label for="dm-type">타입</label>
              <select id="dm-type" class="input" bind:value={formType}>
                {#each COLUMN_TYPES as t}
                  <option value={t}>{t}</option>
                {/each}
              </select>
            </div>
            {#if hasLength}
              <div class="form-row">
                <label for="dm-length">길이</label>
                <input
                  id="dm-length"
                  class="input"
                  type="number"
                  bind:value={formLength}
                  min="1"
                  max="65535"
                />
              </div>
            {/if}
          </div>

          <div class="form-flags">
            <label><input type="checkbox" bind:checked={formNullable} /> NULL</label>
            <label><input type="checkbox" bind:checked={formPrimaryKey} /> PK</label>
            <label><input type="checkbox" bind:checked={formUnique} /> UQ</label>
            <label><input type="checkbox" bind:checked={formAutoIncrement} /> AI</label>
          </div>

          <div class="form-row">
            <label for="dm-default">기본값</label>
            <input id="dm-default" class="input" bind:value={formDefaultValue} placeholder="(선택)" />
          </div>

          <div class="form-row">
            <label for="dm-comment">설명</label>
            <input id="dm-comment" class="input" bind:value={formComment} placeholder="(선택)" />
          </div>

          <div class="form-actions">
            <button class="btn-cancel" onclick={resetForm}>취소</button>
            <button class="btn-submit" onclick={submitForm} disabled={!formName.trim()}>
              {editingId ? '수정' : '추가'}
            </button>
          </div>
        </div>
      {:else}
        <button class="add-btn" onclick={startAdd}>+ 도메인 추가</button>
      {/if}
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
    width: min(90vw, 780px);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
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
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  /* ── Domain table ── */
  .table-wrapper {
    overflow-x: auto;
  }

  .domain-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .domain-table thead th {
    background: #f1f5f9;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  .domain-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
  }

  .domain-table tbody tr:nth-child(even) {
    background: #f8fafc;
  }

  .domain-table tbody tr:hover {
    background: #f1f5f9;
  }

  .domain-table tbody tr.editing {
    background: #eff6ff;
    outline: 2px solid #3b82f6;
    outline-offset: -1px;
  }

  .domain-table td {
    padding: 6px 8px;
    color: #1e293b;
    vertical-align: middle;
  }

  .td-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .td-mono {
    font-family: monospace;
    color: #475569;
    white-space: nowrap;
  }

  .td-null {
    white-space: nowrap;
    color: #64748b;
    font-size: 11px;
  }

  .td-badge {
    text-align: center;
    width: 32px;
  }

  .td-optional {
    color: #94a3b8;
  }

  .td-comment {
    color: #64748b;
    font-style: italic;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .td-actions {
    display: flex;
    gap: 4px;
    white-space: nowrap;
  }

  .badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .badge.pk {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
  }

  .badge.uq {
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #c4b5fd;
  }

  .badge.ai {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .empty-cell {
    text-align: center;
    padding: 20px;
    color: #94a3b8;
    font-size: 12px;
    font-style: italic;
  }

  .icon-btn {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    color: #64748b;
    cursor: pointer;
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

  /* ── Form ── */
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px;
  }

  .form-section-title {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .form-row label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .input {
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 13px;
    color: #1e293b;
    background: white;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .input:focus {
    border-color: #3b82f6;
  }

  .form-flags {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .form-flags label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #475569;
    cursor: pointer;
    user-select: none;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .add-btn {
    background: none;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    padding: 8px;
    font-size: 12px;
    color: #64748b;
    cursor: pointer;
    width: 100%;
    transition: border-color 0.15s, color 0.15s;
  }

  .add-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .btn-cancel {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 6px 14px;
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
    padding: 6px 14px;
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

<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { TABLE_COLOR_IDS, TABLE_COLORS } from '$lib/constants/table-colors';
  import type { TableColorId } from '$lib/constants/table-colors';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    tableIds: string[];
    onclose: () => void;
  }

  let { tableIds, onclose }: Props = $props();

  // Checkbox toggles for each field
  let colorEnabled = $state(false);
  let groupEnabled = $state(false);
  let commentEnabled = $state(false);

  // Field values
  let selectedColor = $state<TableColorId | undefined>(undefined);
  let groupValue = $state('');
  let commentValue = $state('');

  // All distinct group names for datalist autocomplete
  let existingGroups = $derived(
    [...new Set(erdStore.schema.tables.map((t) => t.group).filter(Boolean))] as string[]
  );

  let canSubmit = $derived(
    (colorEnabled || groupEnabled || commentEnabled) && !permissionStore.isReadOnly
  );

  function submit() {
    if (!canSubmit) return;
    // Push snapshot before bulk changes for single undo
    erdStore.pushSnapshotRaw(
      JSON.stringify($state.snapshot(erdStore.schema)),
      'history_edit',
      ''
    );
    for (const id of tableIds) {
      if (colorEnabled) {
        erdStore.updateTableColor(id, selectedColor);
      }
      if (groupEnabled) {
        erdStore.updateTableGroup(id, groupValue.trim() || undefined);
      }
      if (commentEnabled) {
        erdStore.updateTableComment(id, commentValue);
      }
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
  aria-label={m.bulk_edit_title()}
  tabindex="-1"
  onclick={onBackdropClick}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">{m.bulk_edit_title()} — {m.bulk_edit_count({ count: tableIds.length })}</span>
      <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>✕</button>
    </div>

    <div class="modal-body">
      <!-- Color -->
      <div class="field-row">
        <label class="field-toggle">
          <input type="checkbox" bind:checked={colorEnabled} />
          <span class="field-label">{m.bulk_edit_color()}</span>
        </label>
        {#if colorEnabled}
          <div class="color-dots">
            <button
              class="color-dot color-dot-none"
              class:active={!selectedColor}
              title={m.table_color_none()}
              onclick={() => (selectedColor = undefined)}
            >
              {#if !selectedColor}<span class="dot-check">✓</span>{/if}
            </button>
            {#each TABLE_COLOR_IDS as colorId}
              <button
                class="color-dot"
                class:active={selectedColor === colorId}
                style="background:{TABLE_COLORS[colorId].dot}"
                title={colorId}
                onclick={() => (selectedColor = colorId)}
              >
                {#if selectedColor === colorId}<span class="dot-check">✓</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Group -->
      <div class="field-row">
        <label class="field-toggle">
          <input type="checkbox" bind:checked={groupEnabled} />
          <span class="field-label">{m.bulk_edit_group()}</span>
        </label>
        {#if groupEnabled}
          <input
            class="text-input"
            type="text"
            list="bulk-group-list"
            bind:value={groupValue}
            placeholder={m.table_group_placeholder()}
          />
          <datalist id="bulk-group-list">
            {#each existingGroups as g}
              <option value={g}></option>
            {/each}
          </datalist>
        {/if}
      </div>

      <!-- Comment -->
      <div class="field-row">
        <label class="field-toggle">
          <input type="checkbox" bind:checked={commentEnabled} />
          <span class="field-label">{m.bulk_edit_comment()}</span>
        </label>
        {#if commentEnabled}
          <input
            class="text-input"
            type="text"
            bind:value={commentValue}
            placeholder={m.column_comment()}
          />
        {/if}
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick={onclose}>{m.action_cancel()}</button>
      <button
        class="btn-submit"
        onclick={submit}
        disabled={!canSubmit}
      >
        {m.bulk_edit_apply()}
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
    gap: 16px;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .field-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #3b82f6;
    cursor: pointer;
    flex-shrink: 0;
  }

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
  }

  .text-input {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 13px;
    color: #1e293b;
    background: white;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: #3b82f6;
  }

  .color-dots {
    display: grid;
    grid-template-columns: repeat(auto-fill, 22px);
    gap: 5px;
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

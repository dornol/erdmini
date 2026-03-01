<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { COLUMN_TYPES, DOMAIN_FIELDS } from '$lib/types/erd';
  import type { Column } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';

  interface Props {
    tableId: string;
    columnId: string;
    anchorX: number;
    anchorY: number;
    onclose: () => void;
  }

  let { tableId, columnId, anchorX, anchorY, onclose }: Props = $props();

  let col = $derived(
    erdStore.schema.tables.find((t) => t.id === tableId)?.columns.find((c) => c.id === columnId),
  );

  function onChange(field: keyof Column, value: unknown) {
    if (!col) return;
    const patch: Partial<Column> = { [field]: value };
    if (col.domainId && DOMAIN_FIELDS.includes(field)) patch.domainId = undefined;
    erdStore.updateColumn(tableId, columnId, patch);
  }

  let hasLength = $derived(
    col?.type === 'VARCHAR' || col?.type === 'CHAR' || col?.type === 'DECIMAL',
  );

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  // Adjust position so popup stays inside viewport after mount
  let popupEl: HTMLDivElement;
  $effect(() => {
    if (!popupEl) return;
    const rect = popupEl.getBoundingClientRect();
    let left = anchorX + 14;
    let top = anchorY - 10;
    if (left + rect.width > window.innerWidth - 8) left = anchorX - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    popupEl.style.left = `${Math.max(8, left)}px`;
    popupEl.style.top = `${Math.max(8, top)}px`;
  });
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="backdrop"
  onmousedown={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="popup"
    bind:this={popupEl}
    style="left: {anchorX + 14}px; top: {anchorY - 10}px;"
    role="dialog"
    aria-label={m.editor_title()}
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
  >
    {#if col}
      <div class="popup-header">
        <span class="popup-title">{col.name}</span>
        <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>✕</button>
      </div>

      <div class="popup-body">
        <!-- Name -->
        <div class="field-row">
          <label for="ce-name" class="field-label">{m.column_name()}</label>
          <input
            id="ce-name"
            class="field-input"
            value={col.name}
            oninput={(e) => onChange('name', (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- Type + Length -->
        <div class="field-row-2col">
          <div class="field-row">
            <label for="ce-type" class="field-label">{m.column_type()}</label>
            <SearchableSelect
              options={COLUMN_TYPES.map((t) => ({ value: t, label: t }))}
              value={col.type}
              onchange={(v) => onChange('type', v)}
              size="md"
            />
          </div>
          {#if hasLength}
            <div class="field-row">
              <label for="ce-length" class="field-label">{m.column_length()}</label>
              <input
                id="ce-length"
                class="field-input"
                type="number"
                value={col.length ?? ''}
                oninput={(e) => onChange('length', Number((e.target as HTMLInputElement).value) || undefined)}
                min="1"
                max="65535"
              />
            </div>
          {/if}
        </div>

        <!-- Flags -->
        <div class="flags-row">
          <label class="flag-label">
            <input
              type="checkbox"
              checked={col.primaryKey}
              onchange={(e) => onChange('primaryKey', (e.target as HTMLInputElement).checked)}
            />
            PK
          </label>
          <label class="flag-label">
            <input
              type="checkbox"
              checked={!col.nullable}
              onchange={(e) => onChange('nullable', !(e.target as HTMLInputElement).checked)}
            />
            NN
          </label>
          <label class="flag-label">
            <input
              type="checkbox"
              checked={col.unique}
              onchange={(e) => onChange('unique', (e.target as HTMLInputElement).checked)}
            />
            UQ
          </label>
          <label class="flag-label">
            <input
              type="checkbox"
              checked={col.autoIncrement}
              onchange={(e) => onChange('autoIncrement', (e.target as HTMLInputElement).checked)}
            />
            AI
          </label>
        </div>

        <!-- Default value -->
        <div class="field-row">
          <label for="ce-default" class="field-label">{m.column_default()}</label>
          <input
            id="ce-default"
            class="field-input"
            value={col.defaultValue ?? ''}
            oninput={(e) => onChange('defaultValue', (e.target as HTMLInputElement).value || undefined)}
            placeholder={m.none_placeholder()}
          />
        </div>

        <!-- CHECK constraint -->
        <div class="field-row">
          <label for="ce-check" class="field-label">{m.column_check()}</label>
          <input
            id="ce-check"
            class="field-input field-check"
            value={col.check ?? ''}
            oninput={(e) => onChange('check', (e.target as HTMLInputElement).value || undefined)}
            placeholder={m.column_check_placeholder()}
          />
        </div>

        <!-- Comment -->
        <div class="field-row">
          <label for="ce-comment" class="field-label">{m.column_comment()}</label>
          <input
            id="ce-comment"
            class="field-input field-comment"
            value={col.comment ?? ''}
            oninput={(e) => onChange('comment', (e.target as HTMLInputElement).value || undefined)}
            placeholder={m.none_placeholder()}
          />
        </div>
      </div>
    {:else}
      <div class="popup-header">
        <span class="popup-title">{m.editor_title()}</span>
        <button class="close-btn" onclick={onclose}>✕</button>
      </div>
      <div class="popup-body">
        <p style="color: #94a3b8; font-size: 12px; text-align: center; padding: 8px 0;">
          {m.column_not_found()}
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 800;
    background: transparent;
  }

  .popup {
    position: absolute;
    width: 280px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1e293b;
  }

  .popup-title {
    font-size: 13px;
    font-weight: 600;
    color: white;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
    flex-shrink: 0;
  }

  .close-btn:hover {
    color: #f87171;
    background: rgba(255, 255, 255, 0.1);
  }

  .popup-body {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .field-label {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    color: #1e293b;
    background: white;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .field-input:focus {
    border-color: #3b82f6;
  }

  .field-check {
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    color: #7c3aed;
    font-size: 12px;
  }

  .field-comment {
    font-style: italic;
    color: #64748b;
  }

  .flags-row {
    display: flex;
    gap: 12px;
    padding: 2px 0;
  }

  .flag-label {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    user-select: none;
  }
</style>

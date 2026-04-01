<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
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
    if (!col || permissionStore.isReadOnly) return;
    const patch: Partial<Column> = { [field]: value };
    if (col.domainId && DOMAIN_FIELDS.includes(field)) patch.domainId = undefined;
    erdStore.updateColumn(tableId, columnId, patch);
  }

  let hasLength = $derived(
    col?.type === 'VARCHAR' || col?.type === 'CHAR' || col?.type === 'DECIMAL',
  );

  let isDecimal = $derived(col?.type === 'DECIMAL');

  let hasDomains = $derived(erdStore.schema.domains.length > 0);

  const DEFAULT_VALUE_PRESETS: Record<string, string[]> = {
    INT: ['0', '1', 'NULL'],
    BIGINT: ['0', '1', 'NULL'],
    SMALLINT: ['0', '1', 'NULL'],
    TINYINT: ['0', '1', 'NULL'],
    MEDIUMINT: ['0', '1', 'NULL'],
    VARCHAR: ["''", 'NULL'],
    CHAR: ["''", 'NULL'],
    TEXT: ["''", 'NULL'],
    BOOLEAN: ['TRUE', 'FALSE', 'NULL'],
    BIT: ['TRUE', 'FALSE', 'NULL'],
    DATE: ['CURRENT_TIMESTAMP', 'NOW()', 'NULL'],
    DATETIME: ['CURRENT_TIMESTAMP', 'NOW()', 'NULL'],
    TIMESTAMP: ['CURRENT_TIMESTAMP', 'NOW()', 'NULL'],
    DECIMAL: ['0', '0.0', 'NULL'],
    FLOAT: ['0', '0.0', 'NULL'],
    DOUBLE: ['0', '0.0', 'NULL'],
    NUMERIC: ['0', '0.0', 'NULL'],
    UUID: ['UUID()', 'GEN_RANDOM_UUID()', 'NULL'],
  };

  let presetOpen = $state(false);
  let presetIdx = $state(-1);
  let currentPresets = $derived(
    col ? (DEFAULT_VALUE_PRESETS[col.type] ?? ['NULL']) : ['NULL']
  );

  function onPresetKeyDown(e: KeyboardEvent) {
    if (!presetOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        presetOpen = true;
        presetIdx = 0;
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      presetIdx = (presetIdx + 1) % currentPresets.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      presetIdx = (presetIdx - 1 + currentPresets.length) % currentPresets.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (presetIdx >= 0 && presetIdx < currentPresets.length) {
        const preset = currentPresets[presetIdx];
        onChange('defaultValue', preset === 'NULL' ? undefined : preset);
      }
      presetOpen = false;
      presetIdx = -1;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      presetOpen = false;
      presetIdx = -1;
    }
  }

  function applyDomain(domainId: string) {
    if (permissionStore.isReadOnly) return;
    const domain = erdStore.schema.domains.find((d) => d.id === domainId);
    if (!domain) return;
    erdStore.updateColumn(tableId, columnId, {
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

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  // Auto-select name for new columns (column_N pattern)
  let nameInputEl = $state<HTMLInputElement | undefined>(undefined);
  $effect(() => {
    if (nameInputEl && col && /^column_\d+$/.test(col.name)) {
      nameInputEl.select();
    }
  });

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
        {#if !permissionStore.isReadOnly}
          <button
            class="duplicate-btn"
            title={m.column_duplicate()}
            onclick={() => { erdStore.duplicateColumn(tableId, columnId); onclose(); }}
          >⧉</button>
          <button
            class="delete-col-btn"
            title={m.action_delete()}
            onclick={() => { erdStore.deleteColumn(tableId, columnId); onclose(); }}
          >🗑</button>
        {/if}
        <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>✕</button>
      </div>

      <div class="popup-body">
        <!-- Name -->
        <div class="field-row">
          <label for="ce-name" class="field-label">{m.column_name()}</label>
          <input
            id="ce-name"
            class="field-input"
            bind:this={nameInputEl}
            value={col.name}
            oninput={(e) => onChange('name', (e.target as HTMLInputElement).value)}
          />
        </div>

        <!-- Type + Length + Scale -->
        <div class="field-row-2col" style={isDecimal ? 'grid-template-columns: 1fr 1fr 1fr;' : ''}>
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
              <label for="ce-length" class="field-label">{isDecimal ? 'P' : m.column_length()}</label>
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
          {#if isDecimal}
            <div class="field-row">
              <label for="ce-scale" class="field-label">{m.label_scale()}</label>
              <input
                id="ce-scale"
                class="field-input"
                type="number"
                value={col.scale ?? ''}
                oninput={(e) => onChange('scale', Number((e.target as HTMLInputElement).value) || undefined)}
                min="0"
                max="30"
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
          <div class="default-value-row">
            <input
              id="ce-default"
              class="field-input"
              value={col.defaultValue ?? ''}
              oninput={(e) => onChange('defaultValue', (e.target as HTMLInputElement).value || undefined)}
              placeholder={m.none_placeholder()}
            />
            <div class="preset-wrap">
              <button
                class="preset-btn"
                onclick={() => { presetOpen = !presetOpen; presetIdx = presetOpen ? 0 : -1; }}
                onkeydown={onPresetKeyDown}
                title={m.label_presets()}
              >▼</button>
              {#if presetOpen}
                <div class="preset-dropdown">
                  {#each currentPresets as preset, pi}
                    <button
                      class="preset-item"
                      class:preset-highlighted={pi === presetIdx}
                      onclick={() => { onChange('defaultValue', preset === 'NULL' ? undefined : preset); presetOpen = false; presetIdx = -1; }}
                    >{preset}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- ENUM values (only when type is ENUM) -->
        {#if col.type === 'ENUM'}
          <div class="field-row">
            <label for="ce-enum" class="field-label">{m.label_enum()}</label>
            <input
              id="ce-enum"
              class="field-input"
              value={(col.enumValues ?? []).join(', ')}
              oninput={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
                onChange('enumValues', values.length > 0 ? values : undefined);
              }}
              placeholder={m.label_enum_placeholder()}
            />
          </div>
        {/if}

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

        <!-- Domain -->
        {#if hasDomains}
          <div class="field-row">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="field-label">{m.label_domain()}</label>
            {#if col.domainId}
              {@const linkedDomain = erdStore.schema.domains.find((d) => d.id === col.domainId)}
              <div class="domain-badge">
                <span class="domain-badge-name">{linkedDomain?.name ?? '?'}</span>
                <button
                  class="domain-unlink"
                  aria-label={m.domain_unlink()}
                  onclick={() => onChange('domainId', undefined)}
                >✕</button>
              </div>
            {:else}
              <SearchableSelect
                options={erdStore.schema.domains.map((d) => ({ value: d.id, label: d.name }))}
                value=""
                onchange={(v) => { if (v) applyDomain(v); }}
                placeholder={m.domain_select_placeholder()}
                size="md"
              />
            {/if}
          </div>
        {/if}
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
    background: var(--app-popup-bg, white);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 10px;
    box-shadow: var(--app-popup-shadow, 0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08));
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

  .duplicate-btn {
    background: none;
    border: none;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
    flex-shrink: 0;
  }

  .duplicate-btn:hover {
    color: #93c5fd;
    background: rgba(255, 255, 255, 0.1);
  }

  .delete-col-btn {
    background: none;
    border: none;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
    flex-shrink: 0;
  }

  .delete-col-btn:hover {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
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
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--app-text, #1e293b);
    background: var(--app-input-bg, white);
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
    color: var(--app-text-muted, #64748b);
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
    color: var(--app-text-secondary, #475569);
    cursor: pointer;
    user-select: none;
  }

  .default-value-row {
    display: flex;
    gap: 4px;
    align-items: flex-start;
  }

  .default-value-row .field-input {
    flex: 1;
    min-width: 0;
  }

  .preset-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .preset-btn {
    background: var(--app-input-bg, white);
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 5px;
    padding: 5px 6px;
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    line-height: 1;
  }

  .preset-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .preset-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 2px;
    background: var(--app-popup-bg, white);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 130px;
    z-index: 10;
    padding: 4px 0;
  }

  .preset-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 5px 10px;
    font-size: 12px;
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    color: var(--app-text, #1e293b);
    cursor: pointer;
  }

  .preset-item:hover,
  .preset-item.preset-highlighted {
    background: #eff6ff;
    color: #2563eb;
  }

  .domain-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #dbeafe;
    border: 1px solid #93c5fd;
    border-radius: 5px;
    padding: 4px 8px;
  }

  .domain-badge-name {
    font-size: 12px;
    color: #1d4ed8;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .domain-unlink {
    background: none;
    border: none;
    font-size: 10px;
    color: #93c5fd;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
  }

  .domain-unlink:hover {
    color: #ef4444;
  }
</style>

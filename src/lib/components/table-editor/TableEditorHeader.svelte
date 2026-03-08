<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import ColorDotPicker from '../ColorDotPicker.svelte';
  import * as m from '$lib/paraglide/messages';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import type { TableColorId } from '$lib/constants/table-colors';
  import type { Table, ERDSchema } from '$lib/types/erd';
  import { now } from '$lib/utils/common';
  import { getEffectiveColor } from '$lib/utils/table-color';

  let {
    table,
    schema,
    existingGroups,
  }: {
    table: Table;
    schema: ERDSchema;
    existingGroups: string[];
  } = $props();

  let tableNameInput = $state('');
  let tableCommentInput = $state('');
  let tableGroupInput = $state('');
  // Plain variable — holds the ID of the table being edited.
  // Canvas mousedown sets selectedTableId=null BEFORE blur fires, so we can't
  // rely on selectedTable in blur handlers. capturedTableId persists through that gap.
  let capturedTableId: string | null = null;

  // Color & Group section collapsible (collapsed by default)
  let colorGroupExpanded = $state(false);

  $effect(() => {
    if (table) {
      tableNameInput = table.name;
      tableCommentInput = table.comment ?? '';
      tableGroupInput = table.group ?? '';
      capturedTableId = table.id;
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
</script>

<div class="editor-header">
  <span class="editor-title">{m.editor_title()}</span>
  <button
    class="id-badge"
    title="Copy table ID"
    onclick={() => {
      navigator.clipboard.writeText(table.id);
    }}
  >{table.id}</button>
  <button
    class="lock-btn"
    class:locked={table.locked}
    title={table.locked ? 'Unlock position' : 'Lock position'}
    onclick={() => {
      const t = erdStore.schema.tables.find((tt) => tt.id === table.id);
      if (t) {
        t.locked = !t.locked;
        erdStore.schema.updatedAt = now();
      }
    }}
  >
    {table.locked ? '🔒' : '🔓'}
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
  <button class="cg-header" onclick={() => (colorGroupExpanded = !colorGroupExpanded)} type="button">
    <span class="cg-toggle">{colorGroupExpanded ? '▼' : '▶'}</span>
    <span class="cg-label">{m.table_color()} & {m.table_group()}</span>
    {#if !colorGroupExpanded}
      {@const effectiveId = getEffectiveColor(table, schema)}
      {#if effectiveId}
        <span class="cg-dot" style="background:{TABLE_COLORS[effectiveId]?.dot ?? '#ccc'}"></span>
      {/if}
      {#if table.group}
        <span class="cg-group-text">{table.group}</span>
      {/if}
    {/if}
  </button>

  {#if colorGroupExpanded}
    {@const inheritedColor = table.group ? schema.groupColors?.[table.group] as TableColorId | undefined : undefined}
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="field-label" style="margin-top:8px">{m.table_color()}</label>
    {#if !table.color && inheritedColor}
      <div class="color-inherited-hint">
        <span class="inherited-dot" style="background:{TABLE_COLORS[inheritedColor]?.dot ?? '#ccc'}"></span>
        <span class="inherited-text">{m.group_color_inherited()}</span>
      </div>
    {/if}
    <ColorDotPicker value={table.color} onchange={(c) => erdStore.updateTableColor(table.id, c)} />
    {#if table.color && inheritedColor}
      <button
        class="reset-to-group-btn"
        onclick={() => erdStore.updateTableColor(table.id, undefined)}
      >{m.group_color_use()}</button>
    {/if}

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

    {#if (schema.schemas?.length ?? 0) > 0}
      <label class="field-label" for="tbl-schema" style="margin-top:8px">Schema</label>
      <select
        id="tbl-schema"
        class="text-input"
        value={table.schema ?? ''}
        onchange={(e) => erdStore.updateTableSchema(table.id, (e.target as HTMLSelectElement).value || undefined)}
      >
        <option value="">({m.schema_tab_all()})</option>
        {#each schema.schemas ?? [] as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    {/if}
  {/if}
</div>

<style>
  .editor-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    display: flex;
    align-items: center;
    gap: 8px;
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
    margin-left: auto;
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

  .id-badge {
    font-size: 10px;
    font-family: monospace;
    color: var(--app-text-faint, #94a3b8);
    background: var(--app-badge-bg, #f1f5f9);
    border: 1px solid var(--app-badge-border, #e2e8f0);
    border-radius: 3px;
    padding: 1px 5px;
    cursor: pointer;
    line-height: 1.4;
  }

  .id-badge:hover {
    color: var(--app-text-muted, #64748b);
    background: var(--app-hover-bg, #e2e8f0);
  }

  .section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-border-light, #f1f5f9);
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
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    width: 100%;
    text-align: left;
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

  .color-inherited-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
  }

  .inherited-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .inherited-text {
    font-style: italic;
  }

  .reset-to-group-btn {
    margin-top: 6px;
    font-size: 11px;
    color: #3b82f6;
    background: none;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .reset-to-group-btn:hover {
    background: #eff6ff;
  }
</style>

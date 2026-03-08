<script lang="ts">
  import { canvasState } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import type { Column, ForeignKey, Table } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    col: Column;
    colIdx: number;
    table: Table;
    fk: ForeignKey | undefined;
    refTableName: string | undefined;
    refColName: string | undefined;
    isFkSource: boolean;
    isUniqueKeyCol: boolean;
    isFkHighlighted: boolean;
    isUkHighlighted: boolean;
    isIdxHighlighted: boolean;
    isFkDragTarget: boolean;
    ondblclick: (e: MouseEvent) => void;
    onmouseenter: () => void;
    onmouseleave: () => void;
    onfkdragstart: (e: MouseEvent) => void;
  }

  let {
    col,
    colIdx,
    table,
    fk,
    refTableName,
    refColName,
    isFkSource,
    isUniqueKeyCol,
    isFkHighlighted,
    isUkHighlighted,
    isIdxHighlighted,
    isFkDragTarget,
    ondblclick,
    onmouseenter,
    onmouseleave,
    onfkdragstart,
  }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="column-row"
  class:fk-highlighted={isFkHighlighted || isUkHighlighted || isIdxHighlighted}
  class:fk-drag-target={isFkDragTarget}
  data-table-id={table.id}
  data-column-id={col.id}
  ondblclick={ondblclick}
  {onmouseenter}
  {onmouseleave}
>

  <!-- Key badge: PK (gold) or FK (blue) or nothing -->
  <div class="col-key">
    {#if col.primaryKey}
      <span class="key-badge pk" title={m.tt_primary_key()}>PK</span>
    {:else if isFkSource}
      <span class="key-badge fk" title="FK">FK</span>
    {/if}
  </div>

  <!-- Column name -->
  <span class="col-name">{col.name}</span>

  <!-- Type + nullable indicator -->
  {#if canvasState.columnDisplayMode !== 'names-only'}
    <span class="col-type">
      {col.type}{col.length ? `(${col.length})` : ''}{col.nullable ? '?' : ''}
    </span>

    <!-- Attribute badges: UQ / AI / CK -->
    {#if ((col.unique || isUniqueKeyCol) && !col.primaryKey) || col.autoIncrement || col.check}
      <div class="col-attrs">
        {#if (col.unique || isUniqueKeyCol) && !col.primaryKey}
          <span class="attr uq" title={m.tt_unique()}>U</span>
        {/if}
        {#if col.autoIncrement}
          <span class="attr ai" title={m.tt_auto_increment()}>AI</span>
        {/if}
        {#if col.check}
          <span class="attr ck" title="CHECK ({col.check})">CK</span>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- FK drag handle -->
  {#if !permissionStore.isReadOnly}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fk-handle"
      title={m.fk_drag_hint()}
      onmousedown={onfkdragstart}
    ></div>
  {/if}

  <!-- Tooltip (shown via CSS :hover) -->
  <div class="col-tooltip">
    <div class="tt-title">{col.name}</div>

    <div class="tt-row">
      <span class="tt-label">{m.column_type()}</span>
      <span class="tt-mono">{col.type}{col.length ? `(${col.length})` : ''}</span>
    </div>
    <div class="tt-row">
      <span class="tt-label">{m.tt_nullable()}</span>
      <span class:tt-yes={col.nullable} class:tt-no={!col.nullable}>
        {col.nullable ? 'YES' : 'NO'}
      </span>
    </div>

    <div class="tt-badges">
      {#if col.primaryKey}
        <span class="tt-badge pk">{m.tt_primary_key()}</span>
      {/if}
      {#if fk && refTableName && refColName}
        <span class="tt-badge fk">FK → {refTableName}.{refColName}</span>
      {/if}
      {#if (col.unique || isUniqueKeyCol) && !col.primaryKey}
        <span class="tt-badge uq">{m.tt_unique()}</span>
      {/if}
      {#if col.autoIncrement}
        <span class="tt-badge ai">{m.tt_auto_increment()}</span>
      {/if}
    </div>

    {#if col.defaultValue}
      <div class="tt-row">
        <span class="tt-label">{m.column_default()}</span>
        <span class="tt-mono">{col.defaultValue}</span>
      </div>
    {/if}

    {#if col.comment}
      <div class="tt-comment">{col.comment}</div>
    {/if}
  </div>

</div>

<style>
  .column-row {
    position: relative;        /* tooltip anchor */
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 4px;
    font-size: 12px;
    border-bottom: 1px solid var(--erd-col-border);
  }

  .column-row:last-child {
    border-bottom: none;
  }

  .column-row:hover {
    background: var(--erd-col-hover);
  }

  .column-row.fk-highlighted {
    background: var(--erd-fk-highlight);
  }

  /* Key badge (PK / FK) */
  .col-key {
    width: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .key-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: var(--erd-badge-radius);
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .key-badge.pk {
    background: var(--erd-badge-pk-bg);
    color: var(--erd-badge-pk-text);
    border: 1px solid var(--erd-badge-pk-border);
  }

  .key-badge.fk {
    background: var(--erd-badge-fk-bg);
    color: var(--erd-badge-fk-text);
    border: 1px solid var(--erd-badge-fk-border);
  }

  /* Column name */
  .col-name {
    flex: 1;
    color: var(--erd-col-text);
    white-space: nowrap;
  }

  /* Type + nullable (trailing ?) */
  .col-type {
    color: var(--erd-col-type);
    font-size: 11px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* Attribute badges: UQ / AI */
  .col-attrs {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .attr {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: var(--erd-badge-radius);
    line-height: 1.4;
  }

  .attr.uq {
    background: var(--erd-badge-uq-bg);
    color: var(--erd-badge-uq-text);
    border: 1px solid var(--erd-badge-uq-border);
  }

  .attr.ai {
    background: var(--erd-badge-ai-bg);
    color: var(--erd-badge-ai-text);
    border: 1px solid var(--erd-badge-ai-border);
  }

  .attr.ck {
    background: var(--erd-badge-ck-bg, #fef3c7);
    color: var(--erd-badge-ck-text, #a16207);
    border: 1px solid var(--erd-badge-ck-border, #fbbf24);
  }

  /* ── FK drag handle ── */
  .fk-handle {
    position: absolute;
    right: -4px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--erd-badge-fk-border, #93c5fd);
    border: 1.5px solid var(--erd-badge-fk-text, #1e40af);
    opacity: 0;
    cursor: crosshair;
    transition: opacity 0.12s, transform 0.12s;
    z-index: 10;
  }

  .column-row:hover .fk-handle {
    opacity: 0.7;
  }

  .fk-handle:hover {
    opacity: 1 !important;
    transform: translateY(-50%) scale(1.3);
  }

  .column-row.fk-drag-target {
    background: var(--erd-badge-fk-bg, #dbeafe);
    outline: 2px solid var(--erd-badge-fk-border, #93c5fd);
    outline-offset: -2px;
  }

  /* ── Tooltip ── */
  .col-tooltip {
    display: none;
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 200;
    background: var(--erd-tt-bg);
    color: var(--erd-tt-text);
    border: 1px solid var(--erd-tt-border);
    border-radius: var(--erd-tt-radius);
    padding: 10px 12px;
    min-width: 190px;
    max-width: 280px;
    box-shadow: var(--erd-tt-shadow);
    font-size: 12px;
    white-space: nowrap;
  }

  .column-row:hover .col-tooltip {
    display: block;
  }

  .tt-title {
    font-weight: 700;
    font-size: 13px;
    color: var(--erd-tt-title);
    margin-bottom: 7px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--erd-tt-border);
  }

  .tt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .tt-label {
    color: var(--erd-tt-label);
    font-size: 11px;
    flex-shrink: 0;
  }

  .tt-mono {
    font-family: monospace;
    font-size: 11px;
    color: var(--erd-tt-mono);
  }

  .tt-yes { color: var(--erd-tt-label); }
  .tt-no  { color: var(--erd-tt-no); font-weight: 600; }

  .tt-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 4px;
  }

  .tt-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--erd-badge-radius);
    letter-spacing: 0.02em;
  }

  .tt-badge.pk  { background: var(--erd-tt-badge-pk); color: var(--erd-tt-badge-text); }
  .tt-badge.fk  { background: var(--erd-tt-badge-fk); color: var(--erd-tt-badge-text); max-width: 240px; white-space: normal; word-break: break-all; }
  .tt-badge.uq  { background: var(--erd-tt-badge-uq); color: var(--erd-tt-badge-text); }
  .tt-badge.ai  { background: var(--erd-tt-badge-ai); color: var(--erd-tt-badge-text); }

  .tt-comment {
    font-style: italic;
    color: var(--erd-tt-label);
    font-size: 11px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--erd-tt-border);
    white-space: normal;
    word-break: break-word;
  }
</style>

<script lang="ts">
  import { permissionStore } from '$lib/store/permission.svelte';
  import type { Table, Memo } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    table: Table;
    isEditing: boolean;
    editName: string;
    schemaDropdownOpen: boolean;
    headerColorOverride: { headerBg: string; headerText: string } | null;
    schemas: string[];
    attachedMemos: Memo[];
    onheaderdblclick: () => void;
    onnamekeydown: (e: KeyboardEvent) => void;
    oncommitname: () => void;
    oneditnameinput: (val: string) => void;
    onschematoggle: () => void;
    onschemaassign: (schema: string | undefined) => void;
    ondeleteclick: (e: MouseEvent) => void;
    ondetachmemo: (memoId: string) => void;
    onchipmouseenter?: () => void;
    onchipmouseleave?: () => void;
  }

  const MEMO_CHIP_COLORS: Record<string, { header: string; text: string }> = {
    yellow:  { header: '#facc15', text: '#713f12' },
    blue:    { header: '#60a5fa', text: '#1e3a5f' },
    green:   { header: '#4ade80', text: '#14532d' },
    pink:    { header: '#f472b6', text: '#831843' },
    purple:  { header: '#c084fc', text: '#581c87' },
    orange:  { header: '#fb923c', text: '#7c2d12' },
  };

  let {
    table,
    isEditing,
    editName,
    schemaDropdownOpen,
    headerColorOverride,
    schemas,
    attachedMemos,
    onheaderdblclick,
    onnamekeydown,
    oncommitname,
    oneditnameinput,
    onschematoggle,
    onschemaassign,
    ondeleteclick,
    ondetachmemo,
    onchipmouseenter,
    onchipmouseleave,
  }: Props = $props();
</script>

<!-- Attached memo chips (rendered above the card via absolute positioning) -->
{#if attachedMemos.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="memo-chips"
    onmousedown={(e) => e.stopPropagation()}
    onmouseenter={() => onchipmouseenter?.()}
    onmouseleave={() => onchipmouseleave?.()}
  >
    {#each attachedMemos as mm}
      {@const chipColor = MEMO_CHIP_COLORS[mm.color ?? 'yellow'] ?? MEMO_CHIP_COLORS.yellow}
      <button
        class="memo-chip"
        style="background:{chipColor.header}; color:{chipColor.text}"
        title={mm.content ? `${mm.content}\n\nClick to detach` : 'Click to detach'}
        disabled={permissionStore.isReadOnly}
        onmousedown={(e) => e.stopPropagation()}
        onclick={() => ondetachmemo(mm.id)}
      >
        <span class="chip-pin">📌</span>
        <span class="chip-content">{mm.content.slice(0, 20) || '(empty)'}</span>
      </button>
    {/each}
  </div>
{/if}

<!-- Header -->
<div
  class="table-header"
  role="button"
  tabindex="-1"
  ondblclick={onheaderdblclick}
  style={headerColorOverride ? `background:${headerColorOverride.headerBg}; --erd-header-text:${headerColorOverride.headerText}` : ''}
>
  {#if isEditing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="name-input"
      value={editName}
      oninput={(e) => oneditnameinput(e.currentTarget.value)}
      onblur={oncommitname}
      onkeydown={onnamekeydown}
      autofocus
      onclick={(e) => e.stopPropagation()}
      onmousedown={(e) => e.stopPropagation()}
    />
  {:else}
    <span class="table-name">{table.name}</span>
    {#if table.locked}<span class="lock-icon" title={m.label_locked()}>🔒</span>{/if}
  {/if}
  {#if schemas.length > 0}
    <div class="schema-selector">
      <button
        class="schema-badge-btn"
        class:assigned={!!table.schema}
        onmousedown={(e) => e.stopPropagation()}
        onclick={(e) => { e.stopPropagation(); if (!permissionStore.isReadOnly) onschematoggle(); }}
        title={table.schema ? `Schema: ${table.schema} — click to change` : 'Assign to schema'}
      >{table.schema ?? 'schema…'}</button>

      {#if schemaDropdownOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="schema-dropdown-backdrop"
          onmousedown={(e) => { e.stopPropagation(); onschematoggle(); }}
        ></div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="schema-dropdown" onmousedown={(e) => e.stopPropagation()}>
          {#each schemas as s}
            <button
              class="schema-option"
              class:active={table.schema === s}
              onclick={() => onschemaassign(s)}
            >{s}</button>
          {/each}
          {#if table.schema}
            <div class="schema-divider"></div>
            <button class="schema-option none-opt" onclick={() => onschemaassign(undefined)}>
              Remove schema
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {:else if table.schema}
    <span class="schema-badge" title={table.schema}>{table.schema}</span>
  {/if}
  {#if !permissionStore.isReadOnly}
    <button class="delete-btn" onclick={ondeleteclick} title={m.action_delete()}>✕</button>
  {/if}
</div>

<style>
  /* ── Header ── */
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--erd-header-bg);
    border-radius: var(--erd-header-radius);
    border-bottom: var(--erd-header-border-bottom);
    gap: 8px;
  }

  .table-name {
    color: var(--erd-header-text);
    font-weight: 600;
    font-size: 13px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: var(--erd-header-text-transform, none);
    letter-spacing: var(--erd-header-letter-spacing, normal);
  }

  .name-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 3px;
    color: var(--erd-header-text);
    font-size: 13px;
    font-weight: 600;
    padding: 1px 4px;
    outline: none;
  }

  .lock-icon {
    font-size: 10px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  /* ── Attached memo chips ── */
  .memo-chips {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    padding-bottom: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: all;
    box-sizing: border-box;
  }

  .memo-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 10px;
    border: none;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
    width: 100%;
    box-sizing: border-box;
    opacity: 0.9;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: opacity 0.12s, filter 0.12s;
    text-align: left;
  }

  .memo-chip:hover:not(:disabled) {
    opacity: 1;
    filter: brightness(0.92);
  }

  .memo-chip:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .chip-pin {
    font-size: 10px;
    flex-shrink: 0;
    line-height: 1;
  }

  .chip-content {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  .schema-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255,255,255,0.15);
    color: var(--erd-header-text);
    flex-shrink: 0;
    white-space: nowrap;
    opacity: 0.8;
  }

  /* ── Schema selector dropdown ── */
  .schema-selector {
    position: relative;
    flex-shrink: 0;
  }

  .schema-badge-btn {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    border: none;
    background: rgba(255,255,255,0.15);
    color: var(--erd-header-text);
    white-space: nowrap;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, opacity 0.12s;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .schema-badge-btn.assigned {
    opacity: 1;
  }

  .schema-badge-btn:not(.assigned) {
    opacity: 0;
    font-style: italic;
    background: rgba(255,255,255,0.08);
  }

  .table-header:hover .schema-badge-btn:not(.assigned) {
    opacity: 0.5;
  }

  .schema-badge-btn:hover {
    background: rgba(255,255,255,0.28);
    opacity: 1 !important;
  }

  .schema-dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .schema-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1001;
    background: var(--app-panel-bg, #fff);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    min-width: 110px;
    overflow: hidden;
  }

  .schema-option {
    display: block;
    width: 100%;
    padding: 6px 10px;
    text-align: left;
    background: none;
    border: none;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    color: var(--app-text, #1e293b);
    white-space: nowrap;
    transition: background 0.1s;
  }

  .schema-option:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .schema-option.active {
    font-weight: 700;
    color: #3b82f6;
  }

  .schema-divider {
    height: 1px;
    background: var(--app-border, #e2e8f0);
    margin: 2px 0;
  }

  .schema-option.none-opt {
    font-size: 11px;
    color: #ef4444;
  }

  .schema-option.none-opt:hover {
    background: rgba(239,68,68,0.07);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--erd-header-delete);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }

  .table-header:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: #f87171 !important;
    background: rgba(255, 255, 255, 0.1);
  }
</style>

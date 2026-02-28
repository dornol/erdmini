<script lang="ts">
  import { tick } from 'svelte';
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state('');
  let highlightIdx = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let resultsEl = $state<HTMLDivElement | null>(null);

  type ResultItem =
    | { kind: 'table'; tableId: string; tableName: string }
    | { kind: 'column'; tableId: string; tableName: string; columnName: string; columnType: string };

  const filtered = $derived(() => {
    const q = query.trim().toLowerCase();
    const tables: ResultItem[] = [];
    const columns: ResultItem[] = [];

    for (const t of erdStore.schema.tables) {
      if (!q || t.name.toLowerCase().includes(q)) {
        tables.push({ kind: 'table', tableId: t.id, tableName: t.name });
      }
      for (const c of t.columns) {
        if (!q || c.name.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)) {
          columns.push({
            kind: 'column',
            tableId: t.id,
            tableName: t.name,
            columnName: c.name,
            columnType: c.type,
          });
        }
      }
    }

    return { tables, columns, all: [...tables, ...columns] };
  });

  // Reset highlight when query changes
  $effect(() => {
    query;
    highlightIdx = 0;
  });

  // Scroll highlighted item into view
  $effect(() => {
    if (resultsEl) {
      const item = resultsEl.querySelector('.cmd-item.highlighted') as HTMLElement | null;
      item?.scrollIntoView({ block: 'nearest' });
    }
  });

  // Auto-focus input on mount
  $effect(() => {
    tick().then(() => inputEl?.focus());
  });

  function navigateTo(item: ResultItem) {
    const tableId = item.tableId;
    erdStore.selectedTableId = tableId;
    erdStore.selectedTableIds = new Set([tableId]);

    const table = erdStore.schema.tables.find((t) => t.id === tableId);
    if (table) {
      const vp = document.querySelector('.canvas-viewport')?.getBoundingClientRect();
      const cx = table.position.x + 110;
      const cy = table.position.y + 50;
      canvasState.x = -cx * canvasState.scale + (vp?.width ?? 800) / 2;
      canvasState.y = -cy * canvasState.scale + (vp?.height ?? 600) / 2;
    }

    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    const { all } = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % Math.max(all.length, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = (highlightIdx - 1 + Math.max(all.length, 1)) % Math.max(all.length, 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (all[highlightIdx]) {
        navigateTo(all[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('cmd-backdrop')) {
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="cmd-backdrop" onclick={onBackdropClick}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="cmd-palette" onkeydown={handleKeydown}>
    <div class="cmd-input-wrap">
      <svg class="cmd-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input
        bind:this={inputEl}
        bind:value={query}
        class="cmd-input"
        type="text"
        placeholder={m.cmd_palette_placeholder()}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="cmd-results" bind:this={resultsEl}>
      {#if filtered().all.length === 0}
        <div class="cmd-empty">{m.cmd_palette_no_results()}</div>
      {:else}
        {#if filtered().tables.length > 0}
          <div class="cmd-group-label">{m.cmd_palette_tables()}</div>
          {#each filtered().tables as item, i}
            {@const globalIdx = i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="cmd-item"
              class:highlighted={highlightIdx === globalIdx}
              onmouseenter={() => (highlightIdx = globalIdx)}
              onclick={() => navigateTo(item)}
            >
              <svg class="cmd-item-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1"/>
              </svg>
              <span class="cmd-item-label">{item.tableName}</span>
            </div>
          {/each}
        {/if}

        {#if filtered().columns.length > 0}
          <div class="cmd-group-label">{m.cmd_palette_columns()}</div>
          {#each filtered().columns as item, i}
            {@const globalIdx = filtered().tables.length + i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="cmd-item"
              class:highlighted={highlightIdx === globalIdx}
              onmouseenter={() => (highlightIdx = globalIdx)}
              onclick={() => navigateTo(item)}
            >
              <svg class="cmd-item-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3"/>
                <line x1="8" y1="5.5" x2="8" y2="10.5" stroke="currentColor" stroke-width="1"/>
                <line x1="5.5" y1="8" x2="10.5" y2="8" stroke="currentColor" stroke-width="1"/>
              </svg>
              {#if item.kind === 'column'}
                <span class="cmd-item-label">
                  <span class="cmd-table-prefix">{item.tableName}.</span>{item.columnName}
                </span>
                <span class="cmd-type-badge">{item.columnType}</span>
              {/if}
            </div>
          {/each}
        {/if}
      {/if}
    </div>

    <div class="cmd-hint">{m.cmd_palette_hint()}</div>
  </div>
</div>

<style>
  .cmd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1500;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: center;
    padding-top: 80px;
  }

  .cmd-palette {
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 12px;
    width: 520px;
    max-height: 420px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    align-self: flex-start;
  }

  .cmd-input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #334155;
  }

  .cmd-search-icon {
    color: #64748b;
    flex-shrink: 0;
  }

  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #f1f5f9;
    font-size: 15px;
    caret-color: #60a5fa;
  }

  .cmd-input::placeholder {
    color: #64748b;
  }

  .cmd-results {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .cmd-group-label {
    padding: 6px 14px 4px;
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .cmd-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    cursor: pointer;
    transition: background 0.08s;
  }

  .cmd-item.highlighted {
    background: #334155;
  }

  .cmd-item-icon {
    color: #94a3b8;
    flex-shrink: 0;
  }

  .cmd-item.highlighted .cmd-item-icon {
    color: #60a5fa;
  }

  .cmd-item-label {
    font-size: 13px;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .cmd-table-prefix {
    color: #94a3b8;
  }

  .cmd-type-badge {
    font-size: 10px;
    color: #94a3b8;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 3px;
    padding: 1px 6px;
    flex-shrink: 0;
  }

  .cmd-empty {
    padding: 24px 14px;
    text-align: center;
    font-size: 13px;
    color: #64748b;
  }

  .cmd-hint {
    padding: 8px 14px;
    border-top: 1px solid #334155;
    font-size: 11px;
    color: #64748b;
    text-align: center;
    letter-spacing: 0.02em;
  }
</style>

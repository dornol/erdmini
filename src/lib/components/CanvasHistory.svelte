<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';

  let panelOpen = $state(false);

  const labelFn: Record<string, () => string> = {
    history_add_table: () => m.history_add_table(),
    history_delete_table: () => m.history_delete_table(),
    history_edit_table: () => m.history_edit_table(),
    history_add_column: () => m.history_add_column(),
    history_delete_column: () => m.history_delete_column(),
    history_edit_column: () => m.history_edit_column(),
    history_add_fk: () => m.history_add_fk(),
    history_delete_fk: () => m.history_delete_fk(),
    history_edit_domain: () => m.history_edit_domain(),
    history_layout: () => m.history_layout(),
    history_edit: () => m.history_edit(),
    history_add_uq: () => m.history_add_uq(),
    history_delete_uq: () => m.history_delete_uq(),
    history_add_idx: () => m.history_add_idx(),
    history_delete_idx: () => m.history_delete_idx(),
  };

  function resolveLabel(key: string): string {
    return labelFn[key]?.() ?? key;
  }

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'now';
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  function handleJump(index: number) {
    erdStore.jumpToHistory(index);
    panelOpen = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas-history">
  {#if panelOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="history-backdrop" onclick={() => (panelOpen = false)}></div>
    <div class="history-panel" onwheel={(e) => e.stopPropagation()}>
      <div class="history-panel-header">{m.history_title()}</div>
      <div class="history-panel-list">
        <div class="history-item current">
          <span class="history-label">{m.history_current()}</span>
        </div>
        {#if erdStore.historyEntries.length === 0}
          <div class="history-empty">{m.history_empty()}</div>
        {:else}
          {#each [...erdStore.historyEntries].reverse() as entry, i}
            {@const realIndex = erdStore.historyEntries.length - 1 - i}
            <button class="history-item" onclick={() => handleJump(realIndex)}>
              <div class="history-info">
                <span class="history-label">{resolveLabel(entry.label)}</span>
                {#if entry.detail}
                  <span class="history-detail">{entry.detail}</span>
                {/if}
              </div>
              <span class="history-time">{relativeTime(entry.time)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <div class="history-buttons">
    <button
      class="hist-btn"
      disabled={!erdStore.canUndo}
      onclick={() => erdStore.undo()}
      title="Undo (Ctrl+Z)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
    </button>
    <button
      class="hist-btn"
      disabled={!erdStore.canRedo}
      onclick={() => erdStore.redo()}
      title="Redo (Ctrl+Shift+Z)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"></path>
      </svg>
    </button>
    <button
      class="hist-btn"
      class:active={panelOpen}
      onclick={() => (panelOpen = !panelOpen)}
      title={m.history_title()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    </button>
  </div>
</div>

<style>
  .canvas-history {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 100;
  }

  .history-buttons {
    display: flex;
    gap: 2px;
    background: var(--erd-zoom-bg);
    border: 1px solid var(--erd-zoom-border);
    border-radius: 6px;
    padding: 2px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .hist-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--erd-zoom-text);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }

  .hist-btn:hover:not(:disabled) {
    background: var(--erd-zoom-border);
    color: var(--erd-zoom-btn);
  }

  .hist-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .hist-btn.active {
    background: var(--erd-zoom-border);
    color: var(--erd-zoom-btn);
  }

  .history-backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
  }

  .history-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 260px;
    max-height: 300px;
    background: var(--erd-zoom-bg);
    border: 1px solid var(--erd-zoom-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-panel-header {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--erd-zoom-text);
    border-bottom: 1px solid var(--erd-zoom-border);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .history-panel-list {
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: rgba(148,163,184,0.5) transparent;
  }

  .history-panel-list::-webkit-scrollbar {
    width: 5px;
  }

  .history-panel-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .history-panel-list::-webkit-scrollbar-thumb {
    background: rgba(148,163,184,0.5);
    border-radius: 3px;
  }

  .history-panel-list::-webkit-scrollbar-thumb:hover {
    background: rgba(148,163,184,0.8);
  }

  .history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--erd-zoom-text);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .history-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .history-detail {
    font-size: 10px;
    opacity: 0.55;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-item:hover:not(.current) {
    background: var(--erd-zoom-border);
  }

  .history-item.current {
    color: var(--erd-zoom-btn);
    font-weight: 600;
    cursor: default;
  }

  .history-time {
    font-size: 10px;
    opacity: 0.6;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .history-empty {
    padding: 16px 12px;
    font-size: 12px;
    color: var(--erd-zoom-text);
    opacity: 0.5;
    text-align: center;
  }
</style>

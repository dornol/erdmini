<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';

  let { onclose }: { onclose: () => void } = $props();

  let undoEntries = $derived(erdStore.historyEntries);
  let redoEntries = $derived(erdStore.redoEntries);

  const LABEL_MAP: Record<string, () => string> = {
    'history_add_table': () => m.history_add_table(),
    'history_delete_table': () => m.history_delete_table(),
    'history_edit_table': () => m.history_edit_table(),
    'history_add_column': () => m.history_add_column(),
    'history_delete_column': () => m.history_delete_column(),
    'history_edit_column': () => m.history_edit_column(),
    'history_add_fk': () => m.history_add_fk(),
    'history_delete_fk': () => m.history_delete_fk(),
    'history_edit_fk': () => m.history_edit_fk(),
    'history_edit_domain': () => m.history_edit_domain(),
    'history_layout': () => m.history_layout(),
    'history_edit': () => m.history_edit(),
    'history_add_uq': () => m.history_add_uq(),
    'history_delete_uq': () => m.history_delete_uq(),
    'history_add_idx': () => m.history_add_idx(),
    'history_delete_idx': () => m.history_delete_idx(),
    'history_add_memo': () => m.history_add_memo(),
    'history_delete_memo': () => m.history_delete_memo(),
    'history_edit_memo': () => m.history_edit_memo(),
  };

  function labelText(label: string): string {
    return LABEL_MAP[label]?.() ?? label;
  }

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return '< 1m';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  }

  function jumpToUndo(index: number) {
    erdStore.jumpToHistory(index);
  }

  function jumpToRedo(steps: number) {
    for (let i = 0; i < steps; i++) {
      erdStore.redo();
    }
  }
</script>

<div class="history-panel">
  <div class="history-header">
    <span class="history-title">{m.history_title()}</span>
    <button class="history-close" onclick={onclose}>✕</button>
  </div>

  <div class="history-body">
    {#if undoEntries.length === 0 && redoEntries.length === 0}
      <div class="history-empty">{m.history_empty()}</div>
    {:else}
      <!-- Redo entries (future, shown at top, faded) -->
      {#each redoEntries.slice().reverse() as entry, i}
        <button
          class="history-item redo-item"
          onclick={() => jumpToRedo(redoEntries.length - i)}
        >
          <span class="history-time">{relativeTime(entry.time)}</span>
          <div class="history-content">
            <span class="history-label">{labelText(entry.label)}</span>
            {#if entry.detail}
              <span class="history-detail">{entry.detail}</span>
            {/if}
          </div>
        </button>
      {/each}

      <!-- Current state marker -->
      <div class="history-current">
        <span class="history-current-dot"></span>
        <span>{m.history_current()}</span>
      </div>

      <!-- Undo entries (past, shown below) -->
      {#each undoEntries.slice().reverse() as entry, i}
        {@const idx = undoEntries.length - 1 - i}
        <button
          class="history-item undo-item"
          onclick={() => jumpToUndo(idx)}
        >
          <span class="history-time">{relativeTime(entry.time)}</span>
          <div class="history-content">
            <span class="history-label">{labelText(entry.label)}</span>
            {#if entry.detail}
              <span class="history-detail">{entry.detail}</span>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .history-panel {
    position: fixed;
    top: 56px;
    right: 16px;
    width: 320px;
    max-height: calc(100vh - 72px);
    background: var(--app-popup-bg, #1e293b);
    border: 1px solid var(--app-border, #475569);
    border-radius: 8px;
    box-shadow: var(--app-popup-shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
    z-index: 150;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    flex-shrink: 0;
  }

  .history-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
  }

  .history-close {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .history-close:hover {
    background: var(--app-hover-bg, #334155);
    color: var(--app-text, #f1f5f9);
  }

  .history-body {
    overflow-y: auto;
    max-height: 450px;
    padding: 4px 0;
  }

  .history-empty {
    padding: 20px 14px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 13px;
    text-align: center;
  }

  .history-current {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    color: #3b82f6;
    background: var(--app-active-bg, #1e3a5f);
    border-left: 3px solid #3b82f6;
  }

  .history-current-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3b82f6;
    flex-shrink: 0;
  }

  .history-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 7px 14px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    font-size: 12px;
  }

  .history-item:hover {
    background: var(--app-hover-bg, #334155);
  }

  .redo-item {
    opacity: 0.5;
  }

  .redo-item:hover {
    opacity: 0.8;
  }

  .history-time {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--app-text-faint, #64748b);
    min-width: 28px;
    padding-top: 2px;
  }

  .history-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .history-label {
    color: var(--app-text, #e2e8f0);
    font-size: 12px;
    font-weight: 500;
  }

  .history-detail {
    color: var(--app-text-muted, #94a3b8);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

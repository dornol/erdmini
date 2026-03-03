<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';
  import HistoryEntryList from '$lib/components/HistoryEntryList.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let undoEntries = $derived(erdStore.historyEntries);
  let redoEntries = $derived(erdStore.redoEntries);

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
      <HistoryEntryList
        entries={redoEntries}
        onjump={(idx) => jumpToRedo(redoEntries.length - idx)}
        timeGranularity="coarse"
        timePosition="start"
        entryClass="redo-item"
      />

      <!-- Current state marker -->
      <div class="history-current">
        <span class="history-current-dot"></span>
        <span>{m.history_current()}</span>
      </div>

      <!-- Undo entries (past, shown below) -->
      <HistoryEntryList
        entries={undoEntries}
        onjump={jumpToUndo}
        timeGranularity="coarse"
        timePosition="start"
      />
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
    color: var(--app-text, #e2e8f0);
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

  .history-body :global(.history-entry:hover) {
    background: var(--app-hover-bg, #334155);
  }

  .history-body :global(.history-entry-time) {
    color: var(--app-text-faint, #64748b);
  }

  .history-body :global(.history-entry-detail) {
    color: var(--app-text-muted, #94a3b8);
  }

  .history-body :global(.redo-item) {
    opacity: 0.5;
  }

  .history-body :global(.redo-item:hover) {
    opacity: 0.8;
  }
</style>

<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import * as m from '$lib/paraglide/messages';
  import HistoryEntryList from '$lib/components/HistoryEntryList.svelte';

  let panelOpen = $state(false);

  function handleJump(index: number) {
    erdStore.jumpToHistory(index);
    panelOpen = false;
  }
</script>

{#if !permissionStore.isReadOnly}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas-history">
  {#if panelOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="history-backdrop" onclick={() => (panelOpen = false)}></div>
    <div class="history-panel" onwheel={(e) => e.stopPropagation()}>
      <div class="history-panel-header">{m.history_title()}</div>
      <div class="history-panel-list thin-scrollbar">
        <div class="history-item current">
          <span class="history-label">{m.history_current()}</span>
        </div>
        {#if erdStore.historyEntries.length === 0}
          <div class="history-empty">{m.history_empty()}</div>
        {:else}
          <HistoryEntryList
            entries={erdStore.historyEntries}
            onjump={handleJump}
            timeGranularity="fine"
            timePosition="end"
          />
        {/if}
      </div>
    </div>
  {/if}

  <div class="history-buttons">
    <button
      class="hist-btn"
      disabled={!erdStore.canUndo}
      onclick={() => erdStore.undo()}
      title={m.shortcut_undo({ mod: navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl' })}
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
      title={m.shortcut_redo({ mod: navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl' })}
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
{/if}

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

  .history-item:hover:not(.current) {
    background: var(--erd-zoom-border);
  }

  .history-item.current {
    color: var(--erd-zoom-btn);
    font-weight: 600;
    cursor: default;
  }

  .history-panel-list :global(.history-entry:hover) {
    background: var(--erd-zoom-border);
  }

  .history-panel-list :global(.history-entry-detail) {
    opacity: 0.55;
    font-size: 10px;
  }

  .history-empty {
    padding: 16px 12px;
    font-size: 12px;
    color: var(--erd-zoom-text);
    opacity: 0.5;
    text-align: center;
  }
</style>

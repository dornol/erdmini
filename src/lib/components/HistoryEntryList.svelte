<script lang="ts">
  import type { HistoryEntry } from '$lib/store/erd.svelte';
  import { resolveHistoryLabel, relativeTime } from '$lib/utils/history-labels';

  let {
    entries,
    onjump,
    timeGranularity = 'fine',
    timePosition = 'end',
    entryClass = '',
  }: {
    entries: HistoryEntry[];
    onjump: (index: number) => void;
    timeGranularity?: 'coarse' | 'fine';
    timePosition?: 'start' | 'end';
    entryClass?: string;
  } = $props();
</script>

{#each [...entries].reverse() as entry, i}
    {@const realIndex = entries.length - 1 - i}
    <button
      class="history-entry {entryClass}"
      class:time-start={timePosition === 'start'}
      onclick={() => onjump(realIndex)}
    >
      {#if timePosition === 'start'}
        <span class="history-entry-time">{relativeTime(entry.time, timeGranularity)}</span>
      {/if}
      <div class="history-entry-content">
        <span class="history-entry-label">{resolveHistoryLabel(entry.label)}</span>
        {#if entry.detail}
          <span class="history-entry-detail">{entry.detail}</span>
        {/if}
      </div>
      {#if timePosition === 'end'}
        <span class="history-entry-time">{relativeTime(entry.time, timeGranularity)}</span>
      {/if}
    </button>
  {/each}

<style>
  .history-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    color: inherit;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .history-entry.time-start {
    align-items: flex-start;
    gap: 8px;
    padding: 7px 14px;
    justify-content: flex-start;
  }

  .history-entry-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .history-entry-label {
    font-size: 12px;
    font-weight: 500;
  }

  .history-entry-detail {
    font-size: 11px;
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-entry-time {
    font-size: 10px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .history-entry.time-start .history-entry-time {
    min-width: 28px;
    padding-top: 2px;
  }

  .history-entry.time-start .history-entry-detail {
    font-size: 11px;
  }
</style>

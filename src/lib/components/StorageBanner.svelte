<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { downloadBlob } from '$lib/utils/blob-download';
  import * as m from '$lib/paraglide/messages';

  let dismissed = $state(false);

  interface Props {
    storageFull: boolean;
  }

  let { storageFull }: Props = $props();
</script>

{#if storageFull && !dismissed}
  <div class="storage-banner">
    <span class="storage-msg">{m.storage_full_warning()}</span>
    <button class="storage-export-btn" onclick={() => {
      downloadBlob(JSON.stringify($state.snapshot(erdStore.schema), null, 2), 'erdmini-backup.json', 'application/json');
    }}>{m.storage_full_export()}</button>
    <button class="storage-close-btn" onclick={() => (dismissed = true)}>✕</button>
  </div>
{/if}

<style>
  .storage-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #fef3c7;
    border-bottom: 1px solid #f59e0b;
    flex-shrink: 0;
  }

  .storage-msg {
    flex: 1;
    font-size: 13px;
    color: #92400e;
    font-weight: 500;
  }

  .storage-export-btn {
    font-size: 12px;
    color: #92400e;
    background: white;
    border: 1px solid #f59e0b;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
  }

  .storage-export-btn:hover {
    background: #fffbeb;
  }

  .storage-close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #b45309;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .storage-close-btn:hover {
    background: #fde68a;
  }
</style>

<script lang="ts">
  import { collabStore } from '$lib/store/collab.svelte';

  let showPeerList = $state(false);
  let wrapEl: HTMLDivElement;

  function toggleList() {
    showPeerList = !showPeerList;
  }

  function handleClickOutside(e: MouseEvent) {
    if (showPeerList && wrapEl && !wrapEl.contains(e.target as Node)) {
      showPeerList = false;
    }
  }

  $effect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  let statusColor = $derived(
    collabStore.connected ? '#22c55e' : collabStore.reconnecting ? '#eab308' : '#6b7280'
  );
  let statusText = $derived(
    collabStore.connected ? 'Live' : collabStore.reconnecting ? 'Reconnecting' : 'Offline'
  );
</script>

<div class="collab-indicator" bind:this={wrapEl}>
  <button class="collab-btn" onclick={toggleList} title={statusText}>
    <span class="status-dot" style="background:{statusColor}"></span>
    {#if collabStore.peers.length > 0}
      <span class="peer-count">{collabStore.peers.length + 1}</span>
      <div class="peer-avatars">
        {#each collabStore.peers.slice(0, 3) as peer (peer.peerId)}
          <span
            class="peer-avatar"
            style="background:{peer.color}"
            title={peer.displayName}
          >
            {peer.displayName.charAt(0).toUpperCase()}
          </span>
        {/each}
        {#if collabStore.peers.length > 3}
          <span class="peer-avatar peer-more">+{collabStore.peers.length - 3}</span>
        {/if}
      </div>
    {/if}
  </button>

  {#if showPeerList}
    <div class="peer-popup">
      <div class="peer-popup-header">Collaborators</div>
      <div class="peer-item self">
        <span class="peer-dot" style="background:#22c55e"></span>
        <span class="peer-name">You</span>
      </div>
      {#each collabStore.peers as peer (peer.peerId)}
        <div class="peer-item">
          <span class="peer-dot" style="background:{peer.color}"></span>
          <span class="peer-name">{peer.displayName}</span>
        </div>
      {/each}
      {#if collabStore.peers.length === 0}
        <div class="peer-empty">No other collaborators</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .collab-indicator {
    position: relative;
  }

  .collab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #334155;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    height: 32px;
    transition: all 0.15s;
  }

  .collab-btn:hover {
    background: #3e4f67;
    border-color: #64748b;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .peer-count {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .peer-avatars {
    display: flex;
    margin-left: 2px;
  }

  .peer-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: white;
    margin-left: -4px;
    border: 2px solid #1e293b;
  }

  .peer-avatar:first-child {
    margin-left: 0;
  }

  .peer-more {
    background: #475569;
    font-size: 10px;
  }

  .peer-popup {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 6px 0;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    z-index: 200;
  }

  .peer-popup-header {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 12px 8px;
    border-bottom: 1px solid #334155;
    margin-bottom: 4px;
  }

  .peer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
  }

  .peer-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .peer-name {
    font-size: 13px;
    color: #e2e8f0;
  }

  .self .peer-name {
    color: #94a3b8;
  }

  .peer-empty {
    font-size: 12px;
    color: #64748b;
    padding: 6px 12px;
  }
</style>

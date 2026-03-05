<script lang="ts">
  import { snapshotStore } from '$lib/store/snapshot.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';

  let { onclose, ondiff }: { onclose: () => void; ondiff?: (snapshotId: string) => void } = $props();

  let nameInput = $state('');
  let descInput = $state('');
  let saving = $state(false);
  let filter = $state<'all' | 'manual' | 'auto'>('all');

  const filteredSnapshots = $derived(
    filter === 'all'
      ? snapshotStore.snapshots
      : filter === 'auto'
        ? snapshotStore.snapshots.filter((s) => s.isAuto)
        : snapshotStore.snapshots.filter((s) => !s.isAuto)
  );

  async function handleSave() {
    const name = nameInput.trim();
    if (!name || saving) return;
    saving = true;
    try {
      await snapshotStore.create(name, descInput.trim() || undefined);
      nameInput = '';
      descInput = '';
    } finally {
      saving = false;
    }
  }

  async function handleRestore(id: string, name: string) {
    const ok = await dialogStore.confirm(m.snapshot_restore_confirm({ name }), {
      title: m.snapshot_restore(),
      confirmText: m.snapshot_restore(),
      variant: 'danger',
    });
    if (ok) {
      await snapshotStore.restore(id);
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await dialogStore.confirm(m.snapshot_delete_confirm({ name }), {
      title: m.snapshot_delete(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) {
      await snapshotStore.remove(id);
    }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${date} ${time}`;
  }
</script>

<div class="snapshot-panel">
  <div class="snapshot-header">
    <span class="snapshot-title">{m.snapshot_title()}</span>
    <button class="snapshot-close" onclick={onclose}>✕</button>
  </div>

  <div class="snapshot-create">
    <input
      class="snapshot-input"
      type="text"
      placeholder={m.snapshot_name_placeholder()}
      bind:value={nameInput}
      onkeydown={(e) => { if (e.key === 'Enter') handleSave(); }}
    />
    <input
      class="snapshot-input snapshot-desc"
      type="text"
      placeholder={m.snapshot_description_placeholder()}
      bind:value={descInput}
    />
    <button
      class="snapshot-save-btn"
      onclick={handleSave}
      disabled={!nameInput.trim() || saving}
    >
      {m.snapshot_create()}
    </button>
  </div>

  <div class="snapshot-filter">
    <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>{m.snapshot_filter_all()}</button>
    <button class="filter-btn" class:active={filter === 'manual'} onclick={() => filter = 'manual'}>{m.snapshot_filter_manual()}</button>
    <button class="filter-btn" class:active={filter === 'auto'} onclick={() => filter = 'auto'}>{m.snapshot_filter_auto()}</button>
  </div>

  <div class="snapshot-body">
    {#if filteredSnapshots.length === 0}
      <div class="snapshot-empty">{m.snapshot_empty()}</div>
    {:else}
      {#each filteredSnapshots as snap (snap.id)}
        <div class="snapshot-item">
          <div class="snapshot-item-info">
            <span class="snapshot-item-name">
              {snap.name}
              {#if snap.isAuto}
                <span class="snapshot-auto-badge">{m.snapshot_auto_badge()}</span>
              {/if}
            </span>
            {#if snap.description}
              <span class="snapshot-item-desc">{snap.description}</span>
            {/if}
            <span class="snapshot-item-time">{formatTime(snap.createdAt)}</span>
          </div>
          <div class="snapshot-item-actions">
            <button class="snap-btn snap-restore" onclick={() => handleRestore(snap.id, snap.name)} title={m.snapshot_restore()}>
              ↩
            </button>
            {#if ondiff}
              <button class="snap-btn snap-diff" onclick={() => ondiff?.(snap.id)} title={m.snapshot_compare()}>
                ⇔
              </button>
            {/if}
            <button class="snap-btn snap-delete" onclick={() => handleDelete(snap.id, snap.name)} title={m.snapshot_delete()}>
              ✕
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .snapshot-panel {
    position: fixed;
    top: 56px;
    right: 16px;
    width: 340px;
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

  .snapshot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    flex-shrink: 0;
  }

  .snapshot-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
  }

  .snapshot-close {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .snapshot-close:hover {
    background: var(--app-hover-bg, #334155);
    color: var(--app-text, #f1f5f9);
  }

  .snapshot-create {
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .snapshot-input {
    font-size: 12px;
    padding: 6px 8px;
    border: 1px solid var(--app-input-border, #475569);
    border-radius: 5px;
    background: var(--app-input-bg, #0f172a);
    color: var(--app-text, #f1f5f9);
    outline: none;
  }

  .snapshot-input:focus {
    border-color: #3b82f6;
  }

  .snapshot-desc {
    font-size: 11px;
  }

  .snapshot-save-btn {
    align-self: flex-end;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 12px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .snapshot-save-btn:hover {
    background: #2563eb;
  }

  .snapshot-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .snapshot-body {
    overflow-y: auto;
    max-height: 400px;
    padding: 4px 0;
    color: var(--app-text, #e2e8f0);
  }

  .snapshot-empty {
    padding: 20px 14px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 13px;
    text-align: center;
  }

  .snapshot-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 8px 14px;
    gap: 8px;
  }

  .snapshot-item:hover {
    background: var(--app-hover-bg, #334155);
  }

  .snapshot-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .snapshot-item-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snapshot-item-desc {
    font-size: 11px;
    color: var(--app-text-muted, #94a3b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snapshot-item-time {
    font-size: 10px;
    color: var(--app-text-faint, #64748b);
  }

  .snapshot-item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .snap-btn {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
  }

  .snap-btn:hover {
    background: var(--app-hover-bg, #475569);
    color: var(--app-text, #f1f5f9);
  }

  .snap-delete:hover {
    color: #f87171;
  }

  .snap-restore:hover {
    color: #34d399;
  }

  .snap-diff:hover {
    color: #60a5fa;
  }

  .snapshot-filter {
    display: flex;
    gap: 2px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    flex-shrink: 0;
  }

  .filter-btn {
    flex: 1;
    font-size: 11px;
    padding: 3px 0;
    background: none;
    border: 1px solid var(--app-border, #475569);
    border-radius: 4px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
  }

  .filter-btn:hover {
    background: var(--app-hover-bg, #334155);
  }

  .filter-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .snapshot-auto-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    margin-left: 4px;
    border-radius: 3px;
    background: #6366f1;
    color: white;
    vertical-align: middle;
    line-height: 1.4;
  }
</style>

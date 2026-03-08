<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  let {
    showInput = false,
    groupName = '',
    oncreategroup,
    oncancelgroup,
    ongroupnameinput,
    onstartnewgroup,
  }: {
    showInput?: boolean;
    groupName?: string;
    oncreategroup?: () => void;
    oncancelgroup?: () => void;
    ongroupnameinput?: (value: string) => void;
    onstartnewgroup?: () => void;
  } = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    ongroupnameinput?.(target.value);
  }
</script>

<div class="new-group-row">
  {#if showInput}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="new-group-input"
      type="text"
      placeholder={m.sidebar_new_group_placeholder()}
      value={groupName}
      oninput={handleInput}
      onkeydown={(e) => { if (e.key === 'Enter') oncreategroup?.(); if (e.key === 'Escape') oncancelgroup?.(); }}
      onblur={() => oncreategroup?.()}
      autofocus
    />
  {:else}
    <button class="new-group-btn" onclick={() => onstartnewgroup?.()}>+ {m.sidebar_new_group()}</button>
  {/if}
</div>

<style>
  .new-group-row {
    padding: 4px 14px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
  }

  .new-group-btn {
    width: 100%;
    padding: 5px 8px;
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
    background: none;
    border: 1.5px dashed var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
  }

  .new-group-btn:hover {
    background: var(--app-hover-bg, #f1f5f9);
    color: var(--app-text, #1e293b);
    border-color: #93c5fd;
  }

  .new-group-input {
    width: 100%;
    padding: 5px 8px;
    font-size: 11px;
    border: 1.5px solid #93c5fd;
    border-radius: 4px;
    outline: none;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    box-sizing: border-box;
  }

  .new-group-input::placeholder {
    color: var(--app-text-faint, #94a3b8);
  }
</style>

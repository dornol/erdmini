<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { lintSchema } from '$lib/utils/schema-lint';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
    onaction: (action: 'domains' | 'lint' | 'history' | 'diff' | 'snapshots' | 'sql-playground' | 'embed') => void;
  }

  let { open, ontoggle, onclose, onaction }: Props = $props();

  let lintIssueCount = $derived(lintSchema(erdStore.schema).length);
</script>

<div class="dropdown-wrap">
  <button
    class="btn-secondary btn-tools"
    class:tools-active={false}
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    {m.toolbar_tools()}
    {#if lintIssueCount > 0}
      <span class="lint-badge">{lintIssueCount}</span>
    {/if}
    ▾
  </button>
  {#if open}
    <div
      class="dropdown-menu"
      role="menu"
      tabindex="-1"
      onmouseleave={onclose}
    >
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('domains'); onclose(); }}>
        {m.toolbar_domains()}
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('lint'); onclose(); }}>
        {m.toolbar_lint()}
        {#if lintIssueCount > 0}
          <span class="lint-badge">{lintIssueCount}</span>
        {/if}
      </button>
      <div class="dropdown-sep"></div>
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('history'); onclose(); }}>
        {m.history_title()}
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('diff'); onclose(); }}>
        {m.diff_title()}
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('snapshots'); onclose(); }}>
        {m.toolbar_snapshots()}
      </button>
      <div class="dropdown-sep"></div>
      <button class="dropdown-item" role="menuitem" onclick={() => { onaction('sql-playground'); onclose(); }}>
        {m.sql_playground_title()}
      </button>
      {#if authStore.isLoggedIn && (permissionStore.current === 'owner' || permissionStore.current === 'editor')}
        <div class="dropdown-sep"></div>
        <button class="dropdown-item" role="menuitem" onclick={() => { onaction('embed'); onclose(); }}>
          {m.embed_title()}
        </button>
      {/if}
    </div>
  {/if}
</div>

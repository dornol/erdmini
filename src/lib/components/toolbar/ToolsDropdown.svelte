<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { authStore } from '$lib/store/auth.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { lintSchema } from '$lib/utils/schema-lint';
  import { TABLE_TEMPLATES } from '$lib/utils/table-templates';
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
      {#if !permissionStore.isReadOnly}
        <div class="dropdown-sep"></div>
        <div class="dropdown-submenu">
          <button class="dropdown-item submenu-trigger" role="menuitem">
            {m.template_title()} ▸
          </button>
          <div class="submenu-content">
            {#each TABLE_TEMPLATES as tmpl}
              <button
                class="dropdown-item"
                role="menuitem"
                onclick={() => {
                  erdStore.addTableFromTemplate(tmpl.columns, tmpl.tableName);
                  onclose();
                }}
              >{tmpl.tableName}</button>
            {/each}
          </div>
        </div>
      {/if}
      {#if authStore.isLoggedIn && (permissionStore.current === 'owner' || permissionStore.current === 'editor')}
        <div class="dropdown-sep"></div>
        <button class="dropdown-item" role="menuitem" onclick={() => { onaction('embed'); onclose(); }}>
          {m.embed_title()}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropdown-submenu {
    position: relative;
  }
  .submenu-trigger {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .submenu-content {
    display: none;
    position: absolute;
    left: 100%;
    top: 0;
    min-width: 140px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 4px;
    z-index: 1001;
  }
  .dropdown-submenu:hover .submenu-content {
    display: block;
  }
</style>

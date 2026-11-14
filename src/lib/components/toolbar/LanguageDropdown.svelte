<script lang="ts">
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { open, ontoggle, onclose }: Props = $props();

  async function changeLocale(locale: Locale) {
    if (!permissionStore.isReadOnly) {
      await projectStore.saveCurrentSchema();
      if (projectStore.storageFull) return;
    }
    languageStore.set(locale);
    onclose();
  }
</script>

<div class="dropdown-wrap">
  <button
    class="btn-lang"
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="menu"
    title={LOCALE_LABELS[languageStore.current]}
  >
    {languageStore.current.toUpperCase()}
  </button>
  {#if open}
    <div
      class="dropdown-menu dropdown-right lang-dropdown"
      role="menu"
      tabindex="-1"
      onmouseleave={onclose}
    >
      {#each Object.entries(LOCALE_LABELS) as [locale, label]}
        <button
          class="dropdown-item"
          class:active={languageStore.current === locale}
          role="menuitem"
          onclick={() => changeLocale(locale as Locale)}
        >
          {label}
        </button>
      {/each}
    </div>
  {/if}
</div>

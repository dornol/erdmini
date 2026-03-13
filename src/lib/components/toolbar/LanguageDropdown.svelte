<script lang="ts">
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { open, ontoggle, onclose }: Props = $props();
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
          onclick={() => { languageStore.set(locale as Locale); onclose(); }}
        >
          {label}
        </button>
      {/each}
    </div>
  {/if}
</div>

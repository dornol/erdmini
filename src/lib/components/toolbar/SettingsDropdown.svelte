<script lang="ts">
  import { themeStore, type ThemeId } from '$lib/store/theme.svelte';
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { open, ontoggle, onclose }: Props = $props();

  const THEMES: { id: ThemeId; label: () => string; dot: string }[] = [
    { id: 'modern',    label: () => m.theme_modern(),    dot: '#1e293b' },
    { id: 'classic',   label: () => m.theme_classic(),   dot: '#6b4c2a' },
    { id: 'blueprint', label: () => m.theme_blueprint(), dot: '#1e4a7a' },
    { id: 'minimal',   label: () => m.theme_minimal(),   dot: '#f0f0f0' },
  ];
</script>

<div class="dropdown-wrap">
  <button
    class="btn-icon"
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="menu"
    title={m.toolbar_settings()}
  >
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M6.86 1.58l-.37 1.47a5.08 5.08 0 00-1.22.7L3.84 3.3l-1.14 2 1.05 1.1a5.1 5.1 0 000 1.4l-1.05 1.1 1.14 2 1.43-.45c.36.28.77.52 1.22.7l.37 1.47h2.28l.37-1.47c.45-.18.86-.42 1.22-.7l1.43.45 1.14-2-1.05-1.1a5.1 5.1 0 000-1.4l1.05-1.1-1.14-2-1.43.45a5.08 5.08 0 00-1.22-.7L9.14 1.58H6.86z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  </button>
  {#if open}
    <div
      class="dropdown-menu dropdown-right settings-dropdown"
      role="menu"
      tabindex="-1"
      onmouseleave={onclose}
    >
      <div class="dropdown-section-label">{m.toolbar_theme()}</div>
      {#each THEMES as t}
        <button
          class="dropdown-item theme-item"
          class:active={themeStore.current === t.id}
          role="menuitem"
          onclick={() => { themeStore.set(t.id); }}
        >
          <span class="theme-dot" style="background:{t.dot}"></span>
          {t.label()}
        </button>
      {/each}
      <div class="dropdown-sep"></div>
      <div class="dropdown-section-label">{languageStore.current.toUpperCase()}</div>
      {#each Object.entries(LOCALE_LABELS) as [locale, label]}
        <button
          class="dropdown-item"
          class:active={languageStore.current === locale}
          role="menuitem"
          onclick={() => { languageStore.set(locale as Locale); }}
        >
          {label}
        </button>
      {/each}
    </div>
  {/if}
</div>

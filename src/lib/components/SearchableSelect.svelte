<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    options: { value: string; label: string }[];
    value: string;
    onchange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
  }

  let {
    options,
    value,
    onchange,
    placeholder = '— Select —',
    disabled = false,
    size = 'md',
  }: Props = $props();

  let open = $state(false);
  let search = $state('');
  let highlightIdx = $state(-1);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let dropdownEl: HTMLDivElement | undefined = $state();
  let searchInputEl: HTMLInputElement | undefined = $state();

  // Dropdown position state
  let dropStyle = $state('');

  let selectedLabel = $derived(
    options.find((o) => o.value === value)?.label ?? '',
  );

  let filtered = $derived(
    search.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
      : options,
  );

  function toggle() {
    if (disabled) return;
    if (open) {
      close();
    } else {
      openDropdown();
    }
  }

  async function openDropdown() {
    if (disabled) return;
    // Hide while measuring so old/wrong position doesn't flash
    dropStyle = 'position:fixed;visibility:hidden;';
    open = true;
    search = '';
    highlightIdx = -1;
    // Wait for Svelte to render the {#if} block and bind dropdownEl
    await tick();
    positionDropdown();
    // Wait for visibility:visible to be applied to DOM before focusing
    await tick();
    searchInputEl?.focus();
  }

  function close() {
    open = false;
    search = '';
    highlightIdx = -1;
    dropStyle = '';
  }

  function select(val: string) {
    onchange(val);
    close();
  }

  function positionDropdown() {
    if (!triggerEl || !dropdownEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const dropH = dropdownEl.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    const flipUp = spaceBelow < dropH && spaceAbove > spaceBelow;

    const top = flipUp ? rect.top - dropH : rect.bottom + 2;
    const left = rect.left;
    const width = rect.width;

    dropStyle = `position:fixed;top:${top}px;left:${left}px;width:${Math.max(width, 160)}px;z-index:9999;visibility:visible;`;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % filtered.length;
      scrollToHighlighted();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = highlightIdx <= 0 ? filtered.length - 1 : highlightIdx - 1;
      scrollToHighlighted();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        select(filtered[highlightIdx].value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerEl?.focus();
    }
  }

  function scrollToHighlighted() {
    requestAnimationFrame(() => {
      if (!dropdownEl) return;
      const item = dropdownEl.querySelector('.ss-item.highlighted') as HTMLElement | null;
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  // Click outside
  function onWindowMouseDown(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (triggerEl?.contains(target) || dropdownEl?.contains(target)) return;
    close();
  }

  // Scroll parent → close
  function onWindowScroll() {
    if (open) close();
  }
</script>

<svelte:window onmousedown={onWindowMouseDown} onscroll={onWindowScroll} />

<div class="ss-root" class:sm={size === 'sm'} class:md={size === 'md'}>
  <button
    class="ss-trigger"
    bind:this={triggerEl}
    onclick={toggle}
    {disabled}
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="ss-trigger-label" class:placeholder={!selectedLabel}>
      {selectedLabel || placeholder}
    </span>
    <span class="ss-chevron">▾</span>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="ss-dropdown"
      bind:this={dropdownEl}
      style={dropStyle}
      onkeydown={onKeyDown}
    >
      <input
        class="ss-search"
        bind:this={searchInputEl}
        bind:value={search}
        placeholder="Search…"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="ss-list thin-scrollbar" role="listbox">
        {#each filtered as opt, idx (opt.value)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="ss-item"
            class:highlighted={idx === highlightIdx}
            class:selected={opt.value === value}
            role="option"
            aria-selected={opt.value === value}
            onmousedown={(e) => { e.preventDefault(); select(opt.value); }}
            onmouseenter={() => (highlightIdx = idx)}
          >
            {opt.label}
          </div>
        {:else}
          <div class="ss-empty">No results</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .ss-root {
    position: relative;
    display: inline-flex;
    width: 100%;
  }

  /* Trigger */
  .ss-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: white;
    color: #1e293b;
    cursor: pointer;
    outline: none;
    text-align: left;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .ss-trigger:focus {
    border-color: #3b82f6;
  }

  .ss-trigger:disabled {
    background: #f8fafc;
    color: #94a3b8;
    cursor: not-allowed;
  }

  .ss-trigger-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .ss-trigger-label.placeholder {
    color: #94a3b8;
  }

  .ss-chevron {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 10px;
    line-height: 1;
  }

  /* Size: sm */
  .sm .ss-trigger {
    padding: 4px 7px;
    font-size: 12px;
    border-radius: 4px;
  }

  .sm .ss-search {
    padding: 4px 7px;
    font-size: 12px;
  }

  .sm .ss-item {
    padding: 3px 7px;
    font-size: 12px;
  }

  /* Size: md */
  .md .ss-trigger {
    padding: 7px 10px;
    font-size: 13px;
    border-radius: 5px;
  }

  .md .ss-search {
    padding: 6px 10px;
    font-size: 13px;
  }

  .md .ss-item {
    padding: 5px 10px;
    font-size: 13px;
  }

  /* Dropdown */
  .ss-dropdown {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ss-search {
    border: none;
    border-bottom: 1px solid #e2e8f0;
    outline: none;
    color: #1e293b;
    background: #f8fafc;
    box-sizing: border-box;
    width: 100%;
  }

  .ss-search::placeholder {
    color: #94a3b8;
  }

  .ss-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .ss-item {
    cursor: pointer;
    color: #1e293b;
    transition: background 0.06s;
  }

  .ss-item.highlighted {
    background: #eff6ff;
  }

  .ss-item.selected {
    color: #3b82f6;
    font-weight: 600;
  }

  .ss-item:active {
    background: #dbeafe;
  }

  .ss-empty {
    padding: 8px 10px;
    font-size: 12px;
    color: #94a3b8;
    text-align: center;
  }
</style>

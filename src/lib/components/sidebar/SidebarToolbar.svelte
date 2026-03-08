<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  let {
    searchQuery = '',
    sortBy = 'creation' as 'creation' | 'name',
    viewMode = 'flat' as 'flat' | 'group',
    onsearchchange,
    onsortchange,
    onviewmodechange,
  }: {
    searchQuery?: string;
    sortBy?: 'creation' | 'name';
    viewMode?: 'flat' | 'group';
    onsearchchange?: (value: string) => void;
    onsortchange?: (value: 'creation' | 'name') => void;
    onviewmodechange?: (value: 'flat' | 'group') => void;
  } = $props();

  let searchFocused = $state(false);
  let hintIndex = $state(-1);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  const SEARCH_PREFIXES = [
    { key: 'fk:', desc: () => m.search_hint_fk() },
    { key: 'group:', desc: () => m.search_hint_group() },
    { key: 'locked:', desc: () => m.search_hint_locked() },
    { key: 'type:', desc: () => m.search_hint_type() },
    { key: 'has:', desc: () => m.search_hint_has() },
    { key: 'no:', desc: () => m.search_hint_no() },
    { key: 'color:', desc: () => m.search_hint_color() },
  ];

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onsearchchange?.(target.value);
  }

  function toggleSort() {
    onsortchange?.(sortBy === 'creation' ? 'name' : 'creation');
  }

  function toggleViewMode() {
    onviewmodechange?.(viewMode === 'flat' ? 'group' : 'flat');
  }
</script>

<div class="search-bar">
  <div class="search-input-wrap">
    <input
      type="text"
      class="search-input"
      placeholder={m.sidebar_search_placeholder()}
      value={searchQuery}
      bind:this={searchInputEl}
      oninput={handleSearchInput}
      onfocus={() => { searchFocused = true; hintIndex = -1; }}
      onblur={() => { searchFocused = false; hintIndex = -1; }}
      onkeydown={(e) => {
        if (!searchFocused || searchQuery.trim()) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          hintIndex = (hintIndex + 1) % SEARCH_PREFIXES.length;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          hintIndex = hintIndex <= 0 ? SEARCH_PREFIXES.length - 1 : hintIndex - 1;
        } else if (e.key === 'Enter' && hintIndex >= 0) {
          e.preventDefault();
          onsearchchange?.(SEARCH_PREFIXES[hintIndex].key);
          hintIndex = -1;
        } else if (e.key === 'Escape') {
          searchFocused = false;
          hintIndex = -1;
        }
      }}
    />
    {#if searchFocused && !searchQuery.trim()}
      <div class="search-hints">
        <div class="search-hints-title">{m.search_hint_title()}</div>
        {#each SEARCH_PREFIXES as prefix, i}
          <button
            class="search-hint-item"
            class:hint-active={hintIndex === i}
            onmousedown={(e) => {
              e.preventDefault();
              onsearchchange?.(prefix.key);
              hintIndex = -1;
              searchInputEl?.focus();
            }}
          >
            <span class="hint-prefix">{prefix.key}</span>
            <span class="hint-desc">{prefix.desc()}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <button
    class="sort-btn"
    title={sortBy === 'creation' ? m.sidebar_sort_by_name() : m.sidebar_sort_by_creation()}
    onclick={toggleSort}
  >
    {sortBy === 'creation' ? m.sidebar_sort_creation() : m.sidebar_sort_name()}
  </button>
  <button
    class="sort-btn"
    class:active-mode={viewMode === 'group'}
    title={m.sidebar_group_by()}
    onclick={toggleViewMode}
  >
    {m.sidebar_group_by()}
  </button>
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
  }

  .search-input {
    flex: 1;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    outline: none;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
  }

  .search-input:focus {
    border-color: #93c5fd;
  }

  .search-input::placeholder {
    color: var(--app-text-faint, #94a3b8);
  }

  .search-input-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .search-input-wrap .search-input {
    width: 100%;
    box-sizing: border-box;
  }

  .search-hints {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--app-panel-bg, #fff);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 4px 0;
    margin-top: 2px;
  }

  .search-hints-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--app-text-faint, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 4px 8px 2px;
  }

  .search-hint-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    color: var(--app-text, #1e293b);
  }

  .search-hint-item:hover,
  .search-hint-item.hint-active {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .hint-prefix {
    font-weight: 600;
    color: #3b82f6;
    font-family: monospace;
    font-size: 11px;
    flex-shrink: 0;
  }

  .hint-desc {
    color: var(--app-text-muted, #64748b);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sort-btn {
    background: none;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sort-btn:hover {
    background: var(--app-hover-bg, #e2e8f0);
    color: var(--app-text, #1e293b);
  }

  .active-mode {
    background: #dbeafe;
    color: #2563eb;
    border-color: #93c5fd;
  }
</style>

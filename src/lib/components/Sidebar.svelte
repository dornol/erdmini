<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';

  let {
    collapsed = false,
    ontoggle,
  }: {
    collapsed?: boolean;
    ontoggle?: () => void;
  } = $props();

  let searchQuery = $state('');
  let sortBy = $state<'creation' | 'name'>('creation');

  const filteredTables = $derived(() => {
    let tables = erdStore.schema.tables;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      tables = tables.filter((t) => t.name.toLowerCase().includes(q));
    }

    // Sort
    if (sortBy === 'name') {
      tables = [...tables].sort((a, b) => a.name.localeCompare(b.name));
    }

    return tables;
  });

  function getTableMeta(table: typeof erdStore.schema.tables[0]) {
    const colCount = table.columns.length;
    const fkCount = table.foreignKeys.length;
    const pkCols = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
    return { colCount, fkCount, pkCols };
  }

  function onItemClick(e: MouseEvent, tableId: string) {
    if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(erdStore.selectedTableIds);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      erdStore.selectedTableIds = newSet;
    } else {
      erdStore.selectedTableId = tableId;
      erdStore.selectedTableIds = new Set([tableId]);
    }
  }

  async function bulkDelete() {
    const ids = [...erdStore.selectedTableIds];
    if (ids.length < 2) return;
    const ok = await dialogStore.confirm(`선택한 ${ids.length}개 테이블을 삭제하시겠습니까?`, {
      title: '테이블 삭제',
      confirmText: '삭제',
      variant: 'danger',
    });
    if (ok) erdStore.deleteTables(ids);
  }

  function duplicateTable(e: MouseEvent, tableId: string) {
    e.stopPropagation();
    erdStore.duplicateTable(tableId);
  }
</script>

{#if collapsed}
  <button class="expand-btn" onclick={ontoggle} title="사이드바 열기">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
{:else}
  <aside class="sidebar">
    <div class="sidebar-header">
      <span>테이블 목록</span>
      <div class="header-right">
        {#if erdStore.selectedTableIds.size >= 2}
          <button class="bulk-delete-btn" onclick={bulkDelete}>
            선택 삭제({erdStore.selectedTableIds.size})
          </button>
        {/if}
        <span class="count">{erdStore.schema.tables.length}</span>
        <button class="collapse-btn" onclick={ontoggle} title="사이드바 접기">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="search-bar">
      <input
        type="text"
        class="search-input"
        placeholder="테이블 검색..."
        bind:value={searchQuery}
      />
      <button
        class="sort-btn"
        title={sortBy === 'creation' ? '이름순 정렬' : '생성순 정렬'}
        onclick={() => (sortBy = sortBy === 'creation' ? 'name' : 'creation')}
      >
        {sortBy === 'creation' ? '생성순' : '이름순'}
      </button>
    </div>

    <ul class="table-list">
      {#each filteredTables() as table (table.id)}
        {@const meta = getTableMeta(table)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li
          class="table-item"
          class:active={erdStore.selectedTableIds.has(table.id)}
          onclick={(e) => onItemClick(e, table.id)}
        >
          <div class="item-info">
            <span class="item-name">{table.name}</span>
            <span class="item-meta">
              {meta.colCount} cols{#if meta.fkCount > 0} · {meta.fkCount} FK{/if}{#if meta.pkCols.length > 0} · PK: {meta.pkCols.join(', ')}{/if}
            </span>
            {#if table.comment}
              <span class="item-comment">{table.comment}</span>
            {/if}
          </div>
          <div class="item-actions">
            <button
              class="item-action-btn"
              title="복제"
              onclick={(e) => duplicateTable(e, table.id)}
            >⧉</button>
            <button
              class="item-action-btn item-delete"
              title="삭제"
              onclick={async (e) => {
                e.stopPropagation();
                const ok = await dialogStore.confirm(`"${table.name}" 테이블을 삭제하시겠습니까?`, {
                  title: '테이블 삭제',
                  confirmText: '삭제',
                  variant: 'danger',
                });
                if (ok) erdStore.deleteTable(table.id);
              }}
            >✕</button>
          </div>
        </li>
      {:else}
        <li class="empty-hint">
          {#if searchQuery.trim()}
            검색 결과가 없습니다.
          {:else}
            테이블이 없습니다.<br />+ 새 테이블로 시작하세요.
          {/if}
        </li>
      {/each}
    </ul>
  </aside>
{/if}

<style>
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: #f8fafc;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e2e8f0;
    gap: 6px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .collapse-btn {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .collapse-btn:hover {
    color: #475569;
    background: #e2e8f0;
  }

  .expand-btn {
    position: absolute;
    left: 0;
    top: 48px;
    z-index: 50;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: none;
    border-radius: 0 6px 6px 0;
    padding: 8px 4px;
    cursor: pointer;
    color: #64748b;
    display: flex;
    align-items: center;
  }

  .expand-btn:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
  }

  .search-input {
    flex: 1;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    outline: none;
    background: white;
    color: #1e293b;
  }

  .search-input:focus {
    border-color: #93c5fd;
  }

  .search-input::placeholder {
    color: #94a3b8;
  }

  .sort-btn {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 10px;
    color: #64748b;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sort-btn:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .bulk-delete-btn {
    background: #fee2e2;
    color: #ef4444;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .bulk-delete-btn:hover {
    background: #fecaca;
  }

  .count {
    background: #e2e8f0;
    color: #475569;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
  }

  .table-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    flex: 1;
  }

  .table-item {
    display: flex;
    align-items: flex-start;
    padding: 8px 14px;
    cursor: pointer;
    border-bottom: 1px solid #f1f5f9;
    transition: background 0.1s;
  }

  .table-item:hover {
    background: #f1f5f9;
  }

  .table-item.active {
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    padding-left: 11px;
  }

  .item-info {
    flex: 1;
    overflow: hidden;
  }

  .item-name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    display: block;
    font-size: 11px;
    color: #94a3b8;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-comment {
    display: block;
    font-size: 11px;
    color: #94a3b8;
    font-style: italic;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .table-item:hover .item-actions {
    opacity: 1;
  }

  .item-action-btn {
    background: none;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
  }

  .item-action-btn:hover {
    color: #3b82f6;
    background: #eff6ff;
  }

  .item-delete:hover {
    color: #ef4444;
    background: #fee2e2;
  }

  .empty-hint {
    padding: 24px 14px;
    font-size: 12px;
    color: #94a3b8;
    text-align: center;
    line-height: 1.6;
  }
</style>

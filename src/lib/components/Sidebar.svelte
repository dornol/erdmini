<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';

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

  function bulkDelete() {
    const ids = [...erdStore.selectedTableIds];
    if (ids.length < 2) return;
    if (window.confirm(`선택한 ${ids.length}개 테이블을 삭제하시겠습니까?`)) {
      erdStore.deleteTables(ids);
    }
  }
</script>

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
    </div>
  </div>

  <ul class="table-list">
    {#each erdStore.schema.tables as table (table.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li
        class="table-item"
        class:active={erdStore.selectedTableIds.has(table.id)}
        onclick={(e) => onItemClick(e, table.id)}
      >
        <div class="item-info">
          <span class="item-name">{table.name}</span>
          <span class="item-count">{table.columns.length}개</span>
        </div>
        <button
          class="item-delete"
          title="삭제"
          onclick={(e) => {
            e.stopPropagation();
            if (window.confirm(`"${table.name}" 테이블을 삭제하시겠습니까?`)) {
              erdStore.deleteTable(table.id);
            }
          }}
        >✕</button>
      </li>
    {:else}
      <li class="empty-hint">테이블이 없습니다.<br />+ 새 테이블로 시작하세요.</li>
    {/each}
  </ul>
</aside>

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
    align-items: center;
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

  .item-count {
    font-size: 11px;
    color: #94a3b8;
  }

  .item-delete {
    background: none;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }

  .table-item:hover .item-delete {
    opacity: 1;
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

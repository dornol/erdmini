<script lang="ts">
  import type { Table } from '$lib/types/erd';

  interface Props {
    table: Table;
    isHovered: boolean;
    isColumnHovered: boolean;
    isDragging: boolean;
    isFkDragging: boolean;
  }

  let {
    table,
    isHovered,
    isColumnHovered,
    isDragging,
    isFkDragging,
  }: Props = $props();

  // Resolve column names from IDs for tooltip display
  function colNames(columnIds: string[]): string {
    return columnIds.map((id) => table.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
  }

  let hasConstraintInfo = $derived(
    (table.uniqueKeys?.length ?? 0) > 0 || (table.indexes?.length ?? 0) > 0
  );
</script>

<!-- Table-level tooltip: Unique Keys & Indexes (shown on card hover, hidden when column hovered) -->
{#if hasConstraintInfo && isHovered && !isColumnHovered && !isDragging && !isFkDragging}
  <div class="table-tooltip">
    {#if (table.uniqueKeys?.length ?? 0) > 0}
      <div class="ttt-section">
        <div class="ttt-heading">Unique Keys</div>
        {#each table.uniqueKeys as uk}
          <div class="ttt-item">
            {#if uk.name}<span class="ttt-name">{uk.name}</span>{/if}
            <span class="ttt-cols">({colNames(uk.columnIds)})</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if (table.indexes?.length ?? 0) > 0}
      <div class="ttt-section">
        <div class="ttt-heading">Indexes</div>
        {#each table.indexes as idx}
          <div class="ttt-item">
            {#if idx.name}<span class="ttt-name">{idx.name}</span>{/if}
            <span class="ttt-cols">({colNames(idx.columnIds)})</span>
            {#if idx.unique}<span class="ttt-unique">UNIQUE</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Comment (optional) -->
{#if table.comment}
  <div class="table-comment">{table.comment}</div>
{/if}

<style>
  /* ── Table comment ── */
  .table-comment {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--erd-comment-text);
    font-style: italic;
    background: var(--erd-comment-bg);
    border-bottom: 1px solid var(--erd-comment-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Table-level tooltip (Unique Keys & Indexes) ── */
  .table-tooltip {
    position: absolute;
    left: calc(100% + 10px);
    top: 0;
    z-index: 200;
    background: var(--erd-tt-bg);
    color: var(--erd-tt-text);
    border: 1px solid var(--erd-tt-border);
    border-radius: var(--erd-tt-radius);
    padding: 8px 10px;
    min-width: 160px;
    max-width: 300px;
    box-shadow: var(--erd-tt-shadow);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }

  .ttt-section + .ttt-section {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--erd-tt-border);
  }

  .ttt-heading {
    font-weight: 700;
    font-size: 11px;
    color: var(--erd-tt-title);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ttt-item {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
    font-size: 11px;
  }

  .ttt-name {
    color: var(--erd-tt-mono);
    font-family: monospace;
    font-size: 11px;
  }

  .ttt-cols {
    color: var(--erd-tt-label);
    font-size: 11px;
  }

  .ttt-unique {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: var(--erd-badge-radius);
    background: var(--erd-badge-uq-bg);
    color: var(--erd-badge-uq-text);
    border: 1px solid var(--erd-badge-uq-border);
  }
</style>

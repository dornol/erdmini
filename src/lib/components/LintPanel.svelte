<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { lintSchema, type LintIssue } from '$lib/utils/schema-lint';
  import * as m from '$lib/paraglide/messages';

  let { onclose }: { onclose: () => void } = $props();

  let issues = $derived(lintSchema(erdStore.schema));

  const RULE_LABELS: Record<string, () => string> = {
    'no-pk': () => m.lint_no_pk(),
    'fk-target-missing': () => m.lint_fk_target_missing(),
    'set-null-not-nullable': () => m.lint_set_null_not_nullable(),
    'duplicate-column-name': () => m.lint_duplicate_column(),
    'duplicate-table-name': () => m.lint_duplicate_table(),
    'duplicate-index': () => m.lint_duplicate_index(),
    'circular-fk': () => m.lint_circular_fk(),
    'empty-table': () => m.lint_empty_table(),
  };

  const SEVERITY_ICON: Record<string, string> = {
    error: '●',
    warning: '▲',
    info: '○',
  };

  const SEVERITY_ORDER: Record<string, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  let sortedIssues = $derived(
    [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  );

  function navigateToTable(tableId: string) {
    const table = erdStore.schema.tables.find((t) => t.id === tableId);
    if (!table) return;

    erdStore.selectedTableId = tableId;
    erdStore.selectedTableIds = new Set([tableId]);

    // Center canvas on the table
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvasState.x = vw / 2 - table.position.x * canvasState.scale - 100 * canvasState.scale;
    canvasState.y = vh / 2 - table.position.y * canvasState.scale - 40 * canvasState.scale;
  }

  function handleIssueClick(issue: LintIssue) {
    if (issue.tableId) {
      navigateToTable(issue.tableId);
    }
  }
</script>

<div class="lint-panel">
  <div class="lint-header">
    <span class="lint-title">{m.lint_title()}</span>
    <button class="lint-close" onclick={onclose}>✕</button>
  </div>

  <div class="lint-body">
    {#if sortedIssues.length === 0}
      <div class="lint-empty">
        <span class="lint-empty-icon">✓</span>
        <span>{m.lint_no_issues()}</span>
      </div>
    {:else}
      {#each sortedIssues as issue (issue.id)}
        <button
          class="lint-item lint-{issue.severity}"
          onclick={() => handleIssueClick(issue)}
          disabled={!issue.tableId}
        >
          <span class="lint-severity-icon">{SEVERITY_ICON[issue.severity]}</span>
          <div class="lint-item-content">
            <span class="lint-rule">{RULE_LABELS[issue.ruleId]?.() ?? issue.ruleId}</span>
            <span class="lint-detail">{issue.message}</span>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .lint-panel {
    position: fixed;
    top: 56px;
    right: 16px;
    width: 320px;
    max-height: calc(100vh - 72px);
    background: var(--app-popup-bg, #1e293b);
    border: 1px solid var(--app-border, #475569);
    border-radius: 8px;
    box-shadow: var(--app-popup-shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
    z-index: 150;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .lint-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    flex-shrink: 0;
  }

  .lint-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
  }

  .lint-close {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .lint-close:hover {
    background: var(--app-hover-bg, #334155);
    color: var(--app-text, #f1f5f9);
  }

  .lint-body {
    overflow-y: auto;
    max-height: 400px;
    padding: 4px 0;
  }

  .lint-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 20px 14px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 13px;
  }

  .lint-empty-icon {
    color: #22c55e;
    font-size: 16px;
    font-weight: 700;
  }

  .lint-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    font-size: 12px;
  }

  .lint-item:disabled {
    cursor: default;
  }

  .lint-item:not(:disabled):hover {
    background: var(--app-hover-bg, #334155);
  }

  .lint-severity-icon {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 18px;
    width: 14px;
    text-align: center;
  }

  .lint-error .lint-severity-icon {
    color: #ef4444;
  }

  .lint-warning .lint-severity-icon {
    color: #f59e0b;
  }

  .lint-info .lint-severity-icon {
    color: #3b82f6;
  }

  .lint-item-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .lint-rule {
    color: var(--app-text, #e2e8f0);
    font-size: 12px;
    font-weight: 500;
  }

  .lint-detail {
    color: var(--app-text-muted, #94a3b8);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

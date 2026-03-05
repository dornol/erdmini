<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { computeCoverageStats } from '$lib/utils/domain-analysis';
  import * as m from '$lib/paraglide/messages';

  let showCoverage = $state(false);
  let coverageStats = $derived(computeCoverageStats(erdStore.schema));
</script>

{#if coverageStats.totalColumns > 0}
  <div class="coverage-panel">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="coverage-header" onclick={() => showCoverage = !showCoverage}>
      <span class="coverage-toggle">{showCoverage ? '▼' : '▶'}</span>
      <span class="coverage-title">{m.domain_coverage()}</span>
      <span class="coverage-summary">{m.domain_coverage_label({
        percent: String(coverageStats.coveragePercent),
        linked: String(coverageStats.linkedColumns),
        total: String(coverageStats.totalColumns)
      })}</span>
    </div>
    {#if showCoverage}
      <div class="coverage-body">
        <div class="coverage-bar-wrapper">
          <div
            class="coverage-bar"
            class:green={coverageStats.coveragePercent > 80}
            class:yellow={coverageStats.coveragePercent > 50 && coverageStats.coveragePercent <= 80}
            class:red={coverageStats.coveragePercent <= 50}
            style="width: {coverageStats.coveragePercent}%"
          ></div>
        </div>
        {#if coverageStats.groupBreakdown.length > 1}
          <div class="coverage-groups">
            {#each coverageStats.groupBreakdown as gb}
              <div class="coverage-group-item">
                <span class="coverage-group-name">{gb.group}</span>
                <div class="coverage-minibar-wrapper">
                  <div
                    class="coverage-minibar"
                    class:green={gb.percent > 80}
                    class:yellow={gb.percent > 50 && gb.percent <= 80}
                    class:red={gb.percent <= 50}
                    style="width: {gb.percent}%"
                  ></div>
                </div>
                <span class="coverage-group-pct">{gb.percent}%</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .coverage-panel {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .coverage-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    background: #f8fafc;
    user-select: none;
  }

  .coverage-header:hover {
    background: #f1f5f9;
  }

  .coverage-toggle {
    font-size: 9px;
    color: #94a3b8;
  }

  .coverage-title {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
  }

  .coverage-summary {
    font-size: 11px;
    color: #94a3b8;
    margin-left: auto;
  }

  .coverage-body {
    padding: 10px 12px;
    border-top: 1px solid #e2e8f0;
  }

  .coverage-bar-wrapper {
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }

  .coverage-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .coverage-bar.green { background: #22c55e; }
  .coverage-bar.yellow { background: #f59e0b; }
  .coverage-bar.red { background: #ef4444; }

  .coverage-groups {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .coverage-group-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }

  .coverage-group-name {
    width: 100px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .coverage-minibar-wrapper {
    flex: 1;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
  }

  .coverage-minibar {
    height: 100%;
    border-radius: 2px;
  }

  .coverage-minibar.green { background: #22c55e; }
  .coverage-minibar.yellow { background: #f59e0b; }
  .coverage-minibar.red { background: #ef4444; }

  .coverage-group-pct {
    width: 32px;
    text-align: right;
    color: #64748b;
    flex-shrink: 0;
  }
</style>

<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { namingRuleStore } from '$lib/store/naming-rules.svelte';
  import { NAMING_CONVENTIONS, NAMING_RULE_TYPES, type NamingRuleType } from '$lib/types/naming-rules';
  import { permissionStore } from '$lib/store/permission.svelte';
  import * as m from '$lib/paraglide/messages';

  let { onclose }: { onclose: () => void } = $props();

  const CASE_RULES: NamingRuleType[] = ['tableCase', 'columnCase'];
  const AFFIX_RULES: NamingRuleType[] = ['tablePrefix', 'tableSuffix', 'columnPrefix', 'columnSuffix'];
  const DICT_RULES: NamingRuleType[] = ['dictionaryCheck'];

  const RULE_LABELS: Record<NamingRuleType, () => string> = {
    tableCase: () => m.naming_rule_table_case(),
    columnCase: () => m.naming_rule_column_case(),
    tablePrefix: () => m.naming_rule_table_prefix(),
    tableSuffix: () => m.naming_rule_table_suffix(),
    columnPrefix: () => m.naming_rule_column_prefix(),
    columnSuffix: () => m.naming_rule_column_suffix(),
    dictionaryCheck: () => m.naming_rule_dictionary_check(),
  };

  const DICT_TARGETS = [
    { value: 'table', label: () => m.naming_rule_table() },
    { value: 'column', label: () => m.naming_rule_column() },
    { value: 'both', label: () => m.naming_rule_both() },
  ];

  let effectiveRules = $derived(namingRuleStore.effectiveRules);
  let activeRuleTypes = $derived(
    NAMING_RULE_TYPES.filter(t => namingRuleStore.siteRules[t]?.enabled)
  );

  function getProjectOverride(type: NamingRuleType): string | undefined {
    return erdStore.schema.namingRules?.[type];
  }

  function setOverride(type: NamingRuleType, value: string) {
    erdStore.setNamingOverride(type, value);
  }

  function resetOverride(type: NamingRuleType) {
    erdStore.setNamingOverride(type, undefined);
  }

  function isCaseRule(type: NamingRuleType) { return CASE_RULES.includes(type); }
  function isAffixRule(type: NamingRuleType) { return AFFIX_RULES.includes(type); }
  function isDictRule(type: NamingRuleType) { return DICT_RULES.includes(type); }
</script>

<div class="nr-panel">
  <div class="nr-header">
    <span class="nr-title">{m.naming_rule_title()}</span>
    <button class="nr-close" onclick={onclose}>✕</button>
  </div>

  <div class="nr-body">
    {#if activeRuleTypes.length === 0}
      <div class="nr-empty">{m.naming_rule_no_rules()}</div>
    {:else}
      {#each activeRuleTypes as ruleType}
        {@const effective = effectiveRules[ruleType]}
        {@const canOverride = namingRuleStore.canOverride(ruleType)}
        {@const hasOverride = getProjectOverride(ruleType) !== undefined}
        <div class="nr-rule">
          <div class="nr-rule-header">
            <span class="nr-rule-name">{RULE_LABELS[ruleType]()}</span>
            {#if effective}
              <span class="nr-rule-source" class:nr-source-project={effective.source === 'project'}>
                {effective.source === 'project' ? m.naming_rule_source_project() : m.naming_rule_source_admin()}
              </span>
            {/if}
          </div>
          <div class="nr-rule-value">
            {#if canOverride && !permissionStore.isReadOnly}
              {#if isCaseRule(ruleType)}
                <select
                  class="nr-select"
                  value={effective?.value ?? ''}
                  onchange={(e) => setOverride(ruleType, (e.target as HTMLSelectElement).value)}
                >
                  {#each NAMING_CONVENTIONS as conv}
                    <option value={conv}>{conv}</option>
                  {/each}
                </select>
              {:else if isAffixRule(ruleType)}
                <input
                  type="text"
                  class="nr-input"
                  value={effective?.value ?? ''}
                  oninput={(e) => setOverride(ruleType, (e.target as HTMLInputElement).value)}
                  maxlength="20"
                />
              {:else if isDictRule(ruleType)}
                <select
                  class="nr-select"
                  value={effective?.value ?? 'both'}
                  onchange={(e) => setOverride(ruleType, (e.target as HTMLSelectElement).value)}
                >
                  {#each DICT_TARGETS as t}
                    <option value={t.value}>{t.label()}</option>
                  {/each}
                </select>
              {/if}
              {#if hasOverride}
                <button class="nr-reset" onclick={() => resetOverride(ruleType)} title={m.naming_rule_reset()}>
                  ↺
                </button>
              {/if}
            {:else}
              <span class="nr-value-readonly">{effective?.value ?? ''}</span>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .nr-panel {
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

  .nr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #334155);
    flex-shrink: 0;
  }

  .nr-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
  }

  .nr-close {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .nr-close:hover {
    background: var(--app-hover-bg, #334155);
    color: var(--app-text, #f1f5f9);
  }

  .nr-body {
    overflow-y: auto;
    max-height: 400px;
    padding: 8px 0;
  }

  .nr-empty {
    padding: 20px 14px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 13px;
    text-align: center;
  }

  .nr-rule {
    padding: 8px 14px;
    border-bottom: 1px solid var(--app-border, #1e293b);
  }

  .nr-rule:last-child {
    border-bottom: none;
  }

  .nr-rule-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .nr-rule-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text, #e2e8f0);
  }

  .nr-rule-source {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: #334155;
    color: #94a3b8;
  }

  .nr-source-project {
    background: #1e3a5f;
    color: #60a5fa;
  }

  .nr-rule-value {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nr-select {
    background: var(--app-input-bg, #0f172a);
    border: 1px solid var(--app-border, #334155);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 11px;
    padding: 3px 6px;
    flex: 1;
  }

  .nr-input {
    background: var(--app-input-bg, #0f172a);
    border: 1px solid var(--app-border, #334155);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 11px;
    padding: 3px 6px;
    flex: 1;
  }

  .nr-value-readonly {
    font-size: 11px;
    color: var(--app-text-muted, #94a3b8);
    font-family: monospace;
  }

  .nr-reset {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 2px;
    border-radius: 3px;
    line-height: 1;
  }

  .nr-reset:hover {
    color: #f59e0b;
    background: var(--app-hover-bg, #334155);
  }
</style>

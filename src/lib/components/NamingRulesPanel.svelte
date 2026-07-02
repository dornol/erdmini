<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { namingRuleStore } from '$lib/store/naming-rules.svelte';
  import {
    NAMING_CONVENTIONS,
    NAMING_RULE_TYPES,
    normalizeProjectNamingOverride,
    type NamingRuleType,
    type ProjectNamingOverrideEntry,
  } from '$lib/types/naming-rules';
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

  type ProjectRuleMode = 'inherit' | 'override' | 'off';

  let effectiveRules = $derived(namingRuleStore.effectiveRules);
  let dictionaries = $derived(namingRuleStore.dictionaries);
  let selectedDictionaryId = $derived(erdStore.schema.dictionaryId ?? dictionaries[0]?.id ?? 'default');

  function getProjectOverride(type: NamingRuleType): ProjectNamingOverrideEntry | undefined {
    return normalizeProjectNamingOverride(erdStore.schema.namingRules?.[type]);
  }

  function isEnabled(type: NamingRuleType): boolean {
    return namingRuleStore.siteRules[type]?.enabled === true;
  }

  function hasProjectOverride(type: NamingRuleType): boolean {
    return getProjectOverride(type) !== undefined;
  }

  function isProjectDisabled(type: NamingRuleType): boolean {
    return getProjectOverride(type)?.enabled === false;
  }

  function canEditRule(type: NamingRuleType): boolean {
    return isEnabled(type) && namingRuleStore.canOverride(type) && !permissionStore.isReadOnly;
  }

  function canEditValue(type: NamingRuleType): boolean {
    return canEditRule(type) && projectRuleMode(type) === 'override';
  }

  function currentValue(type: NamingRuleType): string {
    return effectiveRules[type]?.value ?? namingRuleStore.siteRules[type]?.value ?? '';
  }

  function statusLabel(type: NamingRuleType): string {
    if (!isEnabled(type)) return m.naming_rule_status_disabled();
    if (!namingRuleStore.canOverride(type)) return m.naming_rule_status_locked();
    if (namingRuleStore.canOverride(type) && isProjectDisabled(type)) return m.naming_rule_status_project_disabled();
    if (hasProjectOverride(type)) return m.naming_rule_status_override();
    if (namingRuleStore.canOverride(type)) return m.naming_rule_status_inherited();
    return m.naming_rule_status_locked();
  }

  function isInherited(type: NamingRuleType): boolean {
    return isEnabled(type) && namingRuleStore.canOverride(type) && !hasProjectOverride(type);
  }

  function isLocked(type: NamingRuleType): boolean {
    return isEnabled(type) && !namingRuleStore.canOverride(type);
  }

  function setOverride(type: NamingRuleType, value: string) {
    erdStore.setNamingOverride(type, value);
  }

  function projectRuleMode(type: NamingRuleType): ProjectRuleMode {
    const override = getProjectOverride(type);
    if (!override) return 'inherit';
    if (override.enabled === false) return 'off';
    return 'override';
  }

  function setProjectRuleMode(type: NamingRuleType, mode: ProjectRuleMode) {
    if (mode === 'inherit') {
      resetOverride(type);
      return;
    }
    if (mode === 'off') {
      erdStore.setNamingOverrideEnabled(type, false);
      return;
    }
    erdStore.setNamingOverride(type, currentValue(type));
    erdStore.setNamingOverrideEnabled(type, true);
  }

  function resetOverride(type: NamingRuleType) {
    erdStore.setNamingOverride(type, undefined);
  }

  function setDictionaryId(value: string) {
    erdStore.setDictionaryId(value || undefined);
    namingRuleStore.fetchDictionaryWords(value || undefined);
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
    <p class="nr-desc">{m.naming_rule_project_desc()}</p>

    {#if dictionaries.length > 0}
      <div class="nr-rule">
        <div class="nr-rule-header">
          <span class="nr-rule-name">{m.dict_title()}</span>
          <span class="nr-rule-source nr-source-project">{m.naming_rule_source_project()}</span>
        </div>
        <div class="nr-rule-value">
          {#if !permissionStore.isReadOnly}
            <select
              class="nr-select"
              value={selectedDictionaryId}
              onchange={(e) => setDictionaryId((e.target as HTMLSelectElement).value)}
            >
              {#each dictionaries as dict}
                <option value={dict.id}>{dict.name}{dict.is_default ? ` (${m.dict_default()})` : ''}</option>
              {/each}
            </select>
          {:else}
            <span class="nr-value-readonly">{dictionaries.find(d => d.id === selectedDictionaryId)?.name ?? selectedDictionaryId}</span>
          {/if}
        </div>
      </div>
    {/if}

    {#each NAMING_RULE_TYPES as ruleType}
      {@const hasOverride = hasProjectOverride(ruleType)}
      {@const value = currentValue(ruleType)}
      {@const mode = projectRuleMode(ruleType)}
      <div class="nr-rule">
        <div class="nr-rule-header">
          <span class="nr-rule-name">{RULE_LABELS[ruleType]()}</span>
          <span
            class="nr-rule-source"
            class:nr-source-project={hasOverride}
            class:nr-source-inherited={isInherited(ruleType)}
            class:nr-source-locked={isLocked(ruleType)}
            class:nr-source-disabled={!isEnabled(ruleType) || (namingRuleStore.canOverride(ruleType) && isProjectDisabled(ruleType))}
          >
            {statusLabel(ruleType)}
          </span>
        </div>
        <div class="nr-rule-value">
          {#if canEditRule(ruleType)}
            <select
              class="nr-mode"
              value={mode}
              onchange={(e) => setProjectRuleMode(ruleType, (e.target as HTMLSelectElement).value as ProjectRuleMode)}
            >
              <option value="inherit">{m.naming_rule_mode_inherit()}</option>
              <option value="override">{m.naming_rule_mode_override()}</option>
              <option value="off">{m.naming_rule_mode_off()}</option>
            </select>
            {#if isCaseRule(ruleType)}
              <select
                class="nr-select"
                value={value}
                disabled={!canEditValue(ruleType)}
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
                value={value}
                disabled={!canEditValue(ruleType)}
                oninput={(e) => setOverride(ruleType, (e.target as HTMLInputElement).value)}
                maxlength="20"
              />
            {:else if isDictRule(ruleType)}
              <select
                class="nr-select"
                value={value || 'both'}
                disabled={!canEditValue(ruleType)}
                onchange={(e) => setOverride(ruleType, (e.target as HTMLSelectElement).value)}
              >
                {#each DICT_TARGETS as t}
                  <option value={t.value}>{t.label()}</option>
                {/each}
              </select>
            {/if}
            {#if hasOverride && mode !== 'inherit'}
              <button class="nr-reset" onclick={() => resetOverride(ruleType)} title={m.naming_rule_reset()}>
                ↺
              </button>
            {/if}
          {:else}
            <span class="nr-value-readonly">{isEnabled(ruleType) ? value : m.naming_rule_status_disabled()}</span>
          {/if}
        </div>
      </div>
    {/each}
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

  .nr-desc {
    margin: 0;
    padding: 4px 14px 10px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 11px;
    line-height: 1.45;
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

  .nr-source-inherited {
    background: #1f3a2f;
    color: #86efac;
  }

  .nr-source-locked {
    background: #3b2f1f;
    color: #fbbf24;
  }

  .nr-source-disabled {
    background: #2d3340;
    color: #64748b;
  }

  .nr-rule-value {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nr-mode {
    background: var(--app-input-bg, #0f172a);
    border: 1px solid var(--app-border, #334155);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 11px;
    padding: 3px 4px;
    width: 82px;
    flex: 0 0 82px;
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

  .nr-select:disabled,
  .nr-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

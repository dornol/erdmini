<script lang="ts">
  import { onMount } from 'svelte';
  import { NAMING_CONVENTIONS, NAMING_RULE_TYPES, type NamingRuleEntry, type NamingRuleType, type SiteNamingRules } from '$lib/types/naming-rules';
  import * as m from '$lib/paraglide/messages';

  let rules = $state<SiteNamingRules>({});
  let saving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

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

  function getEntry(type: NamingRuleType): NamingRuleEntry {
    return rules[type] ?? { enabled: false, value: '', allowOverride: false };
  }

  function setEntry(type: NamingRuleType, entry: NamingRuleEntry) {
    rules[type] = entry;
    rules = { ...rules };
  }

  function toggleEnabled(type: NamingRuleType) {
    const e = getEntry(type);
    // Set sensible default values when enabling
    let defaultValue = e.value;
    if (!defaultValue) {
      if (CASE_RULES.includes(type)) defaultValue = 'snake_case';
      else if (type === 'dictionaryCheck') defaultValue = 'both';
    }
    setEntry(type, { ...e, enabled: !e.enabled, value: defaultValue });
  }

  function toggleOverride(type: NamingRuleType) {
    const e = getEntry(type);
    setEntry(type, { ...e, allowOverride: !e.allowOverride });
  }

  function setValue(type: NamingRuleType, value: string) {
    const e = getEntry(type);
    setEntry(type, { ...e, value });
  }

  onMount(async () => {
    const res = await fetch('/api/admin/naming-rules');
    if (res.ok) rules = await res.json();
  });

  async function save() {
    saving = true;
    message = null;
    try {
      const res = await fetch('/api/admin/naming-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      if (res.ok) {
        rules = await res.json();
        message = { type: 'success', text: m.naming_rule_saved() };
      } else {
        message = { type: 'error', text: m.naming_rule_save_failed() };
      }
    } catch {
      message = { type: 'error', text: m.naming_rule_save_failed() };
    } finally {
      saving = false;
    }
  }
</script>

<div class="section">
  <h2>{m.naming_rule_title()}</h2>
  <p class="section-desc">{m.naming_rule_admin_desc()}</p>

  <!-- Case Rules -->
  <div class="form-section">
    <h3>{m.naming_rule_case_section()}</h3>
    {#each CASE_RULES as ruleType}
      {@const entry = getEntry(ruleType)}
      <div class="rule-row">
        <label class="rule-toggle">
          <input type="checkbox" checked={entry.enabled} onchange={() => toggleEnabled(ruleType)} />
          <span class="rule-name">{RULE_LABELS[ruleType]()}</span>
        </label>
        {#if entry.enabled}
          <div class="rule-config">
            <select
              class="rule-select"
              value={entry.value}
              onchange={(e) => setValue(ruleType, (e.target as HTMLSelectElement).value)}
            >
              {#each NAMING_CONVENTIONS as conv}
                <option value={conv}>{conv}</option>
              {/each}
            </select>
            <label class="override-toggle">
              <input type="checkbox" checked={entry.allowOverride} onchange={() => toggleOverride(ruleType)} />
              <span>{m.naming_rule_allow_override()}</span>
            </label>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Prefix/Suffix Rules -->
  <div class="form-section">
    <h3>{m.naming_rule_affix_section()}</h3>
    {#each AFFIX_RULES as ruleType}
      {@const entry = getEntry(ruleType)}
      <div class="rule-row">
        <label class="rule-toggle">
          <input type="checkbox" checked={entry.enabled} onchange={() => toggleEnabled(ruleType)} />
          <span class="rule-name">{RULE_LABELS[ruleType]()}</span>
        </label>
        {#if entry.enabled}
          <div class="rule-config">
            <input
              type="text"
              class="rule-input"
              value={entry.value}
              oninput={(e) => setValue(ruleType, (e.target as HTMLInputElement).value)}
              placeholder={ruleType.includes('Prefix') ? 'tbl_' : '_tbl'}
              maxlength="20"
            />
            <label class="override-toggle">
              <input type="checkbox" checked={entry.allowOverride} onchange={() => toggleOverride(ruleType)} />
              <span>{m.naming_rule_allow_override()}</span>
            </label>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Dictionary Check -->
  <div class="form-section">
    <h3>{m.naming_rule_dictionary_section()}</h3>
    <p class="field-desc">{m.naming_rule_dictionary_desc()}</p>
    {#each DICT_RULES as ruleType}
      {@const entry = getEntry(ruleType)}
      <div class="rule-row">
        <label class="rule-toggle">
          <input type="checkbox" checked={entry.enabled} onchange={() => toggleEnabled(ruleType)} />
          <span class="rule-name">{RULE_LABELS[ruleType]()}</span>
        </label>
        {#if entry.enabled}
          <div class="rule-config">
            <select
              class="rule-select"
              value={entry.value}
              onchange={(e) => setValue(ruleType, (e.target as HTMLSelectElement).value)}
            >
              {#each DICT_TARGETS as t}
                <option value={t.value}>{t.label()}</option>
              {/each}
            </select>
            <label class="override-toggle">
              <input type="checkbox" checked={entry.allowOverride} onchange={() => toggleOverride(ruleType)} />
              <span>{m.naming_rule_allow_override()}</span>
            </label>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="save-row">
    <button class="btn-primary" onclick={save} disabled={saving}>
      {saving ? m.naming_rule_saving() : m.action_save()}
    </button>
    {#if message}
      <span class={message.type === 'success' ? 'msg-success' : 'msg-error'}>{message.text}</span>
    {/if}
  </div>
</div>

<style>
  .field-desc {
    font-size: 12px;
    color: var(--app-text-muted);
    margin: 0 0 8px;
  }

  .rule-row {
    padding: 10px 0;
    border-bottom: 1px solid var(--app-border-light);
  }

  .rule-row:last-child {
    border-bottom: none;
  }

  .rule-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .rule-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text);
  }

  .rule-config {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding-left: 24px;
  }

  .rule-select {
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 4px;
    color: var(--app-text);
    font-size: 12px;
    padding: 4px 8px;
    min-width: 140px;
  }

  .rule-input {
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 4px;
    color: var(--app-text);
    font-size: 12px;
    padding: 4px 8px;
    width: 120px;
  }

  .override-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--app-text-muted);
    cursor: pointer;
    white-space: nowrap;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
  }
</style>

export type NamingConvention = 'snake_case' | 'camelCase' | 'PascalCase' | 'UPPER_SNAKE_CASE';

export const NAMING_CONVENTIONS: NamingConvention[] = ['snake_case', 'camelCase', 'PascalCase', 'UPPER_SNAKE_CASE'];

/** Rule types that can be configured */
export type NamingRuleType =
  | 'tableCase'
  | 'columnCase'
  | 'tablePrefix'
  | 'tableSuffix'
  | 'columnPrefix'
  | 'columnSuffix'
  | 'dictionaryCheck';

export const NAMING_RULE_TYPES: NamingRuleType[] = [
  'tableCase', 'columnCase',
  'tablePrefix', 'tableSuffix',
  'columnPrefix', 'columnSuffix',
  'dictionaryCheck',
];

/** Individual rule entry at admin level */
export interface NamingRuleEntry {
  enabled: boolean;
  value: string; // case name, prefix/suffix string, or 'table'|'column'|'both' for dictionary
  allowOverride: boolean;
}

/** Admin-level global naming rules (stored in site_settings) */
export type SiteNamingRules = Partial<Record<NamingRuleType, NamingRuleEntry>>;

/** Project-level overrides (stored in ERDSchema.namingRules) — only value strings */
export type ProjectNamingOverrides = Partial<Record<NamingRuleType, string>>;

/** Effective rule after merging admin + project */
export interface EffectiveRule {
  value: string;
  source: 'admin' | 'project';
}

/** Effective naming rules for lint validation */
export type EffectiveNamingRules = Partial<Record<NamingRuleType, EffectiveRule>>;

/** Merge admin rules with project overrides */
export function computeEffectiveRules(
  admin: SiteNamingRules,
  project?: ProjectNamingOverrides,
): EffectiveNamingRules {
  const result: EffectiveNamingRules = {};
  for (const ruleType of NAMING_RULE_TYPES) {
    const entry = admin[ruleType];
    if (!entry?.enabled) continue;

    // Check for project override
    if (project?.[ruleType] !== undefined && entry.allowOverride) {
      result[ruleType] = { value: project[ruleType]!, source: 'project' };
    } else {
      result[ruleType] = { value: entry.value, source: 'admin' };
    }
  }
  return result;
}

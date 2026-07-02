export type NamingConvention = 'snake_case' | 'camelCase' | 'PascalCase' | 'Pascal_Snake_Case' | 'UPPER_SNAKE_CASE';

export const NAMING_CONVENTIONS: NamingConvention[] = ['snake_case', 'camelCase', 'PascalCase', 'Pascal_Snake_Case', 'UPPER_SNAKE_CASE'];

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

/** Project-level override entry. Legacy schemas may still store a raw string value. */
export interface ProjectNamingOverrideEntry {
  enabled?: boolean;
  value?: string;
}

export type ProjectNamingOverrideValue = string | ProjectNamingOverrideEntry;

/** Project-level overrides (stored in ERDSchema.namingRules) */
export type ProjectNamingOverrides = Partial<Record<NamingRuleType, ProjectNamingOverrideValue>>;

/** Effective rule after merging admin + project */
export interface EffectiveRule {
  value: string;
  source: 'admin' | 'project';
}

/** Effective naming rules for lint validation */
export type EffectiveNamingRules = Partial<Record<NamingRuleType, EffectiveRule>>;

export function normalizeProjectNamingOverride(
  override: ProjectNamingOverrideValue | undefined,
): ProjectNamingOverrideEntry | undefined {
  if (override === undefined) return undefined;
  if (typeof override === 'string') return { value: override };
  return override;
}

/** Merge admin rules with project overrides */
export function computeEffectiveRules(
  admin: SiteNamingRules,
  project?: ProjectNamingOverrides,
): EffectiveNamingRules {
  const result: EffectiveNamingRules = {};
  for (const ruleType of NAMING_RULE_TYPES) {
    const entry = admin[ruleType];
    if (!entry?.enabled) continue;

    const override = normalizeProjectNamingOverride(project?.[ruleType]);
    if (override && entry.allowOverride) {
      if (override.enabled === false) continue;
      result[ruleType] = { value: override.value ?? entry.value, source: 'project' };
    } else {
      result[ruleType] = { value: entry.value, source: 'admin' };
    }
  }
  return result;
}

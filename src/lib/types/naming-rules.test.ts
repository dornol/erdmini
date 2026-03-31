import { describe, it, expect } from 'vitest';
import { computeEffectiveRules, type SiteNamingRules, type ProjectNamingOverrides } from './naming-rules';

describe('computeEffectiveRules', () => {
  it('returns empty when no admin rules', () => {
    expect(computeEffectiveRules({})).toEqual({});
  });

  it('returns admin values for enabled rules', () => {
    const admin: SiteNamingRules = {
      tableCase: { enabled: true, value: 'snake_case', allowOverride: false },
      columnCase: { enabled: false, value: 'camelCase', allowOverride: false },
    };
    const result = computeEffectiveRules(admin);
    expect(result.tableCase).toEqual({ value: 'snake_case', source: 'admin' });
    expect(result.columnCase).toBeUndefined(); // disabled
  });

  it('uses project override when allowed', () => {
    const admin: SiteNamingRules = {
      tableCase: { enabled: true, value: 'snake_case', allowOverride: true },
    };
    const project: ProjectNamingOverrides = { tableCase: 'PascalCase' };
    const result = computeEffectiveRules(admin, project);
    expect(result.tableCase).toEqual({ value: 'PascalCase', source: 'project' });
  });

  it('ignores project override when not allowed', () => {
    const admin: SiteNamingRules = {
      tableCase: { enabled: true, value: 'snake_case', allowOverride: false },
    };
    const project: ProjectNamingOverrides = { tableCase: 'PascalCase' };
    const result = computeEffectiveRules(admin, project);
    expect(result.tableCase).toEqual({ value: 'snake_case', source: 'admin' });
  });

  it('handles prefix/suffix rules', () => {
    const admin: SiteNamingRules = {
      tablePrefix: { enabled: true, value: 'tbl_', allowOverride: true },
      columnSuffix: { enabled: true, value: '_id', allowOverride: false },
    };
    const project: ProjectNamingOverrides = { tablePrefix: 't_' };
    const result = computeEffectiveRules(admin, project);
    expect(result.tablePrefix).toEqual({ value: 't_', source: 'project' });
    expect(result.columnSuffix).toEqual({ value: '_id', source: 'admin' });
  });

  it('handles dictionary check', () => {
    const admin: SiteNamingRules = {
      dictionaryCheck: { enabled: true, value: 'both', allowOverride: true },
    };
    const project: ProjectNamingOverrides = { dictionaryCheck: 'table' };
    const result = computeEffectiveRules(admin, project);
    expect(result.dictionaryCheck).toEqual({ value: 'table', source: 'project' });
  });
});

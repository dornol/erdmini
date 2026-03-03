import { describe, it, expect, beforeEach } from 'vitest';
import { computeCoverageStats, computeImpact } from './domain-analysis';
import { makeColumn, makeDomain, makeSchema, makeTable, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

describe('computeCoverageStats', () => {
  it('returns 0 for empty schema', () => {
    const stats = computeCoverageStats(makeSchema([]));
    expect(stats.totalColumns).toBe(0);
    expect(stats.linkedColumns).toBe(0);
    expect(stats.coveragePercent).toBe(0);
    expect(stats.groupBreakdown).toHaveLength(0);
  });

  it('100% when all columns linked', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1' });
    const col2 = makeColumn({ name: 'b', domainId: 'd1' });
    const t1 = makeTable({ name: 'tbl', columns: [col1, col2] });
    const stats = computeCoverageStats(makeSchema([t1], [d1]));
    expect(stats.coveragePercent).toBe(100);
    expect(stats.linkedColumns).toBe(2);
  });

  it('mixed linked and unlinked', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1' });
    const col2 = makeColumn({ name: 'b' });
    const col3 = makeColumn({ name: 'c' });
    const t1 = makeTable({ name: 'tbl', columns: [col1, col2, col3] });
    const stats = computeCoverageStats(makeSchema([t1], [d1]));
    expect(stats.totalColumns).toBe(3);
    expect(stats.linkedColumns).toBe(1);
    expect(stats.coveragePercent).toBe(33);
  });

  it('computes group breakdown', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1' });
    const col2 = makeColumn({ name: 'b' });
    const t1 = makeTable({ name: 'users', columns: [col1], group: 'Auth' });
    const t2 = makeTable({ name: 'logs', columns: [col2], group: 'System' });
    const stats = computeCoverageStats(makeSchema([t1, t2], [d1]));

    expect(stats.groupBreakdown).toHaveLength(2);
    const auth = stats.groupBreakdown.find(g => g.group === 'Auth');
    expect(auth).toBeDefined();
    expect(auth!.percent).toBe(100);
    const system = stats.groupBreakdown.find(g => g.group === 'System');
    expect(system).toBeDefined();
    expect(system!.percent).toBe(0);
  });

  it('ungrouped tables appear in breakdown', () => {
    const col1 = makeColumn({ name: 'a' });
    const t1 = makeTable({ name: 'tbl', columns: [col1] });
    const stats = computeCoverageStats(makeSchema([t1]));
    expect(stats.groupBreakdown).toHaveLength(1);
    expect(stats.groupBreakdown[0].group).toBe('(ungrouped)');
  });
});

describe('computeImpact', () => {
  it('returns null when no propagation field changed', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col = makeColumn({ name: 'a', domainId: 'd1' });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [d1]);

    const result = computeImpact(schema, 'd1', { comment: 'new comment' });
    expect(result).toBeNull();
  });

  it('returns null when domain not found', () => {
    const result = computeImpact(makeSchema([]), 'nonexistent', { type: 'INT' });
    expect(result).toBeNull();
  });

  it('returns null when no columns linked', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col = makeColumn({ name: 'a' });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [d1]);

    const result = computeImpact(schema, 'd1', { type: 'INT' });
    expect(result).toBeNull();
  });

  it('detects type change impact', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col = makeColumn({ name: 'email', domainId: 'd1', type: 'VARCHAR' });
    const t = makeTable({ name: 'users', columns: [col] });
    const schema = makeSchema([t], [d1]);

    const result = computeImpact(schema, 'd1', { type: 'TEXT' });
    expect(result).not.toBeNull();
    expect(result!.columnCount).toBe(1);
    expect(result!.tableCount).toBe(1);
    expect(result!.entries[0].tableName).toBe('users');
    expect(result!.entries[0].columnName).toBe('email');
    expect(result!.entries[0].changes).toHaveLength(1);
    expect(result!.entries[0].changes[0].field).toBe('type');
    expect(result!.entries[0].changes[0].before).toBe('VARCHAR');
    expect(result!.entries[0].changes[0].after).toBe('TEXT');
  });

  it('detects multi-field changes', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR', nullable: true });
    const col = makeColumn({ name: 'a', domainId: 'd1', type: 'VARCHAR', nullable: true });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [d1]);

    const result = computeImpact(schema, 'd1', { type: 'INT', nullable: false });
    expect(result).not.toBeNull();
    expect(result!.entries[0].changes).toHaveLength(2);
  });

  it('counts across multiple tables', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1', type: 'VARCHAR' });
    const col2 = makeColumn({ name: 'b', domainId: 'd1', type: 'VARCHAR' });
    const t1 = makeTable({ name: 'tbl1', columns: [col1] });
    const t2 = makeTable({ name: 'tbl2', columns: [col2] });
    const schema = makeSchema([t1, t2], [d1]);

    const result = computeImpact(schema, 'd1', { type: 'TEXT' });
    expect(result).not.toBeNull();
    expect(result!.columnCount).toBe(2);
    expect(result!.tableCount).toBe(2);
  });

  it('ignores unchanged propagation fields', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR', nullable: true });
    const col = makeColumn({ name: 'a', domainId: 'd1', type: 'VARCHAR', nullable: true });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [d1]);

    // Same values - no change detected
    const result = computeImpact(schema, 'd1', { type: 'VARCHAR', nullable: true });
    expect(result).toBeNull();
  });
});

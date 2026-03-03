import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveEffectiveDomain,
  buildDomainTree,
  getDescendantIds,
  validateHierarchy,
  propagateWithHierarchy,
} from './domain-hierarchy';
import { makeColumn, makeDomain, makeSchema, makeTable, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

describe('resolveEffectiveDomain', () => {
  it('returns domain itself when no parent', () => {
    const d = makeDomain({ id: 'd1', name: 'email', type: 'VARCHAR', length: 255 });
    const result = resolveEffectiveDomain('d1', [d]);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('VARCHAR');
    expect(result!.length).toBe(255);
  });

  it('inherits optional fields from parent', () => {
    const parent = makeDomain({ id: 'p1', name: 'base', type: 'VARCHAR', length: 100, nullable: false });
    const child = makeDomain({ id: 'c1', name: 'email', type: 'VARCHAR', parentId: 'p1' });
    const result = resolveEffectiveDomain('c1', [parent, child]);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(100); // inherited from parent (optional field, child has undefined)
    expect(result!.nullable).toBe(true); // child's own value (required field, always present)
    expect(result!.name).toBe('email'); // child's own
  });

  it('child overrides parent', () => {
    const parent = makeDomain({ id: 'p1', name: 'base', type: 'VARCHAR', length: 100 });
    const child = makeDomain({ id: 'c1', name: 'short_text', type: 'VARCHAR', length: 50, parentId: 'p1' });
    const result = resolveEffectiveDomain('c1', [parent, child]);
    expect(result!.length).toBe(50); // overridden by child
  });

  it('resolves 3-level hierarchy', () => {
    const root = makeDomain({ id: 'r', name: 'root', type: 'VARCHAR', length: 255, nullable: false });
    const mid = makeDomain({ id: 'm', name: 'mid', type: 'VARCHAR', length: 100, parentId: 'r' });
    const leaf = makeDomain({ id: 'l', name: 'leaf', type: 'TEXT', parentId: 'm' });
    const result = resolveEffectiveDomain('l', [root, mid, leaf]);
    expect(result!.type).toBe('TEXT'); // leaf override
    expect(result!.length).toBe(100); // from mid (optional field)
    expect(result!.nullable).toBe(true); // leaf's own value (required field, default true from makeDomain)
  });

  it('handles circular reference gracefully', () => {
    const a = makeDomain({ id: 'a', name: 'A', type: 'INT', parentId: 'b' });
    const b = makeDomain({ id: 'b', name: 'B', type: 'VARCHAR', parentId: 'a' });
    const result = resolveEffectiveDomain('a', [a, b]);
    // Should not hang, returns some result
    expect(result).not.toBeNull();
  });

  it('returns null for nonexistent domain', () => {
    const result = resolveEffectiveDomain('nonexistent', []);
    expect(result).toBeNull();
  });
});

describe('buildDomainTree', () => {
  it('flat list produces flat tree', () => {
    const d1 = makeDomain({ id: 'd1', name: 'a' });
    const d2 = makeDomain({ id: 'd2', name: 'b' });
    const tree = buildDomainTree([d1, d2]);
    expect(tree).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children).toHaveLength(0);
  });

  it('parent-child relationship', () => {
    const parent = makeDomain({ id: 'p', name: 'parent' });
    const child = makeDomain({ id: 'c', name: 'child', parentId: 'p' });
    const tree = buildDomainTree([parent, child]);
    expect(tree).toHaveLength(1);
    expect(tree[0].domain.name).toBe('parent');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].domain.name).toBe('child');
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('multi-level tree', () => {
    const root = makeDomain({ id: 'r', name: 'root' });
    const mid = makeDomain({ id: 'm', name: 'mid', parentId: 'r' });
    const leaf = makeDomain({ id: 'l', name: 'leaf', parentId: 'm' });
    const tree = buildDomainTree([root, mid, leaf]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].domain.name).toBe('leaf');
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('orphan domains become roots', () => {
    const d1 = makeDomain({ id: 'd1', name: 'orphan', parentId: 'nonexistent' });
    const tree = buildDomainTree([d1]);
    expect(tree).toHaveLength(1);
    expect(tree[0].domain.name).toBe('orphan');
    expect(tree[0].depth).toBe(0);
  });

  it('effectiveDomain is populated', () => {
    const parent = makeDomain({ id: 'p', name: 'parent', type: 'VARCHAR', length: 100 });
    const child = makeDomain({ id: 'c', name: 'child', type: 'VARCHAR', parentId: 'p' });
    const tree = buildDomainTree([parent, child]);
    expect(tree[0].children[0].effectiveDomain.length).toBe(100);
  });
});

describe('getDescendantIds', () => {
  it('returns empty for leaf domain', () => {
    const d = makeDomain({ id: 'd1', name: 'leaf' });
    expect(getDescendantIds('d1', [d])).toEqual([]);
  });

  it('returns direct children', () => {
    const p = makeDomain({ id: 'p', name: 'parent' });
    const c1 = makeDomain({ id: 'c1', name: 'child1', parentId: 'p' });
    const c2 = makeDomain({ id: 'c2', name: 'child2', parentId: 'p' });
    const ids = getDescendantIds('p', [p, c1, c2]);
    expect(ids.sort()).toEqual(['c1', 'c2']);
  });

  it('returns recursive descendants', () => {
    const r = makeDomain({ id: 'r', name: 'root' });
    const m = makeDomain({ id: 'm', name: 'mid', parentId: 'r' });
    const l = makeDomain({ id: 'l', name: 'leaf', parentId: 'm' });
    const ids = getDescendantIds('r', [r, m, l]);
    expect(ids.sort()).toEqual(['l', 'm']);
  });

  it('returns empty for nonexistent domain', () => {
    expect(getDescendantIds('x', [])).toEqual([]);
  });
});

describe('validateHierarchy', () => {
  it('valid for no hierarchy', () => {
    const d1 = makeDomain({ id: 'd1', name: 'a' });
    const d2 = makeDomain({ id: 'd2', name: 'b' });
    const result = validateHierarchy([d1, d2]);
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.orphans).toHaveLength(0);
  });

  it('detects 2-node cycle', () => {
    const a = makeDomain({ id: 'a', name: 'A', parentId: 'b' });
    const b = makeDomain({ id: 'b', name: 'B', parentId: 'a' });
    const result = validateHierarchy([a, b]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects 3-node cycle', () => {
    const a = makeDomain({ id: 'a', name: 'A', parentId: 'c' });
    const b = makeDomain({ id: 'b', name: 'B', parentId: 'a' });
    const c = makeDomain({ id: 'c', name: 'C', parentId: 'b' });
    const result = validateHierarchy([a, b, c]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('detects orphans', () => {
    const d = makeDomain({ id: 'd1', name: 'orphan', parentId: 'nonexistent' });
    const result = validateHierarchy([d]);
    expect(result.valid).toBe(false);
    expect(result.orphans).toContain('d1');
  });
});

describe('propagateWithHierarchy', () => {
  it('propagates to directly linked columns', () => {
    const d = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col = makeColumn({ name: 'email', domainId: 'd1', type: 'VARCHAR' });
    const t = makeTable({ name: 'users', columns: [col] });
    const schema = makeSchema([t], [d]);

    const result = propagateWithHierarchy(schema, 'd1', { type: 'TEXT' });
    const updatedCol = result.tables[0].columns[0];
    expect(updatedCol.type).toBe('TEXT');
  });

  it('cascades to child domain columns', () => {
    const parent = makeDomain({ id: 'p', name: 'parent', type: 'VARCHAR', length: 100 });
    const child = makeDomain({ id: 'c', name: 'child', type: 'VARCHAR', parentId: 'p' });
    const col = makeColumn({ name: 'field', domainId: 'c', type: 'VARCHAR' });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [parent, child]);

    // Change parent's length → should cascade to child's linked column
    const result = propagateWithHierarchy(schema, 'p', { length: 200 });
    const updatedCol = result.tables[0].columns[0];
    expect(updatedCol.length).toBe(200);
  });

  it('preserves child overrides during cascade', () => {
    const parent = makeDomain({ id: 'p', name: 'parent', type: 'VARCHAR', length: 100, nullable: true });
    const child = makeDomain({ id: 'c', name: 'child', type: 'TEXT', nullable: false, parentId: 'p' });
    const col = makeColumn({ name: 'field', domainId: 'c', type: 'TEXT' });
    const t = makeTable({ name: 'tbl', columns: [col] });
    const schema = makeSchema([t], [parent, child]);

    // Change parent's nullable → child has its own nullable=false override
    const result = propagateWithHierarchy(schema, 'p', { nullable: true });
    const updatedCol = result.tables[0].columns[0];
    // child override should win
    expect(updatedCol.nullable).toBe(false);
    // child's own type should be kept
    expect(updatedCol.type).toBe('TEXT');
  });

  it('does not affect unrelated columns', () => {
    const d = makeDomain({ id: 'd1', name: 'dom', type: 'VARCHAR' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1', type: 'VARCHAR' });
    const col2 = makeColumn({ name: 'b', type: 'INT' });
    const t = makeTable({ name: 'tbl', columns: [col1, col2] });
    const schema = makeSchema([t], [d]);

    const result = propagateWithHierarchy(schema, 'd1', { type: 'TEXT' });
    expect(result.tables[0].columns[0].type).toBe('TEXT');
    expect(result.tables[0].columns[1].type).toBe('INT');
  });
});

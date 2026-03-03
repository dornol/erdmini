import type { ColumnDomain, ERDSchema } from '$lib/types/erd';
import { DOMAIN_FIELDS } from '$lib/types/erd';

const MAX_DEPTH = 10;

/**
 * Resolve the effective domain by walking the parent chain.
 * Child values override parent values (child wins).
 */
export function resolveEffectiveDomain(
  domainId: string,
  domains: ColumnDomain[],
): ColumnDomain | null {
  const byId = new Map(domains.map(d => [d.id, d]));
  const domain = byId.get(domainId);
  if (!domain) return null;

  // Walk parent chain collecting ancestors (child-first order)
  const chain: ColumnDomain[] = [domain];
  const visited = new Set<string>([domainId]);
  let current = domain;

  for (let i = 0; i < MAX_DEPTH; i++) {
    if (!current.parentId) break;
    if (visited.has(current.parentId)) break; // circular guard
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.push(parent);
    visited.add(current.parentId);
    current = parent;
  }

  // Merge: start from root (last in chain), override with children
  const result: ColumnDomain = { ...chain[chain.length - 1] };
  for (let i = chain.length - 2; i >= 0; i--) {
    const child = chain[i];
    // Override all fields that the child explicitly has
    result.id = child.id;
    result.name = child.name;
    if (child.group !== undefined) result.group = child.group;
    if (child.parentId !== undefined) result.parentId = child.parentId;
    if (child.comment !== undefined) result.comment = child.comment;
    if (child.description !== undefined) result.description = child.description;
    if (child.alias !== undefined) result.alias = child.alias;
    if (child.dataStandard !== undefined) result.dataStandard = child.dataStandard;
    if (child.example !== undefined) result.example = child.example;
    if (child.validRange !== undefined) result.validRange = child.validRange;
    if (child.owner !== undefined) result.owner = child.owner;
    if (child.tags !== undefined) result.tags = child.tags;

    // Propagation fields: child's explicit values override
    for (const field of DOMAIN_FIELDS) {
      if ((child as any)[field] !== undefined) {
        (result as any)[field] = (child as any)[field];
      }
    }
  }

  return result;
}

export interface DomainTreeNode {
  domain: ColumnDomain;
  effectiveDomain: ColumnDomain;
  children: DomainTreeNode[];
  depth: number;
}

/**
 * Build a tree structure from flat domain list.
 * Roots are domains with no parentId or orphans.
 */
export function buildDomainTree(domains: ColumnDomain[]): DomainTreeNode[] {
  const byId = new Map(domains.map(d => [d.id, d]));
  const childrenMap = new Map<string, ColumnDomain[]>();

  // Group children by parentId
  for (const d of domains) {
    if (d.parentId && byId.has(d.parentId)) {
      const list = childrenMap.get(d.parentId) ?? [];
      list.push(d);
      childrenMap.set(d.parentId, list);
    }
  }

  function buildNode(domain: ColumnDomain, depth: number): DomainTreeNode {
    const children = (childrenMap.get(domain.id) ?? []).map(c => buildNode(c, depth + 1));
    const effectiveDomain = resolveEffectiveDomain(domain.id, domains) ?? domain;
    return { domain, effectiveDomain, children, depth };
  }

  // Roots: domains with no parent or parent not in the domain list
  const roots = domains.filter(d => !d.parentId || !byId.has(d.parentId));
  return roots.map(r => buildNode(r, 0));
}

/**
 * Get all descendant IDs (recursive) of a given domain.
 */
export function getDescendantIds(domainId: string, domains: ColumnDomain[]): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const d of domains) {
    if (d.parentId) {
      const list = childrenMap.get(d.parentId) ?? [];
      list.push(d.id);
      childrenMap.set(d.parentId, list);
    }
  }

  const result: string[] = [];
  const stack = [...(childrenMap.get(domainId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const children = childrenMap.get(id);
    if (children) stack.push(...children);
  }
  return result;
}

export interface ValidationResult {
  valid: boolean;
  cycles: string[][];
  orphans: string[];
}

/**
 * Validate hierarchy for cycles and orphans.
 */
export function validateHierarchy(domains: ColumnDomain[]): ValidationResult {
  const byId = new Map(domains.map(d => [d.id, d]));
  const cycles: string[][] = [];
  const orphans: string[] = [];

  // Detect orphans: domains that reference a parent not in the list
  for (const d of domains) {
    if (d.parentId && !byId.has(d.parentId)) {
      orphans.push(d.id);
    }
  }

  // Detect cycles using DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const d of domains) color.set(d.id, WHITE);

  function dfs(id: string, path: string[]): void {
    color.set(id, GRAY);
    path.push(id);
    const d = byId.get(id);
    if (d?.parentId && byId.has(d.parentId)) {
      const c = color.get(d.parentId);
      if (c === GRAY) {
        // Found cycle
        const cycleStart = path.indexOf(d.parentId);
        cycles.push(path.slice(cycleStart));
      } else if (c === WHITE) {
        dfs(d.parentId, path);
      }
    }
    path.pop();
    color.set(id, BLACK);
  }

  for (const d of domains) {
    if (color.get(d.id) === WHITE) {
      dfs(d.id, []);
    }
  }

  return {
    valid: cycles.length === 0 && orphans.length === 0,
    cycles,
    orphans,
  };
}

/**
 * Propagate domain changes with hierarchy awareness.
 * Updates the domain, then cascades to child domains and their linked columns.
 */
export function propagateWithHierarchy(
  schema: ERDSchema,
  domainId: string,
  patch: Partial<Omit<ColumnDomain, 'id'>>,
): ERDSchema {
  // Update the domain itself
  let domains = schema.domains.map(d =>
    d.id === domainId ? { ...d, ...patch } : d
  );

  // Get all descendant IDs (children, grandchildren, etc.)
  const descendantIds = getDescendantIds(domainId, domains);
  const affectedIds = [domainId, ...descendantIds];

  // For each affected domain, resolve the effective values and propagate to linked columns
  const tables = schema.tables.map(t => ({
    ...t,
    columns: t.columns.map(c => {
      if (!c.domainId || !affectedIds.includes(c.domainId)) return c;
      const effective = resolveEffectiveDomain(c.domainId, domains);
      if (!effective) return c;
      const propagated: Record<string, unknown> = {};
      for (const field of DOMAIN_FIELDS) {
        propagated[field] = (effective as any)[field];
      }
      return { ...c, ...propagated };
    }),
  }));

  return {
    ...schema,
    domains,
    tables,
    updatedAt: new Date().toISOString(),
  };
}

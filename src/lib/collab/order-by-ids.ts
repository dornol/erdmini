/** Apply an accepted order without recreating deleted objects or dropping concurrent additions. */
export function orderByIds<T extends { id: string }>(items: T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item && !seen.has(id)) { ordered.push(item); seen.add(id); }
  }
  for (const item of items) if (!seen.has(item.id)) ordered.push(item);
  return ordered;
}

import type { ColumnDomain, ERDSchema } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';
import { propagateWithHierarchy } from '$lib/utils/domain-hierarchy';

export function addDomainOp(schema: ERDSchema, fields: Omit<ColumnDomain, 'id'>): ColumnDomain {
  const domain: ColumnDomain = { id: generateId(), ...fields };
  schema.domains = [...schema.domains, domain];
  schema.updatedAt = now();
  return domain;
}

export function updateDomainOp(schema: ERDSchema, id: string, patch: Partial<Omit<ColumnDomain, 'id'>>): void {
  const result = propagateWithHierarchy(schema, id, patch);
  schema.domains = result.domains;
  schema.tables = result.tables;
  schema.updatedAt = now();
}

export function deleteDomainOp(schema: ERDSchema, id: string): void {
  const deleted = schema.domains?.find((d) => d.id === id);
  const parentIdOfDeleted = deleted?.parentId;

  schema.domains = schema.domains
    .filter((d) => d.id !== id)
    .map((d) => d.parentId === id ? { ...d, parentId: parentIdOfDeleted } : d);

  for (const table of schema.tables) {
    table.columns = table.columns.map((c) =>
      c.domainId === id ? { ...c, domainId: undefined } : c
    );
  }

  if (parentIdOfDeleted) {
    const childIds = schema.domains
      .filter(d => d.parentId === parentIdOfDeleted)
      .map(d => d.id);
    for (const childId of childIds) {
      const result = propagateWithHierarchy(schema, childId, {});
      schema.tables = result.tables;
    }
  }

  schema.updatedAt = now();
}

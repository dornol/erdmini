import type { ColumnDomain, ERDSchema } from '$lib/types/erd';
import { DOMAIN_FIELDS } from '$lib/types/erd';

export interface GroupCoverage {
  group: string;
  totalColumns: number;
  linkedColumns: number;
  percent: number;
}

export interface CoverageStats {
  totalColumns: number;
  linkedColumns: number;
  coveragePercent: number;
  groupBreakdown: GroupCoverage[];
}

export interface ImpactEntry {
  tableName: string;
  columnName: string;
  columnId: string;
  changes: { field: string; before: unknown; after: unknown }[];
}

export interface ImpactResult {
  entries: ImpactEntry[];
  tableCount: number;
  columnCount: number;
}

export function computeCoverageStats(schema: ERDSchema): CoverageStats {
  let totalColumns = 0;
  let linkedColumns = 0;
  const groupStats = new Map<string, { total: number; linked: number }>();

  for (const table of schema.tables) {
    const group = table.group || '';
    for (const col of table.columns) {
      totalColumns++;
      let gs = groupStats.get(group);
      if (!gs) {
        gs = { total: 0, linked: 0 };
        groupStats.set(group, gs);
      }
      gs.total++;
      if (col.domainId) {
        linkedColumns++;
        gs.linked++;
      }
    }
  }

  const coveragePercent = totalColumns > 0 ? Math.round((linkedColumns / totalColumns) * 100) : 0;

  const groupBreakdown: GroupCoverage[] = [...groupStats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, gs]) => ({
      group: group || '(ungrouped)',
      totalColumns: gs.total,
      linkedColumns: gs.linked,
      percent: gs.total > 0 ? Math.round((gs.linked / gs.total) * 100) : 0,
    }));

  return { totalColumns, linkedColumns, coveragePercent, groupBreakdown };
}

export function computeImpact(
  schema: ERDSchema,
  domainId: string,
  patch: Partial<Omit<ColumnDomain, 'id'>>,
): ImpactResult | null {
  const domain = schema.domains.find(d => d.id === domainId);
  if (!domain) return null;

  // Check if any propagation field changed
  const changedFields: string[] = [];
  for (const field of DOMAIN_FIELDS) {
    if (field in patch) {
      const oldVal = (domain as any)[field];
      const newVal = (patch as any)[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields.push(field);
      }
    }
  }

  if (changedFields.length === 0) return null;

  const entries: ImpactEntry[] = [];
  const tableSet = new Set<string>();

  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.domainId !== domainId) continue;

      const changes: { field: string; before: unknown; after: unknown }[] = [];
      for (const field of changedFields) {
        changes.push({
          field,
          before: (col as any)[field],
          after: (patch as any)[field],
        });
      }

      entries.push({
        tableName: table.name,
        columnName: col.name,
        columnId: col.id,
        changes,
      });
      tableSet.add(table.id);
    }
  }

  if (entries.length === 0) return null;

  return {
    entries,
    tableCount: tableSet.size,
    columnCount: entries.length,
  };
}

import type { ForeignKey, Table } from '$lib/types/erd';

export type ImportDuplicateAction = 'overwrite' | 'skip' | null;

export interface MergeImportedTablesResult {
  tables: Table[];
  layoutTableIds: string[];
}

function clonePosition(position: Table['position']): Table['position'] {
  return { x: position.x, y: position.y };
}

function preserveTableViewMetadata(imported: Table, existing: Table): Table {
  return {
    ...imported,
    id: existing.id,
    position: clonePosition(existing.position),
    color: existing.color,
    group: existing.group,
    locked: existing.locked,
  };
}

function buildColumnIdMapByName(from: Table, to: Table): Map<string, string> {
  const toByName = new Map(to.columns.map((col) => [col.name, col.id]));
  const result = new Map<string, string>();
  for (const col of from.columns) {
    const nextId = toByName.get(col.name);
    if (nextId) result.set(col.id, nextId);
  }
  return result;
}

function remapForeignKeys(
  foreignKeys: ForeignKey[],
  tableIdMap: Map<string, string>,
  refColumnIdMaps: Map<string, Map<string, string>>,
): ForeignKey[] {
  return foreignKeys.map((fk) => {
    const referencedTableId = tableIdMap.get(fk.referencedTableId) ?? fk.referencedTableId;
    const colMap = refColumnIdMaps.get(referencedTableId);
    return {
      ...fk,
      referencedTableId,
      referencedColumnIds: colMap
        ? fk.referencedColumnIds.map((id) => colMap.get(id) ?? id)
        : fk.referencedColumnIds,
    };
  });
}

/**
 * Merge imported tables into an existing canvas while preserving canvas-only
 * metadata for overwritten tables. Table structure comes from the import;
 * position, color, group, lock state, and table id stay from the existing table.
 */
export function mergeImportedTables(
  existingTables: Table[],
  importedTables: Table[],
  duplicateNames: string[],
  action: ImportDuplicateAction,
): MergeImportedTablesResult {
  const duplicateSet = new Set(duplicateNames);
  const existingByName = new Map(existingTables.map((table) => [table.name, table]));
  const importedByName = new Map(importedTables.map((table) => [table.name, table]));
  const tableIdMap = new Map<string, string>();
  const refColumnIdMaps = new Map<string, Map<string, string>>();
  const layoutTableIds: string[] = [];

  for (const table of importedTables) {
    tableIdMap.set(table.id, table.id);
  }

  if (action === 'overwrite') {
    for (const name of duplicateNames) {
      const existing = existingByName.get(name);
      const imported = importedByName.get(name);
      if (!existing || !imported) continue;
      tableIdMap.set(imported.id, existing.id);
      refColumnIdMaps.set(existing.id, buildColumnIdMapByName(existing, imported));
    }

    const tables = existingTables.map((existing) => {
      if (!duplicateSet.has(existing.name)) {
        return {
          ...existing,
          foreignKeys: remapForeignKeys(existing.foreignKeys, tableIdMap, refColumnIdMaps),
        };
      }
      const imported = importedByName.get(existing.name);
      if (!imported) return existing;
      const merged = preserveTableViewMetadata(imported, existing);
      return {
        ...merged,
        foreignKeys: remapForeignKeys(merged.foreignKeys, tableIdMap, refColumnIdMaps),
      };
    });

    for (const imported of importedTables) {
      if (duplicateSet.has(imported.name)) continue;
      layoutTableIds.push(imported.id);
      tables.push({
        ...imported,
        foreignKeys: remapForeignKeys(imported.foreignKeys, tableIdMap, refColumnIdMaps),
      });
    }

    return { tables, layoutTableIds };
  }

  if (action === 'skip') {
    for (const name of duplicateNames) {
      const existing = existingByName.get(name);
      const imported = importedByName.get(name);
      if (!existing || !imported) continue;
      tableIdMap.set(imported.id, existing.id);
      refColumnIdMaps.set(existing.id, buildColumnIdMapByName(imported, existing));
    }

    const tables = [...existingTables];
    for (const imported of importedTables) {
      if (duplicateSet.has(imported.name)) continue;
      layoutTableIds.push(imported.id);
      tables.push({
        ...imported,
        foreignKeys: remapForeignKeys(imported.foreignKeys, tableIdMap, refColumnIdMaps),
      });
    }
    return { tables, layoutTableIds };
  }

  return {
    tables: [
      ...existingTables,
      ...importedTables.map((table) => ({
        ...table,
        foreignKeys: remapForeignKeys(table.foreignKeys, tableIdMap, refColumnIdMaps),
      })),
    ],
    layoutTableIds: importedTables.map((table) => table.id),
  };
}

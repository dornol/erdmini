import type { ForeignKey, Table, TableIndex, UniqueKey } from '$lib/types/erd';

export type ImportDuplicateAction = 'overwrite' | 'skip' | null;

export interface MergeImportedTablesResult {
  tables: Table[];
  layoutTableIds: string[];
}

function clonePosition(position: Table['position']): Table['position'] {
  return { x: position.x, y: position.y };
}

function buildColumnIdMapToFinal(imported: Table, existing: Table): Map<string, string> {
  const existingByName = new Map(existing.columns.map((col) => [col.name, col.id]));
  const result = new Map<string, string>();

  for (const col of imported.columns) {
    result.set(col.id, existingByName.get(col.name) ?? col.id);
  }
  for (const col of existing.columns) {
    result.set(col.id, col.id);
  }

  return result;
}

function preserveTableViewMetadata(imported: Table, existing: Table, columnIdMap: Map<string, string>): Table {
  return {
    ...imported,
    id: existing.id,
    columns: imported.columns.map((col) => ({
      ...col,
      id: columnIdMap.get(col.id) ?? col.id,
    })),
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
  sourceColumnIdMap: Map<string, string> | undefined,
  tableIdMap: Map<string, string>,
  refColumnIdMaps: Map<string, Map<string, string>>,
): ForeignKey[] {
  return foreignKeys.map((fk) => {
    const referencedTableId = tableIdMap.get(fk.referencedTableId) ?? fk.referencedTableId;
    const colMap = refColumnIdMaps.get(referencedTableId);
    return {
      ...fk,
      columnIds: sourceColumnIdMap
        ? fk.columnIds.map((id) => sourceColumnIdMap.get(id) ?? id)
        : fk.columnIds,
      referencedTableId,
      referencedColumnIds: colMap
        ? fk.referencedColumnIds.map((id) => colMap.get(id) ?? id)
        : fk.referencedColumnIds,
    };
  });
}

function remapUniqueKeys(uniqueKeys: UniqueKey[], columnIdMap: Map<string, string> | undefined): UniqueKey[] {
  if (!columnIdMap) return uniqueKeys;
  return uniqueKeys.map((uk) => ({
    ...uk,
    columnIds: uk.columnIds.map((id) => columnIdMap.get(id) ?? id),
  }));
}

function remapIndexes(indexes: TableIndex[], columnIdMap: Map<string, string> | undefined): TableIndex[] {
  if (!columnIdMap) return indexes;
  return indexes.map((idx) => ({
    ...idx,
    columnIds: idx.columnIds.map((id) => columnIdMap.get(id) ?? id),
  }));
}

function sortedKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

function uniqueKeySignature(uk: UniqueKey): string {
  return `${uk.name ?? ''}|${sortedKey(uk.columnIds)}`;
}

function indexSignature(idx: TableIndex): string {
  return `${idx.name ?? ''}|${idx.unique ? 'unique' : 'index'}|${sortedKey(idx.columnIds)}`;
}

function foreignKeySignature(fk: ForeignKey): string {
  return [
    fk.columnIds.join(','),
    fk.referencedTableId,
    fk.referencedColumnIds.join(','),
    fk.onDelete,
    fk.onUpdate,
  ].join('|');
}

function reuseConstraintIds(imported: Table, existing: Table): Table {
  const existingUqBySig = new Map((existing.uniqueKeys ?? []).map((uk) => [uniqueKeySignature(uk), uk.id]));
  const existingIdxBySig = new Map((existing.indexes ?? []).map((idx) => [indexSignature(idx), idx.id]));
  const existingFkBySig = new Map(existing.foreignKeys.map((fk) => [foreignKeySignature(fk), fk.id]));

  return {
    ...imported,
    uniqueKeys: (imported.uniqueKeys ?? []).map((uk) => ({
      ...uk,
      id: existingUqBySig.get(uniqueKeySignature(uk)) ?? uk.id,
    })),
    indexes: (imported.indexes ?? []).map((idx) => ({
      ...idx,
      id: existingIdxBySig.get(indexSignature(idx)) ?? idx.id,
    })),
    foreignKeys: imported.foreignKeys.map((fk) => ({
      ...fk,
      id: existingFkBySig.get(foreignKeySignature(fk)) ?? fk.id,
    })),
  };
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
  const sourceColumnIdMaps = new Map<string, Map<string, string>>();
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
      const columnIdMap = buildColumnIdMapToFinal(imported, existing);
      tableIdMap.set(imported.id, existing.id);
      sourceColumnIdMaps.set(existing.id, columnIdMap);
      refColumnIdMaps.set(existing.id, columnIdMap);
    }

    const tables = existingTables.map((existing) => {
      if (!duplicateSet.has(existing.name)) {
        return {
          ...existing,
          foreignKeys: remapForeignKeys(existing.foreignKeys, undefined, tableIdMap, refColumnIdMaps),
        };
      }
      const imported = importedByName.get(existing.name);
      if (!imported) return existing;
      const sourceColumnIdMap = sourceColumnIdMaps.get(existing.id);
      const merged = preserveTableViewMetadata(imported, existing, sourceColumnIdMap ?? new Map());
      const remapped = {
        ...merged,
        foreignKeys: remapForeignKeys(merged.foreignKeys, sourceColumnIdMap, tableIdMap, refColumnIdMaps),
        uniqueKeys: remapUniqueKeys(merged.uniqueKeys ?? [], sourceColumnIdMap),
        indexes: remapIndexes(merged.indexes ?? [], sourceColumnIdMap),
      };
      return reuseConstraintIds(remapped, existing);
    });

    for (const imported of importedTables) {
      if (duplicateSet.has(imported.name)) continue;
      layoutTableIds.push(imported.id);
      tables.push({
        ...imported,
        foreignKeys: remapForeignKeys(imported.foreignKeys, undefined, tableIdMap, refColumnIdMaps),
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
        foreignKeys: remapForeignKeys(imported.foreignKeys, undefined, tableIdMap, refColumnIdMaps),
      });
    }
    return { tables, layoutTableIds };
  }

  return {
    tables: [
      ...existingTables,
      ...importedTables.map((table) => ({
        ...table,
        foreignKeys: remapForeignKeys(table.foreignKeys, undefined, tableIdMap, refColumnIdMaps),
      })),
    ],
    layoutTableIds: importedTables.map((table) => table.id),
  };
}

import type { Table } from '$lib/types/erd';

/** Keep existing tables and reconnect imported FKs to retained identities. */
export function mergeImportTables(existing: Table[], imported: Table[]): Table[] {
  const retained = new Map(existing.map(table => [table.name.toLowerCase(), table]));
  const targets = new Map<string, Table>();
  for (const table of imported) targets.set(table.id, retained.get(table.name.toLowerCase()) ?? table);
  const additions = imported.filter(table => !retained.has(table.name.toLowerCase()));
  const merged = additions.map(table => ({
    ...table,
    foreignKeys: table.foreignKeys.map(fk => {
      const importedTarget = imported.find(target => target.id === fk.referencedTableId);
      const target = targets.get(fk.referencedTableId) ?? existing.find(target => target.id === fk.referencedTableId);
      if (!target) throw new Error(`Cannot merge foreign key: target table not found for ${table.name}`);
      const referencedColumnIds = fk.referencedColumnIds.map(id => {
        if (target.id === fk.referencedTableId) {
          if (!target.columns.some(column => column.id === id)) throw new Error(`Cannot merge foreign key: target column not found in ${target.name}`);
          return id;
        }
        const column = importedTarget?.columns.find(column => column.id === id);
        const retainedColumn = column && target.columns.find(candidate => candidate.name.toLowerCase() === column.name.toLowerCase());
        if (!retainedColumn) throw new Error(`Cannot merge foreign key: target column ${column?.name ?? id} not found in retained table ${target.name}`);
        return retainedColumn.id;
      });
      return { ...fk, referencedTableId: target.id, referencedColumnIds };
    }),
  }));
  return [...existing, ...merged];
}

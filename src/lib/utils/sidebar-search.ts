import type { Table, ERDSchema } from '$lib/types/erd';
import { getEffectiveColor } from '$lib/utils/table-color';

export function tableHasAttr(t: Table, attr: string): boolean {
  switch (attr) {
    case 'pk': return t.columns.some(c => c.primaryKey);
    case 'fk': return t.foreignKeys.length > 0;
    case 'index': case 'idx': return (t.indexes?.length ?? 0) > 0;
    case 'comment': return !!(t.comment) || t.columns.some(c => !!c.comment);
    case 'domain': return t.columns.some(c => !!c.domainId);
    case 'unique': case 'uq': return t.columns.some(c => c.unique) || (t.uniqueKeys?.length ?? 0) > 0;
    case 'auto': case 'ai': return t.columns.some(c => c.autoIncrement);
    case 'default': return t.columns.some(c => c.defaultValue !== undefined && c.defaultValue !== '');
    case 'color': return !!t.color;
    case 'enum': return t.columns.some(c => c.type === 'ENUM' || (c.enumValues && c.enumValues.length > 0));
    case 'locked': return !!t.locked;
    default: return false;
  }
}

export function filterTables(
  tables: Table[],
  allTables: Table[],
  schema: ERDSchema,
  query: string,
  activeSchema: string,
  sortBy: 'creation' | 'name',
): Table[] {
  // Schema filter
  if (activeSchema !== '(all)') {
    tables = tables.filter((t) => (t.schema ?? '') === activeSchema);
  }

  if (query.trim()) {
    const raw = query.trim();
    const lower = raw.toLowerCase();

    if (lower.startsWith('fk:')) {
      const fkQ = lower.slice(3).trim();
      tables = tables.filter((t) =>
        t.foreignKeys.some((fk) => {
          const refTable = allTables.find((rt) => rt.id === fk.referencedTableId);
          return refTable && refTable.name.toLowerCase().includes(fkQ);
        })
      );
    } else if (lower.startsWith('group:')) {
      const groupQ = lower.slice(6).trim();
      tables = tables.filter((t) => (t.group || '').toLowerCase().includes(groupQ));
    } else if (lower.startsWith('locked:')) {
      tables = tables.filter((t) => t.locked);
    } else if (lower.startsWith('type:')) {
      const typeQ = lower.slice(5).trim();
      tables = tables.filter(t => t.columns.some(c => c.type.toLowerCase().includes(typeQ)));
    } else if (lower.startsWith('has:')) {
      const attr = lower.slice(4).trim();
      tables = tables.filter(t => tableHasAttr(t, attr));
    } else if (lower.startsWith('no:')) {
      const attr = lower.slice(3).trim();
      tables = tables.filter(t => !tableHasAttr(t, attr));
    } else if (lower.startsWith('color:')) {
      const colorQ = lower.slice(6).trim();
      tables = tables.filter(t => {
        const eff = getEffectiveColor(t, schema);
        return eff && eff.toLowerCase().includes(colorQ);
      });
    } else {
      tables = tables.filter((t) =>
        t.name.toLowerCase().includes(lower) ||
        t.columns.some((c) => c.name.toLowerCase().includes(lower) || (c.comment && c.comment.toLowerCase().includes(lower))) ||
        (t.comment && t.comment.toLowerCase().includes(lower)) ||
        t.foreignKeys.some((fk) => {
          const refTable = allTables.find((rt) => rt.id === fk.referencedTableId);
          return refTable && refTable.name.toLowerCase().includes(lower);
        }) ||
        (t.group && t.group.toLowerCase().includes(lower))
      );
    }
  }

  if (sortBy === 'name') {
    tables = [...tables].sort((a, b) => a.name.localeCompare(b.name));
  }

  return tables;
}

export function getTableMeta(table: Table, allTables: Table[]) {
  const colCount = table.columns.length;
  const fkCount = table.foreignKeys.length;
  const pkCols = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
  const fkDetails = table.foreignKeys.map(fk => {
    const srcCols = fk.columnIds.map(id => table.columns.find(c => c.id === id)?.name ?? '?');
    const refTable = allTables.find(t => t.id === fk.referencedTableId);
    const refCols = fk.referencedColumnIds.map(id => refTable?.columns.find(c => c.id === id)?.name ?? '?');
    const srcLabel = srcCols.length === 1 ? srcCols[0] : `(${srcCols.join(', ')})`;
    const refLabel = refCols.length === 1 ? refCols[0] : `(${refCols.join(', ')})`;
    return `${srcLabel} → ${refTable?.name ?? '?'}.${refLabel}`;
  });
  const refs = allTables.flatMap(t =>
    t.foreignKeys
      .filter(fk => fk.referencedTableId === table.id)
      .map(fk => {
        const srcCols = fk.columnIds.map(id => t.columns.find(c => c.id === id)?.name ?? '?');
        const refCols = fk.referencedColumnIds.map(id => table.columns.find(c => c.id === id)?.name ?? '?');
        const srcLabel = srcCols.length === 1 ? srcCols[0] : `(${srcCols.join(', ')})`;
        const refLabel = refCols.length === 1 ? refCols[0] : `(${refCols.join(', ')})`;
        return `${t.name}.${srcLabel} → ${refLabel}`;
      })
  );
  return { colCount, fkCount, fkDetails, pkCols, refCount: refs.length, refDetails: refs };
}

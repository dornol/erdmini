import type { Column, ERDSchema, ForeignKey, Table, TableIndex } from '$lib/types/erd';

export interface ColumnDiff {
  columnName: string;
  prev?: Column;
  curr?: Column;
  changes: string[];
}

export interface TableDiff {
  tableId: string;
  tableName: string;
  prevName?: string;
  addedColumns: Column[];
  removedColumns: Column[];
  modifiedColumns: ColumnDiff[];
  addedFKs: ForeignKey[];
  removedFKs: ForeignKey[];
  addedIndexes: TableIndex[];
  removedIndexes: TableIndex[];
  propertyChanges: string[];
}

export interface SchemaDiff {
  addedTables: Table[];
  removedTables: Table[];
  modifiedTables: TableDiff[];
  summary: { added: number; removed: number; modified: number };
}

function diffColumn(prev: Column, curr: Column): string[] {
  const changes: string[] = [];
  if (prev.type !== curr.type) changes.push(`type: ${prev.type} → ${curr.type}`);
  if ((prev.length ?? '') !== (curr.length ?? '')) changes.push(`length: ${prev.length ?? '-'} → ${curr.length ?? '-'}`);
  if ((prev.scale ?? null) !== (curr.scale ?? null)) changes.push(`scale: ${prev.scale ?? '-'} → ${curr.scale ?? '-'}`);
  if (prev.nullable !== curr.nullable) changes.push(`nullable: ${prev.nullable} → ${curr.nullable}`);
  if (prev.primaryKey !== curr.primaryKey) changes.push(`primaryKey: ${prev.primaryKey} → ${curr.primaryKey}`);
  if (prev.unique !== curr.unique) changes.push(`unique: ${prev.unique} → ${curr.unique}`);
  if (prev.autoIncrement !== curr.autoIncrement) changes.push(`autoIncrement: ${prev.autoIncrement} → ${curr.autoIncrement}`);
  if ((prev.defaultValue ?? '') !== (curr.defaultValue ?? '')) changes.push(`default: ${prev.defaultValue ?? '-'} → ${curr.defaultValue ?? '-'}`);
  if ((prev.comment ?? '') !== (curr.comment ?? '')) changes.push(`comment changed`);
  if ((prev.check ?? '') !== (curr.check ?? '')) changes.push(`check: ${prev.check ?? '-'} → ${curr.check ?? '-'}`);
  if (prev.name !== curr.name) changes.push(`name: ${prev.name} → ${curr.name}`);
  return changes;
}

function diffTable(prevTable: Table, currTable: Table, prevTables: Table[], currTables: Table[]): TableDiff | null {
  const diff: TableDiff = {
    tableId: currTable.id,
    tableName: currTable.name,
    addedColumns: [],
    removedColumns: [],
    modifiedColumns: [],
    addedFKs: [],
    removedFKs: [],
    addedIndexes: [],
    removedIndexes: [],
    propertyChanges: [],
  };

  // Table name change
  if (prevTable.name !== currTable.name) {
    diff.prevName = prevTable.name;
    diff.propertyChanges.push(`name: ${prevTable.name} → ${currTable.name}`);
  }

  // Comment change
  if ((prevTable.comment ?? '') !== (currTable.comment ?? '')) {
    diff.propertyChanges.push('comment changed');
  }

  // Column diffs — match by ID, fallback to name
  const prevColMap = new Map<string, Column>();
  const prevColByName = new Map<string, Column>();
  for (const c of prevTable.columns) {
    prevColMap.set(c.id, c);
    prevColByName.set(c.name, c);
  }

  const currColMap = new Map<string, Column>();
  const currColByName = new Map<string, Column>();
  for (const c of currTable.columns) {
    currColMap.set(c.id, c);
    currColByName.set(c.name, c);
  }

  const matchedPrevIds = new Set<string>();

  for (const cc of currTable.columns) {
    let pc = prevColMap.get(cc.id);
    if (!pc) pc = prevColByName.get(cc.name);
    if (pc) {
      matchedPrevIds.add(pc.id);
      const changes = diffColumn(pc, cc);
      if (changes.length > 0) {
        diff.modifiedColumns.push({ columnName: cc.name, prev: pc, curr: cc, changes });
      }
    } else {
      diff.addedColumns.push(cc);
    }
  }

  for (const pc of prevTable.columns) {
    if (!matchedPrevIds.has(pc.id) && !currColByName.has(pc.name)) {
      diff.removedColumns.push(pc);
    }
  }

  // FK diffs
  const prevFkIds = new Set(prevTable.foreignKeys.map((f) => f.id));
  const currFkIds = new Set(currTable.foreignKeys.map((f) => f.id));

  for (const fk of currTable.foreignKeys) {
    if (!prevFkIds.has(fk.id)) diff.addedFKs.push(fk);
  }
  for (const fk of prevTable.foreignKeys) {
    if (!currFkIds.has(fk.id)) diff.removedFKs.push(fk);
  }

  // Index diffs
  const prevIdxIds = new Set((prevTable.indexes ?? []).map((i) => i.id));
  const currIdxIds = new Set((currTable.indexes ?? []).map((i) => i.id));

  for (const idx of currTable.indexes ?? []) {
    if (!prevIdxIds.has(idx.id)) diff.addedIndexes.push(idx);
  }
  for (const idx of prevTable.indexes ?? []) {
    if (!currIdxIds.has(idx.id)) diff.removedIndexes.push(idx);
  }

  const hasChanges =
    diff.addedColumns.length > 0 ||
    diff.removedColumns.length > 0 ||
    diff.modifiedColumns.length > 0 ||
    diff.addedFKs.length > 0 ||
    diff.removedFKs.length > 0 ||
    diff.addedIndexes.length > 0 ||
    diff.removedIndexes.length > 0 ||
    diff.propertyChanges.length > 0;

  return hasChanges ? diff : null;
}

export function diffSchemas(prev: ERDSchema, curr: ERDSchema): SchemaDiff {
  const result: SchemaDiff = {
    addedTables: [],
    removedTables: [],
    modifiedTables: [],
    summary: { added: 0, removed: 0, modified: 0 },
  };

  // Build maps by ID, then name fallback
  const prevById = new Map<string, Table>();
  const prevByName = new Map<string, Table>();
  for (const t of prev.tables) {
    prevById.set(t.id, t);
    prevByName.set(t.name, t);
  }

  const currById = new Map<string, Table>();
  const currByName = new Map<string, Table>();
  for (const t of curr.tables) {
    currById.set(t.id, t);
    currByName.set(t.name, t);
  }

  const matchedPrevIds = new Set<string>();

  for (const ct of curr.tables) {
    let pt = prevById.get(ct.id);
    if (!pt) pt = prevByName.get(ct.name);
    if (pt) {
      matchedPrevIds.add(pt.id);
      const td = diffTable(pt, ct, prev.tables, curr.tables);
      if (td) result.modifiedTables.push(td);
    } else {
      result.addedTables.push(ct);
    }
  }

  for (const pt of prev.tables) {
    if (!matchedPrevIds.has(pt.id) && !currByName.has(pt.name)) {
      result.removedTables.push(pt);
    }
  }

  result.summary = {
    added: result.addedTables.length,
    removed: result.removedTables.length,
    modified: result.modifiedTables.length,
  };

  return result;
}

import type { Column, ColumnDomain, ERDSchema, ForeignKey, Memo, Table, TableIndex, UniqueKey } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';
import { TABLE_W } from '$lib/constants/layout';
import { propagateWithHierarchy, getDescendantIds } from '$lib/utils/domain-hierarchy';

function getNextTableName(tables: Table[]): string {
  let i = 1;
  while (tables.some((t) => t.name === `table_${i}`)) i++;
  return `table_${i}`;
}

export function defaultSchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    groupColors: {},
    createdAt: now(),
    updatedAt: now(),
  };
}

function migrateFK(schema: ERDSchema) {
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = fk as any;
      if (raw.columnId && !fk.columnIds) {
        fk.columnIds = [raw.columnId];
        fk.referencedColumnIds = [raw.referencedColumnId];
        delete raw.columnId;
        delete raw.referencedColumnId;
      }
    }
  }
}

export type HistoryEntry = { snap: string; label: string; detail: string; time: number };

const MAX_HISTORY = 50;

class ERDStore {
  schema = $state<ERDSchema>(defaultSchema());
  selectedTableId = $state<string | null>(null);
  selectedTableIds = $state<Set<string>>(new Set());
  selectedMemoId = $state<string | null>(null);
  selectedMemoIds = $state<Set<string>>(new Set());
  editingMemoId = $state<string | null>(null);
  editingColumnInfo = $state<{ tableId: string; columnId: string; anchorX: number; anchorY: number } | null>(null);
  hoveredColumnInfo = $state<{ tableId: string; columnId: string } | null>(null);
  hoveredFkInfo = $state<{ sourceTableId: string; sourceColumnIds: string[]; refTableId: string; refColumnIds: string[] }[]>([]);
  hoveredUkInfo = $state<{ tableId: string; columnIds: string[] } | null>(null);
  hoveredIdxInfo = $state<{ tableId: string; columnIds: string[] } | null>(null);
  storageFull = $state(false);

  // Undo/Redo
  private _undoStack: HistoryEntry[] = [];
  private _redoStack: HistoryEntry[] = [];
  _undoVersion = $state(0);
  _isUndoRedoing = false;
  _isRemoteOp = false;
  _lastOperation = $state<import('$lib/types/collab').CollabOperation | null>(null);
  _opVersion = $state(0);

  get canUndo(): boolean { void this._undoVersion; return this._undoStack.length > 0; }
  get canRedo(): boolean { void this._undoVersion; return this._redoStack.length > 0; }

  get historyEntries(): HistoryEntry[] {
    // Access version to make this reactive
    void this._undoVersion;
    return [...this._undoStack];
  }

  get redoEntries(): HistoryEntry[] {
    void this._undoVersion;
    return [...this._redoStack];
  }

  pushSnapshotRaw(snap: string, label: string, detail: string = '') {
    // Avoid duplicate snapshots
    if (this._undoStack.length > 0 && this._undoStack[this._undoStack.length - 1].snap === snap) return;
    this._undoStack.push({ snap, label, detail, time: Date.now() });
    if (this._undoStack.length > MAX_HISTORY) this._undoStack.shift();
    this._redoStack = [];
    this._undoVersion++;
  }

  undo() {
    if (this._undoStack.length === 0) return;
    const current = JSON.stringify($state.snapshot(this.schema));
    const prev = this._undoStack.pop()!;
    this._redoStack.push({ snap: current, label: prev.label, detail: prev.detail, time: Date.now() });
    this._isUndoRedoing = true;
    this.schema = JSON.parse(prev.snap);
    this._undoVersion++;
    this._emitOp({ kind: 'load-schema', schema: this.schema });
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const current = JSON.stringify($state.snapshot(this.schema));
    const next = this._redoStack.pop()!;
    this._undoStack.push({ snap: current, label: next.label, detail: next.detail, time: Date.now() });
    this._isUndoRedoing = true;
    this.schema = JSON.parse(next.snap);
    this._undoVersion++;
    this._emitOp({ kind: 'load-schema', schema: this.schema });
  }

  jumpToHistory(index: number) {
    if (index < 0 || index >= this._undoStack.length) return;
    const current = JSON.stringify($state.snapshot(this.schema));
    // Push items from index+1..end and current state onto redo stack
    for (let i = this._undoStack.length - 1; i > index; i--) {
      this._redoStack.push(this._undoStack[i]);
    }
    const target = this._undoStack[index];
    this._redoStack.push({ snap: current, label: target.label, detail: target.detail, time: Date.now() });
    // Restore the target snapshot
    this._undoStack = this._undoStack.slice(0, index);
    this._isUndoRedoing = true;
    this.schema = JSON.parse(target.snap);
    this._undoVersion++;
  }

  private _emitOp(op: import('$lib/types/collab').CollabOperation) {
    if (!this._isRemoteOp) {
      this._lastOperation = op;
      this._opVersion++;
    }
  }

  get selectedTable(): Table | undefined {
    return this.schema.tables.find((t) => t.id === this.selectedTableId);
  }

  get selectedMemo(): Memo | undefined {
    return this.schema.memos.find((m) => m.id === this.selectedMemoId);
  }

  clearHistory() {
    this._undoStack = [];
    this._redoStack = [];
    this._undoVersion++;
  }

  addTable(viewportWidth = 800, viewportHeight = 600) {
    const { x, y, scale } = canvasState;
    const worldX = (viewportWidth / 2 - x) / scale;
    const worldY = (viewportHeight / 2 - y) / scale;

    const id = generateId();
    const name = getNextTableName(this.schema.tables);
    const newTable: Table = {
      id,
      name,
      columns: [
        {
          id: generateId(),
          name: 'id',
          type: 'INT',
          nullable: false,
          primaryKey: true,
          unique: true,
          autoIncrement: true,
        },
      ],
      foreignKeys: [],
      uniqueKeys: [],
      indexes: [],
      position: { x: worldX - 100, y: worldY - 60 },
    };
    this.schema.tables = [...this.schema.tables, newTable];
    this.schema.updatedAt = now();
    this.selectedTableId = id;
    this._emitOp({ kind: 'add-table', table: newTable });
  }

  deleteTable(id: string) {
    // Also remove FK references to this table from other tables
    this.schema.tables = this.schema.tables
      .filter((t) => t.id !== id)
      .map((t) => ({
        ...t,
        foreignKeys: t.foreignKeys.filter((fk) => fk.referencedTableId !== id),
      }));
    this.schema.updatedAt = now();
    if (this.selectedTableId === id) {
      this.selectedTableId = null;
    }
    this._emitOp({ kind: 'delete-table', tableId: id });
  }

  deleteTables(ids: string[]) {
    const idSet = new Set(ids);
    this.schema.tables = this.schema.tables
      .filter((t) => !idSet.has(t.id))
      .map((t) => ({
        ...t,
        foreignKeys: t.foreignKeys.filter((fk) => !idSet.has(fk.referencedTableId)),
      }));
    this.schema.updatedAt = now();
    if (this.selectedTableId && idSet.has(this.selectedTableId)) this.selectedTableId = null;
    this.selectedTableIds = new Set();
    this._emitOp({ kind: 'delete-tables', tableIds: ids });
  }

  updateTableName(id: string, name: string) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.name = name;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-name', tableId: id, name });
  }

  updateTableComment(id: string, comment: string) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.comment = comment || undefined;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-comment', tableId: id, comment });
  }

  updateTableColor(id: string, color: string | undefined) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.color = color;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-color', tableId: id, color });
  }

  updateTableGroup(id: string, group: string | undefined) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.group = group || undefined;
    this.schema.updatedAt = now();
    this._cleanupOrphanedGroupColors();
    this._emitOp({ kind: 'update-table-group', tableId: id, group });
  }

  updateGroupColor(group: string, color: string | undefined) {
    if (!this.schema.groupColors) this.schema.groupColors = {};
    if (color) {
      this.schema.groupColors[group] = color;
    } else {
      delete this.schema.groupColors[group];
    }
    // Trigger reactivity by reassigning
    this.schema.groupColors = { ...this.schema.groupColors };
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-group-color', group, color });
  }

  renameGroup(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;
    for (const table of this.schema.tables) {
      if (table.group === oldName) table.group = newName;
    }
    if (this.schema.groupColors?.[oldName]) {
      this.schema.groupColors[newName] = this.schema.groupColors[oldName];
      delete this.schema.groupColors[oldName];
      this.schema.groupColors = { ...this.schema.groupColors };
    }
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'rename-group', oldName, newName });
  }

  private _cleanupOrphanedGroupColors() {
    if (!this.schema.groupColors) return;
    const activeGroups = new Set(this.schema.tables.map((t) => t.group).filter(Boolean));
    let changed = false;
    for (const g of Object.keys(this.schema.groupColors)) {
      if (!activeGroups.has(g)) {
        delete this.schema.groupColors[g];
        changed = true;
      }
    }
    if (changed) this.schema.groupColors = { ...this.schema.groupColors };
  }

  moveTable(id: string, x: number, y: number) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    const sx = canvasState.snap(x);
    const sy = canvasState.snap(y);
    table.position = { x: sx, y: sy };
    this._emitOp({ kind: 'move-table', tableId: id, x: sx, y: sy });
  }

  moveTables(moves: { id: string; x: number; y: number }[]) {
    const opMoves: { tableId: string; x: number; y: number }[] = [];
    for (const move of moves) {
      const table = this.schema.tables.find((t) => t.id === move.id);
      if (!table) continue;
      const sx = canvasState.snap(move.x);
      const sy = canvasState.snap(move.y);
      table.position = { x: sx, y: sy };
      opMoves.push({ tableId: move.id, x: sx, y: sy });
    }
    if (opMoves.length > 0) {
      this._emitOp({ kind: 'move-tables', moves: opMoves });
    }
  }

  applyLayout(positions: Map<string, { x: number; y: number }>) {
    const moves: { tableId: string; x: number; y: number }[] = [];
    for (const table of this.schema.tables) {
      const pos = positions.get(table.id);
      if (pos) {
        table.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
        moves.push({ tableId: table.id, x: table.position.x, y: table.position.y });
      }
    }
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'apply-layout', positions: moves });
  }

  addColumn(tableId: string): string | undefined {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const n = table.columns.length + 1;
    const newColumn: Column = {
      id: generateId(),
      name: `column_${n}`,
      type: 'VARCHAR',
      length: 255,
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    };
    table.columns = [...table.columns, newColumn];
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-column', tableId, column: newColumn });
    return newColumn.id;
  }

  updateColumn(tableId: string, columnId: string, patch: Partial<Column>) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    // PK implies NOT NULL
    if (patch.primaryKey) patch.nullable = false;
    table.columns = table.columns.map((c) =>
      c.id === columnId ? { ...c, ...patch } : c
    );
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-column', tableId, columnId, patch });
  }

  deleteColumn(tableId: string, columnId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.columns = table.columns.filter((c) => c.id !== columnId);
    // Remove FKs that reference this column (in same table)
    table.foreignKeys = table.foreignKeys.filter((fk) => !fk.columnIds.includes(columnId));
    // Remove UniqueKeys that reference this column
    if (table.uniqueKeys) {
      table.uniqueKeys = table.uniqueKeys.filter((uk) => !uk.columnIds.includes(columnId));
    }
    // Remove FKs in other tables that reference this column
    for (const t of this.schema.tables) {
      if (t.id === tableId) continue;
      t.foreignKeys = t.foreignKeys.filter(
        (fk) => !(fk.referencedTableId === tableId && fk.referencedColumnIds.includes(columnId))
      );
    }
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'delete-column', tableId, columnId });
  }

  moveColumnUp(tableId: string, columnId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const idx = table.columns.findIndex((c) => c.id === columnId);
    if (idx <= 0) return;
    const cols = [...table.columns];
    [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
    table.columns = cols;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'move-column', tableId, columnId, toIndex: idx - 1 });
  }

  moveColumnDown(tableId: string, columnId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const idx = table.columns.findIndex((c) => c.id === columnId);
    if (idx < 0 || idx >= table.columns.length - 1) return;
    const cols = [...table.columns];
    [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
    table.columns = cols;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'move-column', tableId, columnId, toIndex: idx + 1 });
  }

  moveColumnToIndex(tableId: string, columnId: string, toIndex: number) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const fromIdx = table.columns.findIndex((c) => c.id === columnId);
    if (fromIdx < 0 || fromIdx === toIndex) return;
    const cols = [...table.columns];
    const [item] = cols.splice(fromIdx, 1);
    cols.splice(toIndex, 0, item);
    table.columns = cols;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'move-column', tableId, columnId, toIndex });
  }

  addForeignKey(
    tableId: string,
    columnIds: string[],
    referencedTableId: string,
    referencedColumnIds: string[],
    onDelete: ForeignKey['onDelete'] = 'RESTRICT',
    onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
  ) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const fk: ForeignKey = {
      id: generateId(),
      columnIds,
      referencedTableId,
      referencedColumnIds,
      onDelete,
      onUpdate,
    };
    table.foreignKeys = [...table.foreignKeys, fk];
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-fk', tableId, fk });
  }

  updateForeignKey(
    tableId: string,
    fkId: string,
    columnIds: string[],
    referencedTableId: string,
    referencedColumnIds: string[],
    onDelete: ForeignKey['onDelete'] = 'RESTRICT',
    onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
  ) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const fk = table.foreignKeys.find((f) => f.id === fkId);
    if (!fk) return;
    fk.columnIds = columnIds;
    fk.referencedTableId = referencedTableId;
    fk.referencedColumnIds = referencedColumnIds;
    fk.onDelete = onDelete;
    fk.onUpdate = onUpdate;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-fk', tableId, fk: { ...fk } });
  }

  deleteForeignKey(tableId: string, fkId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.foreignKeys = table.foreignKeys.filter((fk) => fk.id !== fkId);
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'delete-fk', tableId, fkId });
  }

  addUniqueKey(tableId: string, columnIds: string[], name?: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const uk: UniqueKey = {
      id: generateId(),
      columnIds,
      name: name || undefined,
    };
    table.uniqueKeys = [...table.uniqueKeys, uk];
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-uk', tableId, uk });
  }

  deleteUniqueKey(tableId: string, ukId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.uniqueKeys = table.uniqueKeys.filter((uk) => uk.id !== ukId);
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'delete-uk', tableId, ukId });
  }

  addIndex(tableId: string, columnIds: string[], unique: boolean, name?: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const idx: TableIndex = {
      id: generateId(),
      columnIds,
      unique,
      name: name || undefined,
    };
    table.indexes = [...(table.indexes ?? []), idx];
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-index', tableId, index: idx });
  }

  deleteIndex(tableId: string, indexId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.indexes = (table.indexes ?? []).filter((idx) => idx.id !== indexId);
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'delete-index', tableId, indexId });
  }

  // Domain CRUD
  addDomain(fields: Omit<ColumnDomain, 'id'>) {
    const domain: ColumnDomain = { id: generateId(), ...fields };
    this.schema.domains = [...this.schema.domains, domain];
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-domain', domain });
  }

  updateDomain(id: string, patch: Partial<Omit<ColumnDomain, 'id'>>) {
    // Use hierarchy-aware propagation (cascades to child domains' linked columns)
    const result = propagateWithHierarchy(this.schema, id, patch);
    this.schema.domains = result.domains;
    this.schema.tables = result.tables;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-domain', domainId: id, patch });
  }

  deleteDomain(id: string) {
    const deleted = this.schema.domains.find((d) => d.id === id);
    const parentIdOfDeleted = deleted?.parentId;

    // Re-parent children: assign deleted domain's parentId to its children
    this.schema.domains = this.schema.domains
      .filter((d) => d.id !== id)
      .map((d) => d.parentId === id ? { ...d, parentId: parentIdOfDeleted } : d);

    // Unlink columns that referenced this domain (keep their current settings)
    for (const table of this.schema.tables) {
      table.columns = table.columns.map((c) =>
        c.domainId === id ? { ...c, domainId: undefined } : c
      );
    }

    // Re-propagate for re-parented children
    if (parentIdOfDeleted) {
      const childIds = this.schema.domains
        .filter(d => d.parentId === parentIdOfDeleted)
        .map(d => d.id);
      for (const childId of childIds) {
        const result = propagateWithHierarchy(this.schema, childId, {});
        this.schema.tables = result.tables;
      }
    }

    this.schema.updatedAt = now();
    this._emitOp({ kind: 'delete-domain', domainId: id });
  }

  upsertDomains(items: Omit<ColumnDomain, 'id'>[]): { added: number; updated: number } {
    let added = 0;
    let updated = 0;
    for (const item of items) {
      const existing = this.schema.domains.find((d) => d.name === item.name);
      if (existing) {
        this.updateDomain(existing.id, item);
        updated++;
      } else {
        this.addDomain(item);
        added++;
      }
    }
    return { added, updated };
  }

  duplicateColumn(tableId: string, columnId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const src = table.columns.find((c) => c.id === columnId);
    if (!src) return;
    const newCol: Column = {
      ...src,
      id: generateId(),
      name: `${src.name}_copy`,
      primaryKey: false,
      autoIncrement: false,
      domainId: undefined,
    };
    const idx = table.columns.findIndex((c) => c.id === columnId);
    const cols = [...table.columns];
    cols.splice(idx + 1, 0, newCol);
    table.columns = cols;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'add-column', tableId, column: newCol });
  }

  duplicateTable(id: string) {
    const src = this.schema.tables.find((t) => t.id === id);
    if (!src) return;
    const newId = generateId();
    const newName = `${src.name}_copy`;
    const newTable: Table = {
      id: newId,
      name: newName,
      columns: src.columns.map((c) => ({ ...c, id: generateId() })),
      foreignKeys: [],
      uniqueKeys: [],
      indexes: [],
      position: { x: src.position.x + 30, y: src.position.y + 30 },
      comment: src.comment,
      color: src.color,
      group: src.group,
    };
    this.schema.tables = [...this.schema.tables, newTable];
    this.schema.updatedAt = now();
    this.selectedTableId = newId;
    this.selectedTableIds = new Set([newId]);
    this._emitOp({ kind: 'duplicate-table', table: newTable });
  }

  // Memo CRUD
  addMemo(viewportWidth = 800, viewportHeight = 600) {
    const { x, y, scale } = canvasState;
    const worldX = (viewportWidth / 2 - x) / scale;
    const worldY = (viewportHeight / 2 - y) / scale;
    const id = generateId();
    const memo: Memo = {
      id,
      content: '',
      position: { x: worldX - 100, y: worldY - 75 },
      width: 200,
      height: 150,
    };
    this.schema.memos = [...this.schema.memos, memo];
    this.schema.updatedAt = now();
    this.selectedMemoId = id;
    this.selectedMemoIds = new Set([id]);
    this.editingMemoId = id;
    this._emitOp({ kind: 'add-memo', memo });
  }

  deleteMemo(id: string) {
    this.schema.memos = this.schema.memos.filter((m) => m.id !== id);
    this.schema.updatedAt = now();
    if (this.selectedMemoId === id) this.selectedMemoId = null;
    this.selectedMemoIds.delete(id);
    this.selectedMemoIds = new Set(this.selectedMemoIds);
    this._emitOp({ kind: 'delete-memo', memoId: id });
  }

  deleteMemos(ids: string[]) {
    const idSet = new Set(ids);
    this.schema.memos = this.schema.memos.filter((m) => !idSet.has(m.id));
    this.schema.updatedAt = now();
    if (this.selectedMemoId && idSet.has(this.selectedMemoId)) this.selectedMemoId = null;
    this.selectedMemoIds = new Set();
    this._emitOp({ kind: 'delete-memos', memoIds: ids });
  }

  moveMemo(id: string, x: number, y: number) {
    const memo = this.schema.memos.find((m) => m.id === id);
    if (!memo) return;
    const sx = canvasState.snap(x);
    const sy = canvasState.snap(y);
    memo.position = { x: sx, y: sy };
    this._emitOp({ kind: 'move-memo', memoId: id, x: sx, y: sy });
  }

  moveMemos(moves: { id: string; x: number; y: number }[]) {
    const opMoves: { memoId: string; x: number; y: number }[] = [];
    for (const move of moves) {
      const memo = this.schema.memos.find((m) => m.id === move.id);
      if (!memo) continue;
      const sx = canvasState.snap(move.x);
      const sy = canvasState.snap(move.y);
      memo.position = { x: sx, y: sy };
      opMoves.push({ memoId: move.id, x: sx, y: sy });
    }
    if (opMoves.length > 0) {
      this._emitOp({ kind: 'move-memos', moves: opMoves });
    }
  }

  updateMemo(id: string, patch: Partial<Omit<Memo, 'id'>>) {
    const memo = this.schema.memos.find((m) => m.id === id);
    if (!memo) return;
    Object.assign(memo, patch);
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-memo', memoId: id, patch });
  }

  loadSchema(schema: ERDSchema) {
    if (!schema.domains) schema.domains = [];
    if (!schema.memos) schema.memos = [];
    if (!schema.groupColors) schema.groupColors = {};
    migrateFK(schema);
    for (const table of schema.tables) {
      if (!table.uniqueKeys) table.uniqueKeys = [];
      for (const col of table.columns) {
        if (col.primaryKey && col.nullable) col.nullable = false;
      }
    }
    this.schema = schema;
    this.schema.updatedAt = now();
    this.selectedTableId = null;
    this.selectedTableIds = new Set();
    this.selectedMemoId = null;
    this.selectedMemoIds = new Set();
    this._emitOp({ kind: 'load-schema', schema });
  }
}

export const erdStore = new ERDStore();

export type ColumnDisplayMode = 'all' | 'pk-fk-only' | 'names-only';

class CanvasState {
  x = $state(0);
  y = $state(0);
  scale = $state(1);
  snapToGrid = $state(false);
  gridSize = 20;
  columnDisplayMode = $state<ColumnDisplayMode>('all');
  tableWidths = $state<Map<string, number>>(new Map());

  snap(v: number): number {
    return this.snapToGrid ? Math.round(v / this.gridSize) * this.gridSize : v;
  }

  getTableW(tableId: string): number {
    return this.tableWidths.get(tableId) ?? TABLE_W;
  }

  setTableWidth(tableId: string, width: number) {
    if (this.tableWidths.get(tableId) !== width) {
      this.tableWidths.set(tableId, width);
      this.tableWidths = new Map(this.tableWidths);
    }
  }
}

export const canvasState = new CanvasState();

import type { Column, ColumnDomain, Dialect, ERDSchema, ForeignKey, Memo, Table, TableIndex, UniqueKey } from '$lib/types/erd';
import type { NamingRuleType } from '$lib/types/naming-rules';
import { now } from '$lib/utils/common';
import { normalizeSchema } from '$lib/utils/schema-normalize';
import { canvasState } from '$lib/store/canvas.svelte';

// Ops
import { createTable, pasteTables, deleteTableOp, deleteTablesOp, duplicateTableOp, moveTableOp, moveTablesOp, cleanupOrphanedGroupColors } from '$lib/store/ops/table-ops';
import { addColumnOp, updateColumnOp, deleteColumnOp, moveColumnUpOp, moveColumnDownOp, moveColumnToIndexOp, duplicateColumnOp } from '$lib/store/ops/column-ops';
import { addForeignKeyOp, updateForeignKeyOp, updateFkLabelOp, deleteForeignKeyOp, addUniqueKeyOp, deleteUniqueKeyOp, addIndexOp, deleteIndexOp } from '$lib/store/ops/fk-ops';
import { createMemo, deleteMemoOp, deleteMemosOp, updateMemoOp, attachMemoOp, detachMemoOp } from '$lib/store/ops/memo-ops';
import { addDomainOp, updateDomainOp, deleteDomainOp } from '$lib/store/ops/domain-ops';
import { addSchemaOp, renameSchemaOp, reorderSchemasOp, deleteSchemaOp, updateTableSchemaOp } from '$lib/store/ops/schema-ns-ops';
import { addDbObjectOp, updateDbObjectOp, deleteDbObjectOp, addDbObjectCategoryOp, renameDbObjectCategoryOp, deleteDbObjectCategoryOp, reorderDbObjectCategoriesOp } from '$lib/store/ops/db-object-ops';
import { deriveLabel } from '$lib/utils/history-labels';

// Re-export for backward compatibility
export { canvasState } from '$lib/store/canvas.svelte';
export type { ColumnDisplayMode, LineType } from '$lib/store/canvas.svelte';

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

export type HistoryEntry = { snap: string; label: string; detail: string; time: number };

const MAX_HISTORY = 200;

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
  /** Highlighted column from lint panel click — auto-clears after timeout */
  highlightedColumn = $state<{ tableId: string; columnId: string } | null>(null);
  private _highlightTimer: ReturnType<typeof setTimeout> | undefined;
  lastAddedTableId = $state<string | null>(null);
  // Undo/Redo
  private _undoStack: HistoryEntry[] = [];
  private _redoStack: HistoryEntry[] = [];
  _undoVersion = $state(0);
  _isUndoRedoing = false;
  _isRemoteOp = false;
  _isLoadingSchema = false;
  _lastOperation = $state<import('$lib/types/collab').CollabOperation | null>(null);
  _opVersion = $state(0);

  get canUndo(): boolean { void this._undoVersion; return this._undoStack.length > 0; }
  get canRedo(): boolean { void this._undoVersion; return this._redoStack.length > 0; }

  get historyEntries(): HistoryEntry[] {
    void this._undoVersion;
    return [...this._undoStack];
  }

  get redoEntries(): HistoryEntry[] {
    void this._undoVersion;
    return [...this._redoStack];
  }

  pushSnapshotRaw(snap: string, label: string, detail: string = '') {
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
    for (let i = this._undoStack.length - 1; i > index; i--) {
      this._redoStack.push(this._undoStack[i]);
    }
    const target = this._undoStack[index];
    this._redoStack.push({ snap: current, label: target.label, detail: target.detail, time: Date.now() });
    this._undoStack = this._undoStack.slice(0, index);
    this._isUndoRedoing = true;
    this.schema = JSON.parse(target.snap);
    this._undoVersion++;
    this._emitOp({ kind: 'load-schema', schema: this.schema });
  }

  private _emitOp(op: import('$lib/types/collab').CollabOperation) {
    if (!this._isRemoteOp) {
      this._lastOperation = op;
      this._opVersion++;
    }
  }

  private _t(id: string): Table | undefined {
    return this.schema.tables.find((t) => t.id === id);
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

  // ── Table Operations ──

  addTable(viewportWidth = 800, viewportHeight = 600) {
    const { x: worldX, y: worldY } = canvasState.viewportCenterToWorld(viewportWidth, viewportHeight);
    const activeSchema = canvasState.activeSchema !== '(all)' ? canvasState.activeSchema : undefined;
    const { table, id } = createTable(this.schema, { x: worldX - 100, y: worldY - 60 }, activeSchema);
    this.selectedTableId = id;
    this.lastAddedTableId = id;
    this._emitOp({ kind: 'add-table', table });
  }

  pasteTablesFromClipboard(tables: Table[]) {
    const activeSchema = canvasState.activeSchema !== '(all)' ? canvasState.activeSchema : undefined;
    const { newIds } = pasteTables(this.schema, tables, activeSchema);
    this.selectedTableIds = new Set(newIds);
    if (newIds.length > 0) this.selectedTableId = newIds[0];
    // Emit ops for each new table
    for (const id of newIds) {
      const t = this._t(id);
      if (t) this._emitOp({ kind: 'add-table', table: t });
    }
  }

  deleteTable(id: string) {
    deleteTableOp(this.schema, id);
    if (this.selectedTableId === id) this.selectedTableId = null;
    this._emitOp({ kind: 'delete-table', tableId: id });
  }

  deleteTables(ids: string[]) {
    deleteTablesOp(this.schema, ids);
    if (this.selectedTableId && new Set(ids).has(this.selectedTableId)) this.selectedTableId = null;
    this.selectedTableIds = new Set();
    this._emitOp({ kind: 'delete-tables', tableIds: ids });
  }

  updateTableName(id: string, name: string) {
    const table = this._t(id);
    if (!table) return;
    table.name = name;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-name', tableId: id, name });
  }

  updateTableComment(id: string, comment: string) {
    const table = this._t(id);
    if (!table) return;
    table.comment = comment || undefined;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-comment', tableId: id, comment });
  }

  updateTableColor(id: string, color: string | undefined) {
    const table = this._t(id);
    if (!table) return;
    table.color = color;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-table-color', tableId: id, color });
  }

  updateTableGroup(id: string, group: string | undefined) {
    const table = this._t(id);
    if (!table) return;
    table.group = group || undefined;
    this.schema.updatedAt = now();
    cleanupOrphanedGroupColors(this.schema);
    this._emitOp({ kind: 'update-table-group', tableId: id, group });
  }

  updateGroupColor(group: string, color: string | undefined) {
    if (!this.schema.groupColors) this.schema.groupColors = {};
    if (color) {
      this.schema.groupColors[group] = color;
    } else {
      delete this.schema.groupColors[group];
    }
    this.schema.groupColors = { ...this.schema.groupColors };
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'update-group-color', group, color });
  }

  flashColumn(tableId: string, columnId: string) {
    clearTimeout(this._highlightTimer);
    this.highlightedColumn = { tableId, columnId };
    this._highlightTimer = setTimeout(() => { this.highlightedColumn = null; }, 3000);
  }

  setNamingOverride(ruleType: NamingRuleType, value: string | undefined) {
    if (!this.schema.namingRules) this.schema.namingRules = {};
    if (value === undefined) {
      delete this.schema.namingRules[ruleType];
    } else {
      this.schema.namingRules[ruleType] = value;
    }
    this.schema.namingRules = { ...this.schema.namingRules };
    this.schema.updatedAt = now();
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

  moveTable(id: string, x: number, y: number) {
    const sx = canvasState.snap(x);
    const sy = canvasState.snap(y);
    moveTableOp(this.schema, id, sx, sy);
    this._emitOp({ kind: 'move-table', tableId: id, x: sx, y: sy });
  }

  moveTables(moves: { id: string; x: number; y: number }[]) {
    const snapped = moves.map(m => ({ id: m.id, x: canvasState.snap(m.x), y: canvasState.snap(m.y) }));
    moveTablesOp(this.schema, snapped);
    const opMoves = snapped.map(m => ({ tableId: m.id, x: m.x, y: m.y }));
    if (opMoves.length > 0) {
      this._emitOp({ kind: 'move-tables', moves: opMoves });
    }
  }

  applyLayout(positions: Map<string, { x: number; y: number }>) {
    const moves: { tableId: string; x: number; y: number }[] = [];
    for (const table of this.schema.tables) {
      if (table.locked) continue;
      const pos = positions.get(table.id);
      if (pos) {
        table.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
        moves.push({ tableId: table.id, x: table.position.x, y: table.position.y });
      }
    }
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'apply-layout', positions: moves });
  }

  duplicateTable(id: string) {
    const newTable = duplicateTableOp(this.schema, id);
    if (!newTable) return;
    this.selectedTableId = newTable.id;
    this.selectedTableIds = new Set([newTable.id]);
    this._emitOp({ kind: 'duplicate-table', table: newTable });
  }

  // ── Column Operations ──

  addColumn(tableId: string): string | undefined {
    const col = addColumnOp(this.schema, tableId);
    if (!col) return;
    this._emitOp({ kind: 'add-column', tableId, column: col });
    return col.id;
  }

  updateColumn(tableId: string, columnId: string, patch: Partial<Column>) {
    updateColumnOp(this.schema, tableId, columnId, patch);
    this._emitOp({ kind: 'update-column', tableId, columnId, patch });
  }

  deleteColumn(tableId: string, columnId: string) {
    deleteColumnOp(this.schema, tableId, columnId);
    this._emitOp({ kind: 'delete-column', tableId, columnId });
  }

  moveColumnUp(tableId: string, columnId: string) {
    const toIndex = moveColumnUpOp(this.schema, tableId, columnId);
    if (toIndex !== undefined) this._emitOp({ kind: 'move-column', tableId, columnId, toIndex });
  }

  moveColumnDown(tableId: string, columnId: string) {
    const toIndex = moveColumnDownOp(this.schema, tableId, columnId);
    if (toIndex !== undefined) this._emitOp({ kind: 'move-column', tableId, columnId, toIndex });
  }

  moveColumnToIndex(tableId: string, columnId: string, toIndex: number) {
    if (moveColumnToIndexOp(this.schema, tableId, columnId, toIndex)) {
      this._emitOp({ kind: 'move-column', tableId, columnId, toIndex });
    }
  }

  duplicateColumn(tableId: string, columnId: string) {
    const col = duplicateColumnOp(this.schema, tableId, columnId);
    if (col) this._emitOp({ kind: 'add-column', tableId, column: col });
  }

  // ── Foreign Key Operations ──

  addForeignKey(
    tableId: string,
    columnIds: string[],
    referencedTableId: string,
    referencedColumnIds: string[],
    onDelete: ForeignKey['onDelete'] = 'RESTRICT',
    onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
  ) {
    const fk = addForeignKeyOp(this.schema, tableId, columnIds, referencedTableId, referencedColumnIds, onDelete, onUpdate);
    if (fk) this._emitOp({ kind: 'add-fk', tableId, fk });
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
    updateForeignKeyOp(this.schema, tableId, fkId, columnIds, referencedTableId, referencedColumnIds, onDelete, onUpdate);
    const table = this._t(tableId);
    const fk = table?.foreignKeys.find((f) => f.id === fkId);
    if (fk) this._emitOp({ kind: 'update-fk', tableId, fk: { ...fk } });
  }

  updateFkLabel(tableId: string, fkId: string, label: string) {
    updateFkLabelOp(this.schema, tableId, fkId, label);
    const table = this._t(tableId);
    const fk = table?.foreignKeys.find((f) => f.id === fkId);
    if (fk) this._emitOp({ kind: 'update-fk', tableId, fk: { ...fk } });
  }

  deleteForeignKey(tableId: string, fkId: string) {
    deleteForeignKeyOp(this.schema, tableId, fkId);
    this._emitOp({ kind: 'delete-fk', tableId, fkId });
  }

  addUniqueKey(tableId: string, columnIds: string[], name?: string) {
    const uk = addUniqueKeyOp(this.schema, tableId, columnIds, name);
    if (uk) this._emitOp({ kind: 'add-uk', tableId, uk });
  }

  deleteUniqueKey(tableId: string, ukId: string) {
    deleteUniqueKeyOp(this.schema, tableId, ukId);
    this._emitOp({ kind: 'delete-uk', tableId, ukId });
  }

  addIndex(tableId: string, columnIds: string[], unique: boolean, name?: string) {
    const idx = addIndexOp(this.schema, tableId, columnIds, unique, name);
    if (idx) this._emitOp({ kind: 'add-index', tableId, index: idx });
  }

  deleteIndex(tableId: string, indexId: string) {
    deleteIndexOp(this.schema, tableId, indexId);
    this._emitOp({ kind: 'delete-index', tableId, indexId });
  }

  // ── Domain Operations ──

  addDomain(fields: Omit<ColumnDomain, 'id'>) {
    const domain = addDomainOp(this.schema, fields);
    this._emitOp({ kind: 'add-domain', domain });
  }

  updateDomain(id: string, patch: Partial<Omit<ColumnDomain, 'id'>>) {
    updateDomainOp(this.schema, id, patch);
    this._emitOp({ kind: 'update-domain', domainId: id, patch });
  }

  deleteDomain(id: string) {
    deleteDomainOp(this.schema, id);
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

  // ── Memo Operations ──

  addMemo(viewportWidth = 800, viewportHeight = 600) {
    const { x: worldX, y: worldY } = canvasState.viewportCenterToWorld(viewportWidth, viewportHeight);
    const activeSchema = canvasState.activeSchema !== '(all)' ? canvasState.activeSchema : undefined;
    const memo = createMemo(this.schema, { x: worldX - 100, y: worldY - 75 }, activeSchema);
    this.selectedMemoId = memo.id;
    this.selectedMemoIds = new Set([memo.id]);
    this.editingMemoId = memo.id;
    this._emitOp({ kind: 'add-memo', memo });
  }

  deleteMemo(id: string) {
    deleteMemoOp(this.schema, id);
    if (this.selectedMemoId === id) this.selectedMemoId = null;
    this.selectedMemoIds.delete(id);
    this.selectedMemoIds = new Set(this.selectedMemoIds);
    this._emitOp({ kind: 'delete-memo', memoId: id });
  }

  deleteMemos(ids: string[]) {
    const idSet = new Set(ids);
    deleteMemosOp(this.schema, ids);
    if (this.selectedMemoId && idSet.has(this.selectedMemoId)) this.selectedMemoId = null;
    this.selectedMemoIds = new Set();
    this._emitOp({ kind: 'delete-memos', memoIds: ids });
  }

  moveMemo(id: string, x: number, y: number) {
    const sx = canvasState.snap(x);
    const sy = canvasState.snap(y);
    const memo = this.schema.memos.find((m) => m.id === id);
    if (!memo) return;
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
    updateMemoOp(this.schema, id, patch);
    this._emitOp({ kind: 'update-memo', memoId: id, patch });
  }

  attachMemo(memoId: string, tableId: string) {
    attachMemoOp(this.schema, memoId, tableId);
    this._emitOp({ kind: 'attach-memo', memoId, tableId });
  }

  detachMemo(memoId: string) {
    detachMemoOp(this.schema, memoId);
    this._emitOp({ kind: 'detach-memo', memoId });
  }

  // ── Schema Namespace Operations ──

  addSchema(name: string) {
    if (addSchemaOp(this.schema, name)) {
      this._emitOp({ kind: 'add-schema', name });
    }
  }

  renameSchema(oldName: string, newName: string) {
    if (renameSchemaOp(this.schema, oldName, newName)) {
      this._emitOp({ kind: 'rename-schema', oldName, newName });
    }
  }

  reorderSchemas(schemas: string[]) {
    reorderSchemasOp(this.schema, schemas);
    this._emitOp({ kind: 'reorder-schemas', schemas });
  }

  deleteSchema(name: string) {
    deleteSchemaOp(this.schema, name);
    this._emitOp({ kind: 'delete-schema', name });
  }

  updateTableSchema(tableId: string, schema: string | undefined) {
    updateTableSchemaOp(this.schema, tableId, schema);
    this._emitOp({ kind: 'update-table-schema', tableId, schema: schema ?? '' });
  }

  // ── Dialect ──

  setDialect(dialect: Dialect | undefined) {
    this.schema.dialect = dialect;
    this.schema.updatedAt = now();
    this._emitOp({ kind: 'set-dialect', dialect });
  }

  // ── Schema Loading ──

  loadSchema(schema: ERDSchema) {
    normalizeSchema(schema);
    this._isLoadingSchema = true;
    this.schema = schema;
    this.schema.updatedAt = now();
    this.selectedTableId = null;
    this.selectedTableIds = new Set();
    this.selectedMemoId = null;
    this.selectedMemoIds = new Set();
    this.selectedDbObjectId = null;
    this.editingColumnInfo = null;
    this.editingMemoId = null;
    this.hoveredColumnInfo = null;
    this.hoveredFkInfo = [];
    this.hoveredUkInfo = null;
    this.hoveredIdxInfo = null;
    this._emitOp({ kind: 'load-schema', schema });
  }

  /**
   * Apply an MCP-driven schema change. Unlike a sync/reconnect (which
   * shouldn't pollute history), an MCP change is a real, user-meaningful
   * edit performed by an AI tool — we want it visible in the undo panel
   * so the human can revert it. We capture the prev snapshot, apply the
   * load, then push manually with a "(MCP)" marker.
   *
   * _isRemoteOp is set so the load-schema op isn't echoed back to peers
   * (peers receive their own mcp-sync from the server). _isLoadingSchema
   * (set by loadSchema) is cleared because we want history *here*, not
   * suppression.
   */
  loadSchemaFromMcp(newSchema: ERDSchema) {
    const prevSnap = JSON.stringify($state.snapshot(this.schema));
    const prevSchema = JSON.parse(prevSnap) as ERDSchema;
    this._isRemoteOp = true;
    this.loadSchema(newSchema);
    this._isLoadingSchema = false;
    const { label, detail } = deriveLabel(prevSchema, newSchema);
    this.pushSnapshotRaw(prevSnap, label, detail ? `${detail} (MCP)` : '(MCP)');
  }

  // ── DB Objects ──
  selectedDbObjectId = $state<string | null>(null);

  get selectedDbObject() {
    if (!this.selectedDbObjectId || !this.schema.dbObjects) return null;
    return this.schema.dbObjects.find((o) => o.id === this.selectedDbObjectId) ?? null;
  }

  addDbObject(category: string, name?: string) {
    const obj = addDbObjectOp(this.schema, category, name);

    this._emitOp({ kind: 'add-db-object', object: { ...obj } });
    return obj;
  }

  updateDbObject(objectId: string, updates: Partial<Pick<import('$lib/types/erd').DbObject, 'name' | 'sql' | 'comment' | 'category' | 'schema' | 'includeInDdl'>>) {
    if (updateDbObjectOp(this.schema, objectId, updates)) {

      this._emitOp({ kind: 'update-db-object', objectId, updates });
    }
  }

  deleteDbObject(objectId: string) {
    if (deleteDbObjectOp(this.schema, objectId)) {
      if (this.selectedDbObjectId === objectId) this.selectedDbObjectId = null;

      this._emitOp({ kind: 'delete-db-object', objectId });
    }
  }

  addDbObjectCategory(category: string) {
    if (addDbObjectCategoryOp(this.schema, category)) {

      this._emitOp({ kind: 'add-db-object-category', category });
    }
  }

  renameDbObjectCategory(oldName: string, newName: string) {
    if (renameDbObjectCategoryOp(this.schema, oldName, newName)) {

      this._emitOp({ kind: 'rename-db-object-category', oldName, newName });
    }
  }

  deleteDbObjectCategory(category: string) {
    if (deleteDbObjectCategoryOp(this.schema, category)) {
      if (this.selectedDbObjectId && !this.schema.dbObjects?.find((o) => o.id === this.selectedDbObjectId)) {
        this.selectedDbObjectId = null;
      }

      this._emitOp({ kind: 'delete-db-object-category', category });
    }
  }

  reorderDbObjectCategories(categories: string[]) {
    reorderDbObjectCategoriesOp(this.schema, categories);
    this._emitOp({ kind: 'reorder-db-object-categories', categories });
  }
}

export const erdStore = new ERDStore();

import type { Column, ColumnDomain, ERDSchema, ForeignKey, Table, TableIndex, UniqueKey } from '$lib/types/erd';
import { generateId, now } from '$lib/utils/common';

const LS_KEY = 'erdmini_schema';

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

function loadFromStorage(): ERDSchema {
  if (typeof window === 'undefined') return defaultSchema();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return defaultSchema();
    const parsed = JSON.parse(raw) as ERDSchema;
    // Migrate older schemas that lack domains
    if (!parsed.domains) parsed.domains = [];
    // Migrate legacy single-column FK format
    migrateFK(parsed);
    // Migrate older schemas that lack uniqueKeys / indexes
    for (const table of parsed.tables) {
      if (!table.uniqueKeys) table.uniqueKeys = [];
      if (!table.indexes) table.indexes = [];
    }
    return parsed;
  } catch {
    return defaultSchema();
  }
}

export type HistoryEntry = { snap: string; label: string; detail: string; time: number };

const MAX_HISTORY = 50;

class ERDStore {
  schema = $state<ERDSchema>(loadFromStorage());
  selectedTableId = $state<string | null>(null);
  selectedTableIds = $state<Set<string>>(new Set());
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

  get canUndo(): boolean { void this._undoVersion; return this._undoStack.length > 0; }
  get canRedo(): boolean { void this._undoVersion; return this._redoStack.length > 0; }

  get historyEntries(): HistoryEntry[] {
    // Access version to make this reactive
    void this._undoVersion;
    return [...this._undoStack];
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
    this._redoStack.push({ snap: current, label: '', time: Date.now() });
    const prev = this._undoStack.pop()!;
    this._isUndoRedoing = true;
    this.schema = JSON.parse(prev.snap);
    this._undoVersion++;
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const current = JSON.stringify($state.snapshot(this.schema));
    this._undoStack.push({ snap: current, label: '', time: Date.now() });
    const next = this._redoStack.pop()!;
    this._isUndoRedoing = true;
    this.schema = JSON.parse(next.snap);
    this._undoVersion++;
  }

  jumpToHistory(index: number) {
    if (index < 0 || index >= this._undoStack.length) return;
    const current = JSON.stringify($state.snapshot(this.schema));
    // Push items from index+1..end and current state onto redo stack
    for (let i = this._undoStack.length - 1; i > index; i--) {
      this._redoStack.push(this._undoStack[i]);
    }
    this._redoStack.push({ snap: current, label: '', time: Date.now() });
    // Restore the target snapshot
    const target = this._undoStack[index];
    this._undoStack = this._undoStack.slice(0, index);
    this._isUndoRedoing = true;
    this.schema = JSON.parse(target.snap);
    this._undoVersion++;
  }

  get selectedTable(): Table | undefined {
    return this.schema.tables.find((t) => t.id === this.selectedTableId);
  }

  saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify($state.snapshot(this.schema)));
      this.storageFull = false;
    } catch {
      this.storageFull = true;
    }
  }

  saveToStorageAs(projectId: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`erdmini_schema_${projectId}`, JSON.stringify($state.snapshot(this.schema)));
      this.storageFull = false;
    } catch {
      this.storageFull = true;
    }
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
  }

  updateTableName(id: string, name: string) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.name = name;
    this.schema.updatedAt = now();
  }

  updateTableComment(id: string, comment: string) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.comment = comment || undefined;
    this.schema.updatedAt = now();
  }

  updateTableColor(id: string, color: string | undefined) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.color = color;
    this.schema.updatedAt = now();
  }

  updateTableGroup(id: string, group: string | undefined) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.group = group || undefined;
    this.schema.updatedAt = now();
  }

  moveTable(id: string, x: number, y: number) {
    const table = this.schema.tables.find((t) => t.id === id);
    if (!table) return;
    table.position = { x, y };
  }

  applyLayout(positions: Map<string, { x: number; y: number }>) {
    for (const table of this.schema.tables) {
      const pos = positions.get(table.id);
      if (pos) table.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    this.schema.updatedAt = now();
  }

  addColumn(tableId: string) {
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
  }

  deleteForeignKey(tableId: string, fkId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.foreignKeys = table.foreignKeys.filter((fk) => fk.id !== fkId);
    this.schema.updatedAt = now();
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
  }

  deleteUniqueKey(tableId: string, ukId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.uniqueKeys = table.uniqueKeys.filter((uk) => uk.id !== ukId);
    this.schema.updatedAt = now();
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
  }

  deleteIndex(tableId: string, indexId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.indexes = (table.indexes ?? []).filter((idx) => idx.id !== indexId);
    this.schema.updatedAt = now();
  }

  // Domain CRUD
  addDomain(fields: Omit<ColumnDomain, 'id'>) {
    const domain: ColumnDomain = { id: generateId(), ...fields };
    this.schema.domains = [...this.schema.domains, domain];
    this.schema.updatedAt = now();
  }

  updateDomain(id: string, patch: Partial<Omit<ColumnDomain, 'id'>>) {
    this.schema.domains = this.schema.domains.map((d) =>
      d.id === id ? { ...d, ...patch } : d
    );
    // Propagate changes to all columns linked to this domain
    const updated = this.schema.domains.find((d) => d.id === id);
    if (updated) {
      for (const table of this.schema.tables) {
        table.columns = table.columns.map((c) => {
          if (c.domainId !== id) return c;
          return {
            ...c,
            type: updated.type,
            length: updated.length,
            nullable: updated.nullable,
            primaryKey: updated.primaryKey,
            unique: updated.unique,
            autoIncrement: updated.autoIncrement,
            defaultValue: updated.defaultValue,
          };
        });
      }
    }
    this.schema.updatedAt = now();
  }

  deleteDomain(id: string) {
    this.schema.domains = this.schema.domains.filter((d) => d.id !== id);
    // Unlink columns that referenced this domain (keep their current settings)
    for (const table of this.schema.tables) {
      table.columns = table.columns.map((c) =>
        c.domainId === id ? { ...c, domainId: undefined } : c
      );
    }
    this.schema.updatedAt = now();
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
      position: { x: src.position.x + 30, y: src.position.y + 30 },
      comment: src.comment,
      color: src.color,
      group: src.group,
    };
    this.schema.tables = [...this.schema.tables, newTable];
    this.schema.updatedAt = now();
    this.selectedTableId = newId;
    this.selectedTableIds = new Set([newId]);
  }

  loadSchema(schema: ERDSchema) {
    if (!schema.domains) schema.domains = [];
    migrateFK(schema);
    for (const table of schema.tables) {
      if (!table.uniqueKeys) table.uniqueKeys = [];
    }
    this.schema = schema;
    this.schema.updatedAt = now();
    this.selectedTableId = null;
    this.selectedTableIds = new Set();
  }
}

export const erdStore = new ERDStore();

class CanvasState {
  x = $state(0);
  y = $state(0);
  scale = $state(1);
}

export const canvasState = new CanvasState();

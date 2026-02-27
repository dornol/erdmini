import type { Column, ColumnDomain, ERDSchema, ForeignKey, Table } from '$lib/types/erd';

const LS_KEY = 'erdmini_schema';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

function getNextTableName(tables: Table[]): string {
  let i = 1;
  while (tables.some((t) => t.name === `table_${i}`)) i++;
  return `table_${i}`;
}

function defaultSchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function loadFromStorage(): ERDSchema {
  if (typeof window === 'undefined') return defaultSchema();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return defaultSchema();
    const parsed = JSON.parse(raw) as ERDSchema;
    // Migrate older schemas that lack domains
    if (!parsed.domains) parsed.domains = [];
    return parsed;
  } catch {
    return defaultSchema();
  }
}

class ERDStore {
  schema = $state<ERDSchema>(loadFromStorage());
  selectedTableId = $state<string | null>(null);

  get selectedTable(): Table | undefined {
    return this.schema.tables.find((t) => t.id === this.selectedTableId);
  }

  saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify($state.snapshot(this.schema)));
    } catch {}
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

  updateTableName(id: string, name: string) {
    this.schema.tables = this.schema.tables.map((t) =>
      t.id === id ? { ...t, name } : t
    );
    this.schema.updatedAt = now();
  }

  updateTableComment(id: string, comment: string) {
    this.schema.tables = this.schema.tables.map((t) =>
      t.id === id ? { ...t, comment } : t
    );
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
    table.columns = table.columns.map((c) =>
      c.id === columnId ? { ...c, ...patch } : c
    );
    this.schema.updatedAt = now();
  }

  deleteColumn(tableId: string, columnId: string) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    table.columns = table.columns.filter((c) => c.id !== columnId);
    // Remove FKs that reference this column
    table.foreignKeys = table.foreignKeys.filter((fk) => fk.columnId !== columnId);
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

  addForeignKey(
    tableId: string,
    columnId: string,
    referencedTableId: string,
    referencedColumnId: string,
    onDelete: ForeignKey['onDelete'] = 'RESTRICT',
    onUpdate: ForeignKey['onUpdate'] = 'RESTRICT',
  ) {
    const table = this.schema.tables.find((t) => t.id === tableId);
    if (!table) return;
    const fk: ForeignKey = {
      id: generateId(),
      columnId,
      referencedTableId,
      referencedColumnId,
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
    this.schema.updatedAt = now();
  }

  deleteDomain(id: string) {
    this.schema.domains = this.schema.domains.filter((d) => d.id !== id);
    this.schema.updatedAt = now();
  }

  loadSchema(schema: ERDSchema) {
    if (!schema.domains) schema.domains = [];
    this.schema = schema;
    this.selectedTableId = null;
  }
}

export const erdStore = new ERDStore();

class CanvasState {
  x = $state(0);
  y = $state(0);
  scale = $state(1);
}

export const canvasState = new CanvasState();

import type { Column, ERDSchema, ForeignKey, Table } from '$lib/types/erd';

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

class ERDStore {
  schema = $state<ERDSchema>({
    version: '1',
    tables: [],
    createdAt: now(),
    updatedAt: now(),
  });

  selectedTableId = $state<string | null>(null);

  get selectedTable(): Table | undefined {
    return this.schema.tables.find((t) => t.id === this.selectedTableId);
  }

  addTable(viewportWidth = 800, viewportHeight = 600) {
    const { x, y, scale } = canvasState;
    // Convert viewport center to world coordinates
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
    this.schema.tables = this.schema.tables.filter((t) => t.id !== id);
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

  loadSchema(schema: ERDSchema) {
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

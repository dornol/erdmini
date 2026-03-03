import type { Column, ColumnDomain, ColumnType, ERDSchema, ForeignKey, Memo, Table } from '$lib/types/erd';

let _idCounter = 0;

function testId(): string {
  return `test_${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

export function makeColumn(overrides: Partial<Column> & { name: string }): Column {
  return {
    id: testId(),
    type: 'VARCHAR' as ColumnType,
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

export function makeTable(overrides: Partial<Table> & { name: string; columns: Column[] }): Table {
  return {
    id: testId(),
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

export function makeMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: testId(),
    content: '',
    position: { x: 0, y: 0 },
    width: 200,
    height: 150,
    ...overrides,
  };
}

export function makeDomain(overrides: Partial<ColumnDomain> & { id: string; name: string }): ColumnDomain {
  return {
    type: 'VARCHAR',
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

export function makeSchema(tables: Table[], domains: ColumnDomain[] = []): ERDSchema {
  return {
    version: '1.0',
    tables,
    domains,
    memos: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

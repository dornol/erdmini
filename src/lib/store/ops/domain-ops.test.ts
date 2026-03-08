import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ERDSchema, ColumnDomain, Table } from '$lib/types/erd';
import { addDomainOp, updateDomainOp, deleteDomainOp } from '$lib/store/ops/domain-ops';

vi.mock('$lib/utils/common', () => {
  let counter = 0;
  return {
    generateId: () => `id_${++counter}`,
    now: () => '2024-06-01T00:00:00.000Z',
  };
});

function makeSchema(overrides?: Partial<ERDSchema>): ERDSchema {
  return {
    version: '1.0',
    tables: [],
    domains: [],
    memos: [],
    groupColors: {},
    schemas: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function makeDomain(overrides?: Partial<ColumnDomain>): ColumnDomain {
  return {
    id: 'dom1',
    name: 'TestDomain',
    type: 'VARCHAR',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

function makeTable(overrides?: Partial<Table>): Table {
  return {
    id: 'tbl1',
    name: 'test_table',
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('addDomainOp', () => {
  it('creates a domain with a generated ID and adds it to schema.domains', () => {
    const schema = makeSchema();
    const result = addDomainOp(schema, {
      name: 'Email',
      type: 'VARCHAR',
      length: 255,
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    });

    expect(result.id).toBeTruthy();
    expect(result.name).toBe('Email');
    expect(result.type).toBe('VARCHAR');
    expect(result.length).toBe(255);
    expect(schema.domains).toHaveLength(1);
    expect(schema.domains[0]).toBe(result);
  });

  it('updates schema.updatedAt', () => {
    const schema = makeSchema({ updatedAt: '2024-01-01' });
    addDomainOp(schema, {
      name: 'Age',
      type: 'INT',
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    });
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('appends to existing domains without removing them', () => {
    const existing = makeDomain({ id: 'existing', name: 'Existing' });
    const schema = makeSchema({ domains: [existing] });
    addDomainOp(schema, {
      name: 'New',
      type: 'TEXT',
      nullable: true,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    });
    expect(schema.domains).toHaveLength(2);
    expect(schema.domains[0].name).toBe('Existing');
    expect(schema.domains[1].name).toBe('New');
  });

  it('returns the newly created domain object', () => {
    const schema = makeSchema();
    const result = addDomainOp(schema, {
      name: 'Price',
      type: 'DECIMAL',
      length: 10,
      scale: 2,
      nullable: false,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    });
    expect(result.scale).toBe(2);
    expect(result.length).toBe(10);
  });
});

describe('updateDomainOp', () => {
  it('updates the domain type via propagateWithHierarchy', () => {
    const domain = makeDomain({ id: 'dom1', name: 'Email', type: 'VARCHAR' });
    const schema = makeSchema({ domains: [domain] });
    updateDomainOp(schema, 'dom1', { type: 'TEXT' });

    const updated = schema.domains.find((d) => d.id === 'dom1');
    expect(updated?.type).toBe('TEXT');
  });

  it('updates domain name', () => {
    const domain = makeDomain({ id: 'dom1', name: 'OldName', type: 'INT' });
    const schema = makeSchema({ domains: [domain] });
    updateDomainOp(schema, 'dom1', { name: 'NewName' });

    const updated = schema.domains.find((d) => d.id === 'dom1');
    expect(updated?.name).toBe('NewName');
  });

  it('updates schema.updatedAt', () => {
    const domain = makeDomain({ id: 'dom1' });
    const schema = makeSchema({ domains: [domain], updatedAt: '2024-01-01' });
    updateDomainOp(schema, 'dom1', { nullable: true });
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('propagates type change to columns using the domain', () => {
    const domain = makeDomain({ id: 'dom1', type: 'VARCHAR', length: 100 });
    const table = makeTable({
      columns: [
        {
          id: 'col1',
          name: 'email',
          domainId: 'dom1',
          type: 'VARCHAR',
          length: 100,
          nullable: false,
          primaryKey: false,
          unique: false,
          autoIncrement: false,
        },
      ],
    });
    const schema = makeSchema({ domains: [domain], tables: [table] });
    updateDomainOp(schema, 'dom1', { type: 'TEXT' });

    const col = schema.tables[0].columns[0];
    expect(col.type).toBe('TEXT');
  });
});

describe('deleteDomainOp', () => {
  it('removes the domain from schema.domains', () => {
    const domain = makeDomain({ id: 'dom1' });
    const schema = makeSchema({ domains: [domain] });
    deleteDomainOp(schema, 'dom1');
    expect(schema.domains).toHaveLength(0);
  });

  it('clears domainId from columns that referenced the deleted domain', () => {
    const domain = makeDomain({ id: 'dom1' });
    const table = makeTable({
      columns: [
        {
          id: 'col1',
          name: 'email',
          domainId: 'dom1',
          type: 'VARCHAR',
          nullable: false,
          primaryKey: false,
          unique: false,
          autoIncrement: false,
        },
        {
          id: 'col2',
          name: 'name',
          domainId: 'other',
          type: 'VARCHAR',
          nullable: false,
          primaryKey: false,
          unique: false,
          autoIncrement: false,
        },
      ],
    });
    const schema = makeSchema({ domains: [domain], tables: [table] });
    deleteDomainOp(schema, 'dom1');

    expect(schema.tables[0].columns[0].domainId).toBeUndefined();
    expect(schema.tables[0].columns[1].domainId).toBe('other');
  });

  it('re-parents children to the deleted domain parent', () => {
    const parent = makeDomain({ id: 'parent', name: 'Parent', type: 'VARCHAR' });
    const middle = makeDomain({ id: 'middle', name: 'Middle', type: 'VARCHAR', parentId: 'parent' });
    const child = makeDomain({ id: 'child', name: 'Child', type: 'VARCHAR', parentId: 'middle' });
    const schema = makeSchema({ domains: [parent, middle, child] });

    deleteDomainOp(schema, 'middle');

    expect(schema.domains).toHaveLength(2);
    const remainingChild = schema.domains.find((d) => d.id === 'child');
    expect(remainingChild?.parentId).toBe('parent');
  });

  it('clears parentId for children when deleted domain has no parent', () => {
    const root = makeDomain({ id: 'root', name: 'Root', type: 'INT' });
    const child = makeDomain({ id: 'child', name: 'Child', type: 'INT', parentId: 'root' });
    const schema = makeSchema({ domains: [root, child] });

    deleteDomainOp(schema, 'root');

    const remainingChild = schema.domains.find((d) => d.id === 'child');
    expect(remainingChild?.parentId).toBeUndefined();
  });

  it('updates schema.updatedAt', () => {
    const domain = makeDomain({ id: 'dom1' });
    const schema = makeSchema({ domains: [domain], updatedAt: '2024-01-01' });
    deleteDomainOp(schema, 'dom1');
    expect(schema.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('handles deleting a non-existent domain gracefully', () => {
    const schema = makeSchema({ domains: [] });
    expect(() => deleteDomainOp(schema, 'nonexistent')).not.toThrow();
  });

  it('does not affect columns with no domainId', () => {
    const domain = makeDomain({ id: 'dom1' });
    const table = makeTable({
      columns: [
        {
          id: 'col1',
          name: 'plain',
          type: 'INT',
          nullable: false,
          primaryKey: false,
          unique: false,
          autoIncrement: false,
        },
      ],
    });
    const schema = makeSchema({ domains: [domain], tables: [table] });
    deleteDomainOp(schema, 'dom1');

    expect(schema.tables[0].columns[0].domainId).toBeUndefined();
  });
});

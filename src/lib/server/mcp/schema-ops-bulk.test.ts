import { describe, it, expect } from 'vitest';
import type { ERDSchema, Table, Column, ColumnDomain } from '$lib/types/erd';
import {
  bulkUpdateTables,
  bulkUpdateColumns,
  bulkAssignDomainByName,
  bulkAssignDomainByPattern,
  bulkAssignDomainByList,
} from './schema-ops';

function emptySchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeTable(name: string, overrides: Partial<Table> = {}): Table {
  return {
    id: name,
    name,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeCol(id: string, name: string, overrides: Partial<Column> = {}): Column {
  return {
    id, name,
    type: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// bulkUpdateTables
// ═══════════════════════════════════════════

describe('bulkUpdateTables', () => {
  it('updates group on multiple tables', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1'), makeTable('t2'), makeTable('t3')];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', group: 'auth' },
      { tableId: 't2', group: 'auth' },
      { tableId: 't3', group: 'billing' },
    ]);
    expect(result.updated).toBe(3);
    expect(result.notFound).toEqual([]);
    expect(result.schema.tables[0].group).toBe('auth');
    expect(result.schema.tables[1].group).toBe('auth');
    expect(result.schema.tables[2].group).toBe('billing');
  });

  it('updates color and comment together', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1'), makeTable('t2')];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', color: 'blue', comment: 'User tables' },
      { tableId: 't2', color: 'red', comment: 'Payment tables' },
    ]);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].color).toBe('blue');
    expect(result.schema.tables[0].comment).toBe('User tables');
    expect(result.schema.tables[1].color).toBe('red');
    expect(result.schema.tables[1].comment).toBe('Payment tables');
  });

  it('clears group with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { group: 'old_group' })];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', group: '' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.schema.tables[0].group).toBeUndefined();
  });

  it('updates schema namespace', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1'), makeTable('t2')];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', schema: 'public' },
      { tableId: 't2', schema: 'auth' },
    ]);
    expect(result.schema.tables[0].schema).toBe('public');
    expect(result.schema.tables[1].schema).toBe('auth');
  });

  it('tracks not found tables', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', group: 'a' },
      { tableId: 'missing1', group: 'b' },
      { tableId: 'missing2', group: 'c' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.notFound).toEqual(['missing1', 'missing2']);
    expect(result.schema.tables[0].group).toBe('a');
  });

  it('returns 0 updated when all not found', () => {
    const s = emptySchema();
    const result = bulkUpdateTables(s, [
      { tableId: 'x', group: 'a' },
      { tableId: 'y', group: 'b' },
    ]);
    expect(result.updated).toBe(0);
    expect(result.notFound).toEqual(['x', 'y']);
  });

  it('only modifies provided fields, leaves others unchanged', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { group: 'original', comment: 'keep me', color: 'green' })];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', group: 'new_group' },
    ]);
    expect(result.schema.tables[0].group).toBe('new_group');
    expect(result.schema.tables[0].comment).toBe('keep me');
    expect(result.schema.tables[0].color).toBe('green');
  });

  it('renames multiple tables', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1'), makeTable('t2')];
    const result = bulkUpdateTables(s, [
      { tableId: 't1', name: 'users' },
      { tableId: 't2', name: 'orders' },
    ]);
    expect(result.schema.tables[0].name).toBe('users');
    expect(result.schema.tables[1].name).toBe('orders');
  });

  it('updates updatedAt timestamp', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1')];
    const result = bulkUpdateTables(s, [{ tableId: 't1', group: 'x' }]);
    expect(result.schema.updatedAt).not.toBe(s.updatedAt);
  });
});

// ═══════════════════════════════════════════
// bulkUpdateColumns
// ═══════════════════════════════════════════

describe('bulkUpdateColumns', () => {
  it('updates columns across different tables', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'name', { type: 'VARCHAR' })] }),
      makeTable('t2', { columns: [makeCol('c2', 'email', { type: 'VARCHAR' })] }),
    ];
    const result = bulkUpdateColumns(s, [
      { tableId: 't1', columnId: 'c1', type: 'TEXT' },
      { tableId: 't2', columnId: 'c2', nullable: true },
    ]);
    expect(result.updated).toBe(2);
    expect(result.notFound).toEqual([]);
    expect(result.schema.tables[0].columns[0].type).toBe('TEXT');
    expect(result.schema.tables[1].columns[0].nullable).toBe(true);
  });

  it('assigns domain to multiple columns', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'user_id')] }),
      makeTable('t2', { columns: [makeCol('c2', 'user_id')] }),
    ];
    const result = bulkUpdateColumns(s, [
      { tableId: 't1', columnId: 'c1', domainId: 'dom_uid' },
      { tableId: 't2', columnId: 'c2', domainId: 'dom_uid' },
    ]);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom_uid');
    expect(result.schema.tables[1].columns[0].domainId).toBe('dom_uid');
  });

  it('tracks not found columns', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'a')] })];
    const result = bulkUpdateColumns(s, [
      { tableId: 't1', columnId: 'c1', type: 'TEXT' },
      { tableId: 't1', columnId: 'missing', type: 'TEXT' },
      { tableId: 'missing_table', columnId: 'c1', type: 'TEXT' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.notFound).toEqual(['t1/missing', 'missing_table/c1']);
  });

  it('returns 0 updated when all not found', () => {
    const s = emptySchema();
    const result = bulkUpdateColumns(s, [
      { tableId: 'x', columnId: 'y', type: 'INT' },
    ]);
    expect(result.updated).toBe(0);
    expect(result.notFound).toEqual(['x/y']);
  });

  it('sets primaryKey and auto-sets nullable=false', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'id', { nullable: true })] })];
    const result = bulkUpdateColumns(s, [
      { tableId: 't1', columnId: 'c1', primaryKey: true },
    ]);
    expect(result.schema.tables[0].columns[0].primaryKey).toBe(true);
    expect(result.schema.tables[0].columns[0].nullable).toBe(false);
  });

  it('updates multiple columns in the same table', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [makeCol('c1', 'a'), makeCol('c2', 'b'), makeCol('c3', 'c')],
    })];
    const result = bulkUpdateColumns(s, [
      { tableId: 't1', columnId: 'c1', comment: 'first' },
      { tableId: 't1', columnId: 'c2', comment: 'second' },
      { tableId: 't1', columnId: 'c3', comment: 'third' },
    ]);
    expect(result.updated).toBe(3);
    expect(result.schema.tables[0].columns[0].comment).toBe('first');
    expect(result.schema.tables[0].columns[1].comment).toBe('second');
    expect(result.schema.tables[0].columns[2].comment).toBe('third');
  });

  it('updates updatedAt timestamp', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'a')] })];
    const result = bulkUpdateColumns(s, [{ tableId: 't1', columnId: 'c1', type: 'TEXT' }]);
    expect(result.schema.updatedAt).not.toBe(s.updatedAt);
  });
});

// ═══════════════════════════════════════════
// bulkAssignDomainByName
// ═══════════════════════════════════════════

describe('bulkAssignDomainByName', () => {
  it('assigns domain to all columns with matching name', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('users', { columns: [makeCol('c1', 'user_id'), makeCol('c2', 'name')] }),
      makeTable('orders', { columns: [makeCol('c3', 'user_id'), makeCol('c4', 'total')] }),
      makeTable('comments', { columns: [makeCol('c5', 'user_id'), makeCol('c6', 'body')] }),
    ];
    const result = bulkAssignDomainByName(s, 'dom_uid', 'user_id');
    expect(result.updated).toBe(3);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom_uid');
    expect(result.schema.tables[0].columns[1].domainId).toBeUndefined();
    expect(result.schema.tables[1].columns[0].domainId).toBe('dom_uid');
    expect(result.schema.tables[2].columns[0].domainId).toBe('dom_uid');
  });

  it('returns 0 when no columns match', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'name')] })];
    const result = bulkAssignDomainByName(s, 'dom', 'nonexistent');
    expect(result.updated).toBe(0);
  });

  it('unlinks domain with empty string', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'email', { domainId: 'dom_email' })] }),
      makeTable('t2', { columns: [makeCol('c2', 'email', { domainId: 'dom_email' })] }),
    ];
    const result = bulkAssignDomainByName(s, '', 'email');
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBeUndefined();
    expect(result.schema.tables[1].columns[0].domainId).toBeUndefined();
  });

  it('respects maxCount limit', () => {
    const s = emptySchema();
    s.tables = Array.from({ length: 5 }, (_, i) =>
      makeTable(`t${i}`, { columns: [makeCol(`c${i}`, 'id')] })
    );
    const result = bulkAssignDomainByName(s, 'dom', 'id', 3);
    expect(result.updated).toBe(3);
    // First 3 tables should have domain, last 2 should not
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom');
    expect(result.schema.tables[1].columns[0].domainId).toBe('dom');
    expect(result.schema.tables[2].columns[0].domainId).toBe('dom');
    expect(result.schema.tables[3].columns[0].domainId).toBeUndefined();
    expect(result.schema.tables[4].columns[0].domainId).toBeUndefined();
  });

  it('matches exact name only, not partial', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [
        makeCol('c1', 'user_id'),
        makeCol('c2', 'user_id_backup'),
        makeCol('c3', 'old_user_id'),
      ],
    })];
    const result = bulkAssignDomainByName(s, 'dom', 'user_id');
    expect(result.updated).toBe(1);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom');
    expect(result.schema.tables[0].columns[1].domainId).toBeUndefined();
    expect(result.schema.tables[0].columns[2].domainId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// bulkAssignDomainByPattern
// ═══════════════════════════════════════════

describe('bulkAssignDomainByPattern', () => {
  it('assigns domain to columns matching suffix pattern', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'user_id'), makeCol('c2', 'name')] }),
      makeTable('t2', { columns: [makeCol('c3', 'order_id'), makeCol('c4', 'total')] }),
    ];
    const result = bulkAssignDomainByPattern(s, 'dom_id', /_id$/);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom_id');
    expect(result.schema.tables[0].columns[1].domainId).toBeUndefined();
    expect(result.schema.tables[1].columns[0].domainId).toBe('dom_id');
    expect(result.schema.tables[1].columns[1].domainId).toBeUndefined();
  });

  it('assigns domain to columns matching prefix pattern', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [
        makeCol('c1', 'created_at'),
        makeCol('c2', 'updated_at'),
        makeCol('c3', 'name'),
      ],
    })];
    const result = bulkAssignDomainByPattern(s, 'dom_ts', /^(created|updated)_at$/);
    expect(result.updated).toBe(2);
  });

  it('returns 0 when pattern matches nothing', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'name')] })];
    const result = bulkAssignDomainByPattern(s, 'dom', /^zzz/);
    expect(result.updated).toBe(0);
  });

  it('respects maxCount limit', () => {
    const s = emptySchema();
    s.tables = Array.from({ length: 10 }, (_, i) =>
      makeTable(`t${i}`, { columns: [makeCol(`c${i}`, `col_${i}`)] })
    );
    const result = bulkAssignDomainByPattern(s, 'dom', /^col_/, 5);
    expect(result.updated).toBe(5);
  });

  it('matches across multiple columns per table', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [
        makeCol('c1', 'email_home'),
        makeCol('c2', 'email_work'),
        makeCol('c3', 'phone'),
      ],
    })];
    const result = bulkAssignDomainByPattern(s, 'dom_email', /^email_/);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom_email');
    expect(result.schema.tables[0].columns[1].domainId).toBe('dom_email');
    expect(result.schema.tables[0].columns[2].domainId).toBeUndefined();
  });

  it('unlinks domain with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [
        makeCol('c1', 'user_id', { domainId: 'old_dom' }),
        makeCol('c2', 'order_id', { domainId: 'old_dom' }),
      ],
    })];
    const result = bulkAssignDomainByPattern(s, '', /_id$/);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBeUndefined();
    expect(result.schema.tables[0].columns[1].domainId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// bulkAssignDomainByList
// ═══════════════════════════════════════════

describe('bulkAssignDomainByList', () => {
  it('assigns domain to explicit column list', () => {
    const s = emptySchema();
    s.tables = [
      makeTable('t1', { columns: [makeCol('c1', 'a'), makeCol('c2', 'b')] }),
      makeTable('t2', { columns: [makeCol('c3', 'c')] }),
    ];
    const result = bulkAssignDomainByList(s, 'dom1', [
      { tableId: 't1', columnId: 'c1' },
      { tableId: 't2', columnId: 'c3' },
    ]);
    expect(result.updated).toBe(2);
    expect(result.schema.tables[0].columns[0].domainId).toBe('dom1');
    expect(result.schema.tables[0].columns[1].domainId).toBeUndefined();
    expect(result.schema.tables[1].columns[0].domainId).toBe('dom1');
  });

  it('skips nonexistent table/column pairs', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', { columns: [makeCol('c1', 'a')] })];
    const result = bulkAssignDomainByList(s, 'dom1', [
      { tableId: 't1', columnId: 'c1' },
      { tableId: 't1', columnId: 'missing' },
      { tableId: 'missing', columnId: 'c1' },
    ]);
    expect(result.updated).toBe(1);
  });

  it('returns 0 when all pairs are invalid', () => {
    const s = emptySchema();
    const result = bulkAssignDomainByList(s, 'dom1', [
      { tableId: 'x', columnId: 'y' },
    ]);
    expect(result.updated).toBe(0);
  });

  it('handles empty column list', () => {
    const s = emptySchema();
    const result = bulkAssignDomainByList(s, 'dom1', []);
    expect(result.updated).toBe(0);
  });

  it('unlinks domain with empty string', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [makeCol('c1', 'a', { domainId: 'old' })],
    })];
    const result = bulkAssignDomainByList(s, '', [
      { tableId: 't1', columnId: 'c1' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.schema.tables[0].columns[0].domainId).toBeUndefined();
  });

  it('overwrites existing domain', () => {
    const s = emptySchema();
    s.tables = [makeTable('t1', {
      columns: [makeCol('c1', 'a', { domainId: 'old_dom' })],
    })];
    const result = bulkAssignDomainByList(s, 'new_dom', [
      { tableId: 't1', columnId: 'c1' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.schema.tables[0].columns[0].domainId).toBe('new_dom');
  });
});

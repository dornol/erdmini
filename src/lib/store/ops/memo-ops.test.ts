import { describe, it, expect, beforeEach } from 'vitest';
import type { ERDSchema, Table, Memo } from '$lib/types/erd';
import {
  createMemo,
  deleteMemoOp,
  deleteMemosOp,
  updateMemoOp,
  attachMemoOp,
  detachMemoOp,
} from '$lib/store/ops/memo-ops';

function makeSchema(tables: Table[] = [], memos: Memo[] = []): ERDSchema {
  return {
    version: '1.0',
    tables,
    domains: [],
    memos,
    groupColors: {},
    schemas: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeMemo(id: string, extra?: Partial<Memo>): Memo {
  return { id, content: '', position: { x: 0, y: 0 }, width: 200, height: 150, ...extra };
}

function makeTable(id: string): Table {
  return {
    id,
    name: `t_${id}`,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 100, y: 200 },
  };
}

describe('createMemo', () => {
  it('creates a memo with correct defaults', () => {
    const schema = makeSchema();
    const memo = createMemo(schema, { x: 50, y: 75 });

    expect(memo.content).toBe('');
    expect(memo.width).toBe(200);
    expect(memo.height).toBe(150);
    expect(memo.position).toEqual({ x: 50, y: 75 });
    expect(memo.id).toBeTruthy();
    expect(memo.id.length).toBe(8);
  });

  it('adds the memo to schema.memos', () => {
    const schema = makeSchema();
    const memo = createMemo(schema, { x: 10, y: 20 });

    expect(schema.memos).toHaveLength(1);
    expect(schema.memos[0]).toBe(memo);
  });

  it('appends to existing memos', () => {
    const existing = makeMemo('m1');
    const schema = makeSchema([], [existing]);
    createMemo(schema, { x: 0, y: 0 });

    expect(schema.memos).toHaveLength(2);
    expect(schema.memos[0].id).toBe('m1');
  });

  it('updates updatedAt', () => {
    const schema = makeSchema();
    const before = schema.updatedAt;
    createMemo(schema, { x: 0, y: 0 });

    expect(schema.updatedAt).not.toBe(before);
  });

  it('assigns schema when activeSchema is provided', () => {
    const schema = makeSchema();
    const memo = createMemo(schema, { x: 0, y: 0 }, 'public');

    expect(memo.schema).toBe('public');
  });

  it('does not set schema when activeSchema is omitted', () => {
    const schema = makeSchema();
    const memo = createMemo(schema, { x: 0, y: 0 });

    expect(memo.schema).toBeUndefined();
  });

  it('does not set schema when activeSchema is empty string', () => {
    const schema = makeSchema();
    const memo = createMemo(schema, { x: 0, y: 0 }, '');

    // empty string is falsy, so no schema assigned
    expect(memo.schema).toBeUndefined();
  });
});

describe('deleteMemoOp', () => {
  it('removes the memo by id', () => {
    const schema = makeSchema([], [makeMemo('m1'), makeMemo('m2')]);
    deleteMemoOp(schema, 'm1');

    expect(schema.memos).toHaveLength(1);
    expect(schema.memos[0].id).toBe('m2');
  });

  it('no-op for nonexistent id', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    deleteMemoOp(schema, 'nonexistent');

    expect(schema.memos).toHaveLength(1);
  });

  it('updates updatedAt', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    const before = schema.updatedAt;
    deleteMemoOp(schema, 'm1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('handles empty memos array', () => {
    const schema = makeSchema();
    deleteMemoOp(schema, 'any');

    expect(schema.memos).toHaveLength(0);
  });
});

describe('deleteMemosOp', () => {
  it('removes multiple memos', () => {
    const schema = makeSchema([], [makeMemo('m1'), makeMemo('m2'), makeMemo('m3')]);
    deleteMemosOp(schema, ['m1', 'm3']);

    expect(schema.memos).toHaveLength(1);
    expect(schema.memos[0].id).toBe('m2');
  });

  it('removes all when all ids match', () => {
    const schema = makeSchema([], [makeMemo('m1'), makeMemo('m2')]);
    deleteMemosOp(schema, ['m1', 'm2']);

    expect(schema.memos).toHaveLength(0);
  });

  it('ignores nonexistent ids', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    deleteMemosOp(schema, ['m1', 'nonexistent']);

    expect(schema.memos).toHaveLength(0);
  });

  it('handles empty ids array', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    deleteMemosOp(schema, []);

    expect(schema.memos).toHaveLength(1);
  });

  it('updates updatedAt', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    const before = schema.updatedAt;
    deleteMemosOp(schema, ['m1']);

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('updateMemoOp', () => {
  it('patches content', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    updateMemoOp(schema, 'm1', { content: 'Hello world' });

    expect(schema.memos[0].content).toBe('Hello world');
  });

  it('patches color', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    updateMemoOp(schema, 'm1', { color: '#ff0000' });

    expect(schema.memos[0].color).toBe('#ff0000');
  });

  it('patches width and height', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    updateMemoOp(schema, 'm1', { width: 300, height: 250 });

    expect(schema.memos[0].width).toBe(300);
    expect(schema.memos[0].height).toBe(250);
  });

  it('patches position', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    updateMemoOp(schema, 'm1', { position: { x: 99, y: 88 } });

    expect(schema.memos[0].position).toEqual({ x: 99, y: 88 });
  });

  it('patches multiple fields at once', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    updateMemoOp(schema, 'm1', { content: 'test', color: 'blue', locked: true });

    expect(schema.memos[0].content).toBe('test');
    expect(schema.memos[0].color).toBe('blue');
    expect(schema.memos[0].locked).toBe(true);
  });

  it('no-op for nonexistent memo', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    const before = schema.updatedAt;
    updateMemoOp(schema, 'nonexistent', { content: 'test' });

    // updatedAt is NOT updated since memo was not found
    expect(schema.updatedAt).toBe(before);
    expect(schema.memos[0].content).toBe('');
  });

  it('updates updatedAt on valid patch', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    const before = schema.updatedAt;
    updateMemoOp(schema, 'm1', { content: 'changed' });

    expect(schema.updatedAt).not.toBe(before);
  });
});

describe('attachMemoOp', () => {
  it('sets attachedTableId on memo', () => {
    const schema = makeSchema([makeTable('t1')], [makeMemo('m1')]);
    attachMemoOp(schema, 'm1', 't1');

    expect(schema.memos[0].attachedTableId).toBe('t1');
  });

  it('overwrites existing attachedTableId', () => {
    const schema = makeSchema(
      [makeTable('t1'), makeTable('t2')],
      [makeMemo('m1', { attachedTableId: 't1' })],
    );
    attachMemoOp(schema, 'm1', 't2');

    expect(schema.memos[0].attachedTableId).toBe('t2');
  });

  it('no-op for nonexistent memo', () => {
    const schema = makeSchema([makeTable('t1')], []);
    const before = schema.updatedAt;
    attachMemoOp(schema, 'nonexistent', 't1');

    expect(schema.updatedAt).toBe(before);
  });

  it('updates updatedAt', () => {
    const schema = makeSchema([makeTable('t1')], [makeMemo('m1')]);
    const before = schema.updatedAt;
    attachMemoOp(schema, 'm1', 't1');

    expect(schema.updatedAt).not.toBe(before);
  });

  it('no-op when target table does not exist (collab race condition)', () => {
    const schema = makeSchema([], [makeMemo('m1')]);
    const before = schema.updatedAt;
    attachMemoOp(schema, 'm1', 'deleted-table');

    expect(schema.memos[0].attachedTableId).toBeUndefined();
    expect(schema.updatedAt).toBe(before);
  });
});

describe('detachMemoOp', () => {
  it('clears attachedTableId and returns previous tableId', () => {
    const table = makeTable('t1');
    const memo = makeMemo('m1', { attachedTableId: 't1' });
    const schema = makeSchema([table], [memo]);

    const result = detachMemoOp(schema, 'm1');

    expect(result).toBe('t1');
    expect(schema.memos[0].attachedTableId).toBeUndefined();
  });

  it('repositions memo above table (x=table.x, y=table.y - memo.height - 12)', () => {
    const table = makeTable('t1'); // position: { x: 100, y: 200 }
    const memo = makeMemo('m1', { attachedTableId: 't1', height: 150 });
    const schema = makeSchema([table], [memo]);

    detachMemoOp(schema, 'm1');

    expect(schema.memos[0].position.x).toBe(100);
    expect(schema.memos[0].position.y).toBe(200 - 150 - 12); // 38
  });

  it('repositions correctly with different memo height', () => {
    const table = makeTable('t1');
    const memo = makeMemo('m1', { attachedTableId: 't1', height: 300 });
    const schema = makeSchema([table], [memo]);

    detachMemoOp(schema, 'm1');

    expect(schema.memos[0].position.x).toBe(100);
    expect(schema.memos[0].position.y).toBe(200 - 300 - 12); // -112
  });

  it('returns undefined for nonexistent memo', () => {
    const schema = makeSchema();
    const result = detachMemoOp(schema, 'nonexistent');

    expect(result).toBeUndefined();
  });

  it('handles memo not attached to any table', () => {
    const memo = makeMemo('m1', { position: { x: 50, y: 60 } });
    const schema = makeSchema([], [memo]);

    const result = detachMemoOp(schema, 'm1');

    expect(result).toBeUndefined();
    expect(schema.memos[0].attachedTableId).toBeUndefined();
    // position should remain unchanged since no table to reposition relative to
    expect(schema.memos[0].position).toEqual({ x: 50, y: 60 });
  });

  it('handles attached tableId referencing nonexistent table', () => {
    const memo = makeMemo('m1', { attachedTableId: 'deleted_table', position: { x: 10, y: 20 } });
    const schema = makeSchema([], [memo]);

    const result = detachMemoOp(schema, 'm1');

    expect(result).toBe('deleted_table');
    expect(schema.memos[0].attachedTableId).toBeUndefined();
    // position unchanged since table not found
    expect(schema.memos[0].position).toEqual({ x: 10, y: 20 });
  });

  it('updates updatedAt', () => {
    const memo = makeMemo('m1', { attachedTableId: 't1' });
    const schema = makeSchema([makeTable('t1')], [memo]);
    const before = schema.updatedAt;

    detachMemoOp(schema, 'm1');

    expect(schema.updatedAt).not.toBe(before);
  });
});

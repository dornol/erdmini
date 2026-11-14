import { describe, expect, it } from 'vitest';
import { OperationAcknowledgements } from './operation-acknowledgements';
import type { CollabOperation } from '$lib/types/collab';

const rename = (name: string): CollabOperation => ({ kind: 'update-table-name', tableId: 'table', name });

describe('server operation acknowledgements', () => {
  it('returns the accepted overwrite once and ignores unknown or duplicate acknowledgements', () => {
    const pending = new OperationAcknowledgements();
    expect(pending.register('one', rename('accepted'))).toBe(true);
    expect(pending.acknowledge('unknown')).toBeNull();
    expect(pending.acknowledge('one')).toEqual(rename('accepted'));
    expect(pending.acknowledge('one')).toBeNull();
  });

  it('does not replay an older write over a newer optimistic edit of the same field', () => {
    const pending = new OperationAcknowledgements();
    pending.register('one', rename('older'));
    pending.register('two', rename('newer'));
    expect(pending.acknowledge('one')).toBeNull();
    expect(pending.acknowledge('two')).toEqual(rename('newer'));
  });

  it('keeps independent fields when only part of an earlier patch has been superseded', () => {
    const pending = new OperationAcknowledgements();
    pending.register('one', { kind: 'update-column', tableId: 'table', columnId: 'column', patch: { name: 'older', nullable: true } });
    pending.register('two', { kind: 'update-column', tableId: 'table', columnId: 'column', patch: { name: 'newer' } });
    expect(pending.acknowledge('one')).toEqual({ kind: 'update-column', tableId: 'table', columnId: 'column', patch: { nullable: true } });
    expect(pending.acknowledge('two')).toEqual({ kind: 'update-column', tableId: 'table', columnId: 'column', patch: { name: 'newer' } });
  });

  it('does not confuse equal field names on different objects or field patches', () => {
    const pending = new OperationAcknowledgements();
    const a: CollabOperation = { kind: 'update-db-object', objectId: 'a', updates: { name: 'A', sql: 'select 1' } };
    const b: CollabOperation = { kind: 'update-db-object', objectId: 'b', updates: { name: 'B' } };
    pending.register('a', a); pending.register('b', b);
    expect(pending.acknowledge('a')).toEqual(a);
    expect(pending.acknowledge('b')).toEqual(b);
  });

  it('never replays structural edits or empty patches', () => {
    const pending = new OperationAcknowledgements();
    expect(pending.register('delete', { kind: 'delete-table', tableId: 'table' })).toBe(false);
    expect(pending.register('reorder', { kind: 'move-column', tableId: 'table', columnId: 'column', toIndex: 1 })).toBe(false);
    expect(pending.register('empty', { kind: 'update-column', tableId: 'table', columnId: 'column', patch: {} })).toBe(false);
    expect(pending.acknowledge('delete')).toBeNull();
  });

  it('discards old-project and old-connection acknowledgements on reset', () => {
    const pending = new OperationAcknowledgements();
    pending.register('old', rename('previous project'));
    pending.reset();
    pending.register('new', rename('current project'));
    expect(pending.acknowledge('old')).toBeNull();
    expect(pending.acknowledge('new')).toEqual(rename('current project'));
  });
});


describe('position acknowledgements', () => {
  it('keeps untouched group positions when a newer single-table move supersedes one member', () => {
    const pending = new OperationAcknowledgements();
    pending.register('group', { kind: 'move-tables', moves: [{ tableId: 'a', x: 10, y: 20 }, { tableId: 'b', x: 30, y: 40 }] });
    pending.register('single', { kind: 'move-table', tableId: 'a', x: 50, y: 60 });
    expect(pending.acknowledge('group')).toEqual({ kind: 'move-tables', moves: [{ tableId: 'b', x: 30, y: 40 }] });
    expect(pending.acknowledge('single')).toEqual({ kind: 'move-table', tableId: 'a', x: 50, y: 60 });
  });

  it('a newer group move supersedes an older single move using the same position field', () => {
    const pending = new OperationAcknowledgements();
    pending.register('single', { kind: 'move-table', tableId: 'a', x: 10, y: 20 });
    const group: CollabOperation = { kind: 'move-tables', moves: [{ tableId: 'a', x: 30, y: 40 }, { tableId: 'b', x: 50, y: 60 }] };
    pending.register('group', group);
    expect(pending.acknowledge('single')).toBeNull();
    expect(pending.acknowledge('group')).toEqual(group);
  });
});


describe('memo position acknowledgements', () => {
  it('snapshots detached position and attachment state without replaying the action', () => {
    const pending = new OperationAcknowledgements();
    const position = { x: 0, y: -30 };
    expect(pending.register('detach', { kind: 'detach-memo', memoId: 'a', position })).toBe(true);
    position.x = 999;
    expect(pending.acknowledge('detach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: null, position: { x: 0, y: -30 } } });
  });

  it('leaves legacy and invalid detached positions untracked', () => {
    const pending = new OperationAcknowledgements();
    expect(pending.register('legacy', { kind: 'detach-memo', memoId: 'a' })).toBe(false);
    expect(pending.register('infinite', { kind: 'detach-memo', memoId: 'a', position: { x: Infinity, y: 20 } })).toBe(false);
    expect(pending.register('nan', { kind: 'detach-memo', memoId: 'a', position: { x: 10, y: NaN } })).toBe(false);
    expect(pending.acknowledge('legacy')).toBeNull();
  });

  it('retains other group positions when a later detachment supersedes one memo', () => {
    const pending = new OperationAcknowledgements();
    pending.register('group', { kind: 'move-memos', moves: [{ memoId: 'a', x: 10, y: 20 }, { memoId: 'b', x: 30, y: 40 }] });
    pending.register('detach', { kind: 'detach-memo', memoId: 'a', position: { x: 50, y: 60 } });
    expect(pending.acknowledge('group')).toEqual({ kind: 'move-memos', moves: [{ memoId: 'b', x: 30, y: 40 }] });
    expect(pending.acknowledge('detach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: null, position: { x: 50, y: 60 } } });
  });

  it('retains detached attachment state when a newer group movement supersedes its position', () => {
    const pending = new OperationAcknowledgements();
    pending.register('detach', { kind: 'detach-memo', memoId: 'a', position: { x: 50, y: 60 } });
    const group: CollabOperation = { kind: 'move-memos', moves: [{ memoId: 'a', x: 10, y: 20 }, { memoId: 'b', x: 30, y: 40 }] };
    pending.register('group', group);
    expect(pending.acknowledge('detach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: null } });
    expect(pending.acknowledge('group')).toEqual(group);
  });

  it('retains detached position when a newer attachment supersedes only the link', () => {
    const pending = new OperationAcknowledgements();
    pending.register('detach', { kind: 'detach-memo', memoId: 'a', position: { x: 10, y: 20 } });
    pending.register('attach', { kind: 'attach-memo', memoId: 'a', tableId: 'new' });
    expect(pending.acknowledge('detach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { position: { x: 10, y: 20 } } });
    expect(pending.acknowledge('attach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: 'new' } });
  });

  it('discards detached state when both fields have newer local writes', () => {
    const pending = new OperationAcknowledgements();
    pending.register('detach', { kind: 'detach-memo', memoId: 'a', position: { x: 10, y: 20 } });
    const move: CollabOperation = { kind: 'move-memo', memoId: 'a', x: 30, y: 40 };
    pending.register('move', move);
    pending.register('attach', { kind: 'attach-memo', memoId: 'a', tableId: 'new' });
    expect(pending.acknowledge('detach')).toBeNull();
    expect(pending.acknowledge('move')).toEqual(move);
    expect(pending.acknowledge('attach')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: 'new' } });
  });

  it('does not restore an attachment superseded by a newer attachment', () => {
    const pending = new OperationAcknowledgements();
    pending.register('old', { kind: 'attach-memo', memoId: 'a', tableId: 'old' });
    pending.register('new', { kind: 'attach-memo', memoId: 'a', tableId: 'new' });
    expect(pending.acknowledge('old')).toBeNull();
    expect(pending.acknowledge('new')).toEqual({ kind: 'memo-state', memoId: 'a', patch: { attachedTableId: 'new' } });
  });

  it('keeps other group positions when a later memo patch supersedes one position', () => {
    const pending = new OperationAcknowledgements();
    pending.register('group', { kind: 'move-memos', moves: [{ memoId: 'a', x: 10, y: 20 }, { memoId: 'b', x: 30, y: 40 }] });
    const patch: CollabOperation = { kind: 'update-memo', memoId: 'a', patch: { position: { x: 50, y: 60 } } };
    pending.register('patch', patch);
    expect(pending.acknowledge('group')).toEqual({ kind: 'move-memos', moves: [{ memoId: 'b', x: 30, y: 40 }] });
    expect(pending.acknowledge('patch')).toEqual(patch);
  });

  it('does not discard unrelated memo content when a newer movement supersedes its position', () => {
    const pending = new OperationAcknowledgements();
    pending.register('patch', { kind: 'update-memo', memoId: 'a', patch: { content: 'Keep me', position: { x: 10, y: 20 } } });
    const move: CollabOperation = { kind: 'move-memo', memoId: 'a', x: 50, y: 60 };
    pending.register('move', move);
    expect(pending.acknowledge('patch')).toEqual({ kind: 'update-memo', memoId: 'a', patch: { content: 'Keep me' } });
    expect(pending.acknowledge('move')).toEqual(move);
  });

  it('isolates table and memo positions even when their IDs match', () => {
    const pending = new OperationAcknowledgements();
    const table: CollabOperation = { kind: 'move-table', tableId: 'same', x: 10, y: 20 };
    const memo: CollabOperation = { kind: 'move-memo', memoId: 'same', x: 30, y: 40 };
    pending.register('table', table); pending.register('memo', memo);
    expect(pending.acknowledge('table')).toEqual(table);
    expect(pending.acknowledge('memo')).toEqual(memo);
  });
});

describe('column-order acknowledgements', () => {
  it('ignores an earlier order superseded by a newer local reorder', () => {
    const pending = new OperationAcknowledgements();
    pending.register('old', { kind: 'move-column', tableId: 'table', columnId: 'a', toIndex: 1, columnIds: ['b', 'a', 'c'] });
    const latest: CollabOperation = { kind: 'move-column', tableId: 'table', columnId: 'c', toIndex: 0, columnIds: ['c', 'b', 'a'] };
    pending.register('new', latest);
    expect(pending.acknowledge('old')).toBeNull();
    expect(pending.acknowledge('new')).toEqual(latest);
  });

  it('isolates full orders of different tables and leaves legacy index moves untracked', () => {
    const pending = new OperationAcknowledgements();
    const first: CollabOperation = { kind: 'move-column', tableId: 'first', columnId: 'a', toIndex: 1, columnIds: ['b', 'a'] };
    const second: CollabOperation = { ...first, tableId: 'second' };
    pending.register('first', first); pending.register('second', second);
    expect(pending.register('legacy', { kind: 'move-column', tableId: 'first', columnId: 'a', toIndex: 1 })).toBe(false);
    expect(pending.acknowledge('first')).toEqual(first);
    expect(pending.acknowledge('second')).toEqual(second);
  });
});

describe('namespace and category order acknowledgements', () => {
  it('replays only the latest namespace order', () => {
    const pending = new OperationAcknowledgements();
    pending.register('old', { kind: 'reorder-schemas', schemas: ['beta', 'alpha', 'gamma'] });
    const latest: CollabOperation = { kind: 'reorder-schemas', schemas: ['gamma', 'beta', 'alpha'] };
    pending.register('new', latest);
    expect(pending.acknowledge('old')).toBeNull();
    expect(pending.acknowledge('new')).toEqual(latest);
  });

  it('keeps category order independent from namespace order', () => {
    const pending = new OperationAcknowledgements();
    const schemas: CollabOperation = { kind: 'reorder-schemas', schemas: ['beta', 'alpha'] };
    const categories: CollabOperation = { kind: 'reorder-db-object-categories', categories: ['Functions', 'Views'] };
    pending.register('schemas', schemas); pending.register('categories', categories);
    expect(pending.acknowledge('schemas')).toEqual(schemas);
    expect(pending.acknowledge('categories')).toEqual(categories);
  });
});

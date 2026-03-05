import { describe, it, expect } from 'vitest';
import { applyMemoPatch, MEMO_PATCH_FIELDS } from './memo-patch';
import type { Memo } from '$lib/types/erd';

function makeMemo(overrides?: Partial<Memo>): Memo {
  return {
    id: 'memo1',
    content: 'original',
    position: { x: 100, y: 200 },
    width: 200,
    height: 150,
    color: '#fff',
    locked: false,
    attachedTableId: undefined,
    schema: undefined,
    ...overrides,
  };
}

describe('MEMO_PATCH_FIELDS', () => {
  it('contains exactly the allowed fields', () => {
    expect([...MEMO_PATCH_FIELDS].sort()).toEqual(
      ['color', 'content', 'height', 'locked', 'width']
    );
  });

  it('does not include id', () => {
    expect(MEMO_PATCH_FIELDS).not.toContain('id');
  });

  it('does not include position', () => {
    expect(MEMO_PATCH_FIELDS).not.toContain('position');
  });

  it('does not include attachedTableId', () => {
    expect(MEMO_PATCH_FIELDS).not.toContain('attachedTableId');
  });

  it('does not include schema', () => {
    expect(MEMO_PATCH_FIELDS).not.toContain('schema');
  });
});

describe('applyMemoPatch', () => {
  it('applies content change', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { content: 'updated' });
    expect(memo.content).toBe('updated');
  });

  it('applies color change', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { color: '#ff0000' });
    expect(memo.color).toBe('#ff0000');
  });

  it('applies width change', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { width: 300 });
    expect(memo.width).toBe(300);
  });

  it('applies height change', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { height: 400 });
    expect(memo.height).toBe(400);
  });

  it('applies locked change', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { locked: true });
    expect(memo.locked).toBe(true);
  });

  it('applies multiple allowed fields at once', () => {
    const memo = makeMemo();
    const count = applyMemoPatch(memo, { content: 'new', color: 'blue', width: 500 });
    expect(memo.content).toBe('new');
    expect(memo.color).toBe('blue');
    expect(memo.width).toBe(500);
    expect(count).toBe(3);
  });

  it('returns number of fields applied', () => {
    const memo = makeMemo();
    expect(applyMemoPatch(memo, { content: 'x' })).toBe(1);
    expect(applyMemoPatch(memo, { width: 1, height: 2 })).toBe(2);
  });

  it('returns 0 when patch has no allowed fields', () => {
    const memo = makeMemo();
    expect(applyMemoPatch(memo, { position: { x: 999, y: 999 } } as any)).toBe(0);
  });

  // Security: blocked fields
  it('blocks id from being overwritten', () => {
    const memo = makeMemo({ id: 'original-id' });
    applyMemoPatch(memo, { id: 'hacked-id' } as any);
    expect(memo.id).toBe('original-id');
  });

  it('blocks position from being overwritten', () => {
    const memo = makeMemo({ position: { x: 100, y: 200 } });
    applyMemoPatch(memo, { position: { x: 999, y: 999 } } as any);
    expect(memo.position).toEqual({ x: 100, y: 200 });
  });

  it('blocks attachedTableId from being overwritten', () => {
    const memo = makeMemo({ attachedTableId: 'table1' });
    applyMemoPatch(memo, { attachedTableId: 'hacked-table' } as any);
    expect(memo.attachedTableId).toBe('table1');
  });

  it('blocks schema from being overwritten', () => {
    const memo = makeMemo({ schema: 'public' });
    applyMemoPatch(memo, { schema: 'hacked-schema' } as any);
    expect(memo.schema).toBe('public');
  });

  it('blocks arbitrary unknown fields from being injected', () => {
    const memo = makeMemo();
    applyMemoPatch(memo, { __proto__: { admin: true } } as any);
    expect((memo as any).admin).toBeUndefined();

    applyMemoPatch(memo, { constructor: 'evil' } as any);
    expect((memo as any).constructor).not.toBe('evil');
  });

  it('mixed allowed and blocked fields: only applies allowed', () => {
    const memo = makeMemo({ id: 'keep-me', position: { x: 10, y: 20 } });
    const count = applyMemoPatch(memo, {
      content: 'new-content',
      id: 'overwrite-attempt',
      position: { x: 999, y: 999 },
      color: 'red',
      attachedTableId: 'evil-table',
    } as any);

    expect(count).toBe(2); // only content and color
    expect(memo.content).toBe('new-content');
    expect(memo.color).toBe('red');
    expect(memo.id).toBe('keep-me');
    expect(memo.position).toEqual({ x: 10, y: 20 });
    expect(memo.attachedTableId).toBeUndefined();
  });

  it('does not modify memo when patch is empty object', () => {
    const memo = makeMemo();
    const original = { ...memo };
    const count = applyMemoPatch(memo, {});
    expect(count).toBe(0);
    expect(memo).toEqual(original);
  });

  it('allows setting color to undefined', () => {
    const memo = makeMemo({ color: '#fff' });
    applyMemoPatch(memo, { color: undefined });
    expect(memo.color).toBeUndefined();
  });

  it('allows setting locked to false', () => {
    const memo = makeMemo({ locked: true });
    applyMemoPatch(memo, { locked: false });
    expect(memo.locked).toBe(false);
  });
});

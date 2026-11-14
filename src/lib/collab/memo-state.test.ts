import { describe, expect, it } from 'vitest';
import type { Memo } from '$lib/types/erd';
import { applyMemoState } from './memo-state';

const tables = [{ id: 'old' }, { id: 'new' }];
function memo(): Memo {
  return { id: 'note', content: 'Keep me', color: 'blue', width: 180, height: 100,
    position: { x: 100, y: 200 }, attachedTableId: 'old', locked: true };
}

describe('acknowledged memo field state', () => {
  it('moves without detaching or changing unrelated metadata', () => {
    const note = memo();
    applyMemoState(note, { position: { x: 0, y: -20 } }, tables);
    expect(note).toEqual({ ...memo(), position: { x: 0, y: -20 } });
  });

  it('changes attachment without recalculating position', () => {
    const note = memo();
    applyMemoState(note, { attachedTableId: 'new' }, tables);
    expect(note).toEqual({ ...memo(), attachedTableId: 'new' });
  });

  it('clears attachment without moving when only the link is acknowledged', () => {
    const note = memo();
    applyMemoState(note, { attachedTableId: null }, tables);
    expect(note).toEqual({ ...memo(), attachedTableId: undefined });
  });

  it('clears a stale link when the accepted target was deleted while preserving the accepted position', () => {
    const note = memo();
    applyMemoState(note, { attachedTableId: 'deleted', position: { x: 30, y: 40 } }, tables);
    expect(note).toEqual({ ...memo(), attachedTableId: undefined, position: { x: 30, y: 40 } });
  });

  it('ignores nonfinite coordinates without discarding a valid attachment change', () => {
    for (const position of [{ x: Infinity, y: 1 }, { x: 1, y: NaN }]) {
      const note = memo();
      applyMemoState(note, { attachedTableId: 'new', position }, tables);
      expect(note).toEqual({ ...memo(), attachedTableId: 'new' });
    }
  });

  it('copies accepted coordinates so later patch mutations do not move the memo', () => {
    const note = memo();
    const position = { x: 30, y: 40 };
    applyMemoState(note, { position }, tables);
    position.x = 900;
    expect(note.position).toEqual({ x: 30, y: 40 });
  });
});

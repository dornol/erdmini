import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSchema, erdStore } from './erd.svelte';

function state(version: number) {
  return { ...defaultSchema(), version: String(version) };
}
function prepareHistory() {
  for (let i = 1; i <= 3; i++) {
    erdStore.pushSnapshotRaw(JSON.stringify(state(i - 1)), `edit_${i}`, `detail_${i}`);
    erdStore.schema = state(i);
  }
}

describe('history navigation', () => {
  beforeEach(() => {
    erdStore.clearHistory();
    erdStore.schema = state(0);
    erdStore._isLoadingSchema = false;
    erdStore._isUndoRedoing = false;
    erdStore._isRemoteOp = false;
  });

  it('jumping backwards preserves every redo state and its operation label', () => {
    prepareHistory();
    erdStore.jumpToHistory(0);
    expect(erdStore.schema.version).toBe('0');
    for (let i = 1; i <= 3; i++) {
      expect(erdStore.redoEntries.at(-1)).toMatchObject({ label: `edit_${i}`, detail: `detail_${i}` });
      erdStore.redo();
      expect(erdStore.schema.version).toBe(String(i));
    }
    expect(erdStore.canRedo).toBe(false);
    erdStore.undo();
    expect(erdStore.schema.version).toBe('2');
    expect(erdStore.redoEntries.at(-1)?.label).toBe('edit_3');
  });

  it('jumping with an existing redo stack keeps its future after the intermediate states', () => {
    prepareHistory();
    erdStore.undo();
    erdStore.jumpToHistory(0);
    for (const version of ['1', '2', '3']) {
      erdStore.redo();
      expect(erdStore.schema.version).toBe(version);
    }
    expect(erdStore.canRedo).toBe(false);
  });

  it('a partial jump keeps the earlier undo history and emits the final schema once', () => {
    prepareHistory();
    const beforeOps = erdStore._opVersion;
    erdStore.jumpToHistory(1);
    expect(erdStore.schema.version).toBe('1');
    expect(erdStore.historyEntries.map(e => e.label)).toEqual(['edit_1']);
    expect(erdStore._opVersion - beforeOps).toBe(1);
    erdStore.redo();
    expect(erdStore.schema.version).toBe('2');
    erdStore.redo();
    expect(erdStore.schema.version).toBe('3');
  });
});

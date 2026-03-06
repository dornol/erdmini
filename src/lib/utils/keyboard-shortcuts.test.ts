import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock paraglide messages
vi.mock('$lib/paraglide/messages', () => ({
  dialog_delete_table_confirm: ({ name }: { name: string }) => `Delete ${name}?`,
  dialog_delete_table_title: () => 'Delete Table',
  action_delete: () => 'Delete',
  dialog_bulk_delete_confirm: ({ count }: { count: number }) => `Delete ${count} tables?`,
  dialog_delete_memo_confirm: () => 'Delete memo?',
  dialog_delete_memos_confirm: ({ count }: { count: number }) => `Delete ${count} memos?`,
}));

// Stub window for zoom calculations
vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });

import { handleKeydown, type KeyboardContext } from './keyboard-shortcuts';

function makeCtx(overrides: Partial<KeyboardContext> = {}): KeyboardContext {
  return {
    erdStore: {
      schema: { tables: [], memos: [], domains: [], schemas: [] },
      selectedTableId: null,
      selectedTableIds: new Set<string>(),
      selectedMemoId: null,
      selectedMemoIds: new Set<string>(),
      undo: vi.fn(),
      redo: vi.fn(),
      duplicateTable: vi.fn(),
      deleteTable: vi.fn(),
      deleteTables: vi.fn(),
      deleteMemo: vi.fn(),
      deleteMemos: vi.fn(),
      pasteTablesFromClipboard: vi.fn(),
    },
    canvasState: { x: 0, y: 0, scale: 1 },
    dialogStore: { confirm: vi.fn().mockResolvedValue(true) },
    isReadOnly: false,
    fullscreenMode: false,
    commandPaletteOpen: false,
    setFullscreen: vi.fn(),
    setCommandPalette: vi.fn(),
    ...overrides,
  };
}

function keyEvent(key: string, opts: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string; tagName: string }> = {}): KeyboardEvent {
  const e = {
    key,
    code: opts.code ?? `Key${key.toUpperCase()}`,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    target: { tagName: opts.tagName ?? 'DIV' },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  return e;
}

describe('handleKeydown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Fullscreen toggle ──

  it('F key toggles fullscreen', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('f', { code: 'KeyF' }), ctx);
    expect(ctx.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('F key does not toggle fullscreen when editing in input', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('f', { code: 'KeyF', tagName: 'INPUT' }), ctx);
    expect(ctx.setFullscreen).not.toHaveBeenCalled();
  });

  it('F key does not toggle fullscreen when editing in textarea', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('f', { code: 'KeyF', tagName: 'TEXTAREA' }), ctx);
    expect(ctx.setFullscreen).not.toHaveBeenCalled();
  });

  // ── Escape ──

  it('Escape exits fullscreen first', async () => {
    const ctx = makeCtx({ fullscreenMode: true });
    await handleKeydown(keyEvent('Escape'), ctx);
    expect(ctx.setFullscreen).toHaveBeenCalledWith(false);
  });

  it('Escape deselects when not in fullscreen', async () => {
    const ctx = makeCtx();
    ctx.erdStore.selectedTableId = 't1';
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    ctx.erdStore.selectedMemoId = 'm1';
    ctx.erdStore.selectedMemoIds = new Set(['m1']);
    await handleKeydown(keyEvent('Escape'), ctx);
    expect(ctx.erdStore.selectedTableId).toBeNull();
    expect(ctx.erdStore.selectedTableIds.size).toBe(0);
    expect(ctx.erdStore.selectedMemoId).toBeNull();
    expect(ctx.erdStore.selectedMemoIds.size).toBe(0);
  });

  it('Escape does nothing when editing', async () => {
    const ctx = makeCtx();
    ctx.erdStore.selectedTableId = 't1';
    await handleKeydown(keyEvent('Escape', { tagName: 'INPUT' }), ctx);
    // selectedTableId should remain since editing blocks ESC handler
    expect(ctx.erdStore.selectedTableId).toBe('t1');
  });

  // ── Fullscreen mode blocks editing shortcuts but allows zoom/pan/palette ──

  it('Ctrl+K opens command palette in fullscreen', async () => {
    const ctx = makeCtx({ fullscreenMode: true });
    await handleKeydown(keyEvent('k', { ctrlKey: true }), ctx);
    expect(ctx.setCommandPalette).toHaveBeenCalledWith(true);
  });

  it('zoom keys work in fullscreen', async () => {
    const ctx = makeCtx({ fullscreenMode: true });
    await handleKeydown(keyEvent('+'), ctx);
    expect(ctx.canvasState.scale).toBeGreaterThan(1);
  });

  it('arrow keys pan in fullscreen', async () => {
    const ctx = makeCtx({ fullscreenMode: true });
    await handleKeydown(keyEvent('ArrowLeft'), ctx);
    expect(ctx.canvasState.x).toBe(60);
  });

  it('undo blocked in fullscreen', async () => {
    const ctx = makeCtx({ fullscreenMode: true });
    await handleKeydown(keyEvent('z', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.undo).not.toHaveBeenCalled();
  });

  // ── Command palette ──

  it('Ctrl+K toggles command palette on', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('k', { ctrlKey: true }), ctx);
    expect(ctx.setCommandPalette).toHaveBeenCalledWith(true);
  });

  it('Ctrl+F toggles command palette off when open', async () => {
    const ctx = makeCtx({ commandPaletteOpen: true });
    await handleKeydown(keyEvent('f', { ctrlKey: true }), ctx);
    expect(ctx.setCommandPalette).toHaveBeenCalledWith(false);
  });

  // ── Undo/Redo ──

  it('Ctrl+Z calls undo', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('z', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.undo).toHaveBeenCalled();
  });

  it('Ctrl+Shift+Z calls redo', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('z', { ctrlKey: true, shiftKey: true }), ctx);
    expect(ctx.erdStore.redo).toHaveBeenCalled();
  });

  it('Ctrl+Y calls redo', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('y', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.redo).toHaveBeenCalled();
  });

  it('Ctrl+Z does nothing when editing', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('z', { ctrlKey: true, tagName: 'INPUT' }), ctx);
    expect(ctx.erdStore.undo).not.toHaveBeenCalled();
  });

  it('Ctrl+Z does nothing in readOnly mode', async () => {
    const ctx = makeCtx({ isReadOnly: true });
    await handleKeydown(keyEvent('z', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.undo).not.toHaveBeenCalled();
  });

  // ── Select all ──

  it('Ctrl+A selects all tables and memos', async () => {
    const ctx = makeCtx();
    ctx.erdStore.schema.tables = [
      { id: 't1', name: 'a' } as any,
      { id: 't2', name: 'b' } as any,
    ];
    ctx.erdStore.schema.memos = [{ id: 'm1' } as any];
    await handleKeydown(keyEvent('a', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.selectedTableIds).toEqual(new Set(['t1', 't2']));
    expect(ctx.erdStore.selectedTableId).toBe('t1');
    expect(ctx.erdStore.selectedMemoIds).toEqual(new Set(['m1']));
  });

  it('Ctrl+A does nothing when editing', async () => {
    const ctx = makeCtx();
    ctx.erdStore.schema.tables = [{ id: 't1', name: 'a' } as any];
    await handleKeydown(keyEvent('a', { ctrlKey: true, tagName: 'INPUT' }), ctx);
    expect(ctx.erdStore.selectedTableIds.size).toBe(0);
  });

  // ── Duplicate ──

  it('Ctrl+D duplicates selected tables', async () => {
    const ctx = makeCtx();
    ctx.erdStore.selectedTableIds = new Set(['t1', 't2']);
    await handleKeydown(keyEvent('d', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.duplicateTable).toHaveBeenCalledTimes(2);
  });

  it('Ctrl+D does nothing in readOnly', async () => {
    const ctx = makeCtx({ isReadOnly: true });
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    await handleKeydown(keyEvent('d', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.duplicateTable).not.toHaveBeenCalled();
  });

  // ── Delete ──

  it('Delete key deletes single selected table after confirm', async () => {
    const ctx = makeCtx();
    ctx.erdStore.schema.tables = [{ id: 't1', name: 'users' } as any];
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.dialogStore.confirm).toHaveBeenCalled();
    expect(ctx.erdStore.deleteTable).toHaveBeenCalledWith('t1');
  });

  it('Delete key deletes multiple tables via deleteTables', async () => {
    const ctx = makeCtx();
    ctx.erdStore.schema.tables = [
      { id: 't1', name: 'a' } as any,
      { id: 't2', name: 'b' } as any,
    ];
    ctx.erdStore.selectedTableIds = new Set(['t1', 't2']);
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.erdStore.deleteTables).toHaveBeenCalledWith(['t1', 't2']);
  });

  it('Delete does not delete when confirm returns false', async () => {
    const ctx = makeCtx();
    (ctx.dialogStore.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    ctx.erdStore.schema.tables = [{ id: 't1', name: 'users' } as any];
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.erdStore.deleteTable).not.toHaveBeenCalled();
  });

  it('Delete key deletes single memo', async () => {
    const ctx = makeCtx();
    ctx.erdStore.selectedMemoIds = new Set(['m1']);
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.erdStore.deleteMemo).toHaveBeenCalledWith('m1');
  });

  it('Backspace also triggers delete', async () => {
    const ctx = makeCtx();
    ctx.erdStore.selectedMemoIds = new Set(['m1']);
    await handleKeydown(keyEvent('Backspace'), ctx);
    expect(ctx.erdStore.deleteMemo).toHaveBeenCalledWith('m1');
  });

  it('Delete does nothing in readOnly', async () => {
    const ctx = makeCtx({ isReadOnly: true });
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.dialogStore.confirm).not.toHaveBeenCalled();
  });

  it('Delete does nothing when nothing selected', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('Delete'), ctx);
    expect(ctx.dialogStore.confirm).not.toHaveBeenCalled();
  });

  // ── Zoom ──

  it('+ key zooms in', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('+'), ctx);
    expect(ctx.canvasState.scale).toBeCloseTo(1.1, 2);
  });

  it('- key zooms out', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('-'), ctx);
    expect(ctx.canvasState.scale).toBeCloseTo(0.9, 2);
  });

  it('zoom clamps to max 3', async () => {
    const ctx = makeCtx();
    ctx.canvasState.scale = 2.95;
    await handleKeydown(keyEvent('+'), ctx);
    expect(ctx.canvasState.scale).toBeLessThanOrEqual(3);
  });

  it('zoom clamps to min 0.2', async () => {
    const ctx = makeCtx();
    ctx.canvasState.scale = 0.21;
    await handleKeydown(keyEvent('-'), ctx);
    expect(ctx.canvasState.scale).toBeGreaterThanOrEqual(0.2);
  });

  it('zoom adjusts x/y to keep center point', async () => {
    const ctx = makeCtx();
    ctx.canvasState.x = 100;
    ctx.canvasState.y = 50;
    const oldScale = ctx.canvasState.scale;
    await handleKeydown(keyEvent('+'), ctx);
    // x and y should have changed to compensate for zoom
    expect(ctx.canvasState.x).not.toBe(100);
    expect(ctx.canvasState.y).not.toBe(50);
  });

  // ── Pan ──

  it('ArrowLeft pans right (+x)', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('ArrowLeft'), ctx);
    expect(ctx.canvasState.x).toBe(60);
  });

  it('ArrowRight pans left (-x)', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('ArrowRight'), ctx);
    expect(ctx.canvasState.x).toBe(-60);
  });

  it('ArrowUp pans down (+y)', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('ArrowUp'), ctx);
    expect(ctx.canvasState.y).toBe(60);
  });

  it('ArrowDown pans up (-y)', async () => {
    const ctx = makeCtx();
    await handleKeydown(keyEvent('ArrowDown'), ctx);
    expect(ctx.canvasState.y).toBe(-60);
  });

  // ── Copy/Paste ──

  it('Ctrl+C copies selected tables to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText, readText: vi.fn() } });
    const ctx = makeCtx();
    const table = { id: 't1', name: 'users' } as any;
    ctx.erdStore.schema.tables = [table];
    ctx.erdStore.selectedTableIds = new Set(['t1']);
    await handleKeydown(keyEvent('c', { ctrlKey: true }), ctx);
    expect(writeText).toHaveBeenCalled();
    const written = JSON.parse(writeText.mock.calls[0][0]);
    expect(written._type).toBe('erdmini_tables');
    expect(written.tables).toHaveLength(1);
  });

  it('Ctrl+C does nothing when no tables selected', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ctx = makeCtx();
    await handleKeydown(keyEvent('c', { ctrlKey: true }), ctx);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Ctrl+V pastes tables from clipboard', async () => {
    const data = { _type: 'erdmini_tables', tables: [{ id: 't1', name: 'pasted' }] };
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
        readText: vi.fn().mockResolvedValue(JSON.stringify(data)),
      },
    });
    const ctx = makeCtx();
    await handleKeydown(keyEvent('v', { ctrlKey: true }), ctx);
    // readText is async, give it a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.erdStore.pasteTablesFromClipboard).toHaveBeenCalledWith(data.tables);
  });

  it('Ctrl+V does nothing in readOnly', async () => {
    const ctx = makeCtx({ isReadOnly: true });
    await handleKeydown(keyEvent('v', { ctrlKey: true }), ctx);
    expect(ctx.erdStore.pasteTablesFromClipboard).not.toHaveBeenCalled();
  });
});

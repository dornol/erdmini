import type { ERDSchema } from '$lib/types/erd';
import * as m from '$lib/paraglide/messages';

interface KBCanvasState {
  x: number;
  y: number;
  scale: number;
}

interface KBErdStore {
  schema: ERDSchema;
  selectedTableId: string | null;
  selectedTableIds: Set<string>;
  selectedMemoId: string | null;
  selectedMemoIds: Set<string>;
  undo(): void;
  redo(): void;
  duplicateTable(id: string): void;
  deleteTable(id: string): void;
  deleteTables(ids: string[]): void;
  deleteMemo(id: string): void;
  deleteMemos(ids: string[]): void;
  pasteTablesFromClipboard(tables: unknown[]): void;
}

interface KBDialogStore {
  confirm(message: string, opts?: { title?: string; confirmText?: string; variant?: 'danger' | 'default' }): Promise<boolean>;
}

export interface KeyboardContext {
  erdStore: KBErdStore;
  canvasState: KBCanvasState;
  dialogStore: KBDialogStore;
  isReadOnly: boolean;
  fullscreenMode: boolean;
  commandPaletteOpen: boolean;
  setFullscreen: (v: boolean) => void;
  setCommandPalette: (v: boolean) => void;
}

export async function handleKeydown(e: KeyboardEvent, ctx: KeyboardContext) {
  const key = e.key.toLowerCase();
  const target = e.target as HTMLElement;
  const tag = target?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.closest?.('.cm-editor');

  // F key: toggle fullscreen (when not editing)
  if (e.code === 'KeyF' && !isEditing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    ctx.setFullscreen(!ctx.fullscreenMode);
    return;
  }

  // ESC: exit fullscreen first, then deselect
  if (e.key === 'Escape' && !isEditing) {
    if (ctx.fullscreenMode) {
      ctx.setFullscreen(false);
      return;
    }
    ctx.erdStore.selectedTableId = null;
    ctx.erdStore.selectedTableIds = new Set();
    ctx.erdStore.selectedMemoId = null;
    ctx.erdStore.selectedMemoIds = new Set();
    return;
  }

  // In fullscreen mode, block all editing shortcuts
  if (ctx.fullscreenMode) {
    if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'f')) {
      e.preventDefault();
      ctx.setCommandPalette(!ctx.commandPaletteOpen);
      return;
    }
    if (!isEditing && (key === '+' || key === '=' || key === '-')) {
      e.preventDefault();
      zoomByKey(e.key, ctx.canvasState);
      return;
    }
    if (!isEditing && e.key.startsWith('Arrow')) {
      e.preventDefault();
      panByKey(e.key, ctx.canvasState);
      return;
    }
    return;
  }

  // Cmd+K or Ctrl+F: toggle command palette
  if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'f')) {
    e.preventDefault();
    ctx.setCommandPalette(!ctx.commandPaletteOpen);
    return;
  }

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
    if (isEditing || ctx.isReadOnly) return;
    e.preventDefault();
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      ctx.erdStore.redo();
    } else {
      ctx.erdStore.undo();
    }
    return;
  }

  // Ctrl+A: Select all tables and memos
  if ((e.ctrlKey || e.metaKey) && key === 'a' && !isEditing) {
    e.preventDefault();
    const allIds = new Set(ctx.erdStore.schema.tables.map((t) => t.id));
    ctx.erdStore.selectedTableIds = allIds;
    if (allIds.size > 0) ctx.erdStore.selectedTableId = ctx.erdStore.schema.tables[0].id;
    const allMemoIds = new Set(ctx.erdStore.schema.memos.map((mm) => mm.id));
    ctx.erdStore.selectedMemoIds = allMemoIds;
    if (allMemoIds.size > 0 && !ctx.erdStore.selectedMemoId) ctx.erdStore.selectedMemoId = ctx.erdStore.schema.memos[0].id;
    return;
  }

  // Ctrl+D: Duplicate selected table(s)
  if ((e.ctrlKey || e.metaKey) && key === 'd' && !isEditing && !ctx.isReadOnly) {
    e.preventDefault();
    const ids = [...ctx.erdStore.selectedTableIds];
    for (const id of ids) {
      ctx.erdStore.duplicateTable(id);
    }
    return;
  }

  // Delete selected table(s) and/or memo(s)
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && !ctx.isReadOnly) {
    const tableIds = [...ctx.erdStore.selectedTableIds];
    const memoIds = [...ctx.erdStore.selectedMemoIds];
    if (tableIds.length === 0 && memoIds.length === 0) return;
    e.preventDefault();

    if (tableIds.length === 1 && memoIds.length === 0) {
      const table = ctx.erdStore.schema.tables.find((t) => t.id === tableIds[0]);
      if (!table) return;
      const ok = await ctx.dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
        title: m.dialog_delete_table_title(),
        confirmText: m.action_delete(),
        variant: 'danger',
      });
      if (ok) ctx.erdStore.deleteTable(tableIds[0]);
    } else if (tableIds.length > 0) {
      const ok = await ctx.dialogStore.confirm(m.dialog_bulk_delete_confirm({ count: tableIds.length }), {
        title: m.dialog_delete_table_title(),
        confirmText: m.action_delete(),
        variant: 'danger',
      });
      if (ok) ctx.erdStore.deleteTables(tableIds);
    }

    if (memoIds.length === 1 && tableIds.length === 0) {
      const ok = await ctx.dialogStore.confirm(m.dialog_delete_memo_confirm(), {
        title: m.action_delete(),
        confirmText: m.action_delete(),
        variant: 'danger',
      });
      if (ok) ctx.erdStore.deleteMemo(memoIds[0]);
    } else if (memoIds.length > 0) {
      const ok = await ctx.dialogStore.confirm(m.dialog_delete_memos_confirm({ count: memoIds.length }), {
        title: m.action_delete(),
        confirmText: m.action_delete(),
        variant: 'danger',
      });
      if (ok) ctx.erdStore.deleteMemos(memoIds);
    }
  }

  // Keyboard zoom
  if (!isEditing && (e.key === '+' || e.key === '=' || e.key === '-')) {
    e.preventDefault();
    zoomByKey(e.key, ctx.canvasState);
    return;
  }

  // Ctrl+C: Copy selected tables to clipboard
  if ((e.ctrlKey || e.metaKey) && key === 'c' && !isEditing) {
    const ids = [...ctx.erdStore.selectedTableIds];
    if (ids.length > 0) {
      e.preventDefault();
      const tables = ctx.erdStore.schema.tables.filter((t) => ids.includes(t.id));
      const data = { _type: 'erdmini_tables', tables };
      navigator.clipboard.writeText(JSON.stringify(data));
    }
    return;
  }

  // Ctrl+V: Paste tables from clipboard
  if ((e.ctrlKey || e.metaKey) && key === 'v' && !isEditing && !ctx.isReadOnly) {
    e.preventDefault();
    navigator.clipboard.readText().then((text) => {
      try {
        const data = JSON.parse(text);
        if (data._type === 'erdmini_tables' && Array.isArray(data.tables)) {
          ctx.erdStore.pasteTablesFromClipboard(data.tables);
        }
      } catch { /* not valid erdmini data, ignore */ }
    }).catch(() => { /* clipboard access denied, ignore */ });
    return;
  }

  // Keyboard pan: Arrow keys
  if (!isEditing && e.key.startsWith('Arrow')) {
    e.preventDefault();
    panByKey(e.key, ctx.canvasState);
    return;
  }
}

function zoomByKey(key: string, cs: KBCanvasState) {
  const factor = (key === '-') ? 0.9 : 1.1;
  const newScale = Math.min(3, Math.max(0.2, cs.scale * factor));
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  cs.x = cx - (cx - cs.x) * (newScale / cs.scale);
  cs.y = cy - (cy - cs.y) * (newScale / cs.scale);
  cs.scale = newScale;
}

function panByKey(key: string, cs: KBCanvasState) {
  const step = 60;
  switch (key) {
    case 'ArrowLeft':  cs.x += step; break;
    case 'ArrowRight': cs.x -= step; break;
    case 'ArrowUp':    cs.y += step; break;
    case 'ArrowDown':  cs.y -= step; break;
  }
}

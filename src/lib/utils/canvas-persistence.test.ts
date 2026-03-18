import { describe, it, expect, beforeEach } from 'vitest';
import {
  restoreCanvasSettings,
  persistColumnDisplayMode,
  persistLineType,
  persistShowGrid,
  persistShowRelationLines,
  persistSchemaView,
} from './canvas-persistence';

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

// ── restoreCanvasSettings ──

describe('restoreCanvasSettings', () => {
  it('returns empty settings when localStorage is clean', () => {
    const s = restoreCanvasSettings();
    expect(s.columnDisplayMode).toBeUndefined();
    expect(s.lineType).toBeUndefined();
    expect(s.showGrid).toBeUndefined();
    expect(s.showRelationLines).toBeUndefined();
    expect(s.activeSchema).toBeUndefined();
    expect(s.schemaViewports).toBeUndefined();
  });

  it('restores columnDisplayMode pk-fk-only', () => {
    store['erdmini_column_display_mode'] = 'pk-fk-only';
    expect(restoreCanvasSettings().columnDisplayMode).toBe('pk-fk-only');
  });

  it('restores columnDisplayMode names-only', () => {
    store['erdmini_column_display_mode'] = 'names-only';
    expect(restoreCanvasSettings().columnDisplayMode).toBe('names-only');
  });

  it('ignores invalid columnDisplayMode', () => {
    store['erdmini_column_display_mode'] = 'invalid';
    expect(restoreCanvasSettings().columnDisplayMode).toBeUndefined();
  });

  it('restores lineType rounded', () => {
    store['erdmini_line_type'] = 'rounded';
    expect(restoreCanvasSettings().lineType).toBe('rounded');
  });

  it('restores lineType bezier', () => {
    store['erdmini_line_type'] = 'bezier';
    expect(restoreCanvasSettings().lineType).toBe('bezier');
  });

  it('ignores invalid lineType', () => {
    store['erdmini_line_type'] = 'dotted';
    expect(restoreCanvasSettings().lineType).toBeUndefined();
  });

  it('restores showGrid false', () => {
    store['erdmini_show_grid'] = 'false';
    expect(restoreCanvasSettings().showGrid).toBe(false);
  });

  it('does not set showGrid for other values', () => {
    store['erdmini_show_grid'] = 'true';
    expect(restoreCanvasSettings().showGrid).toBeUndefined();
  });

  it('restores showRelationLines false', () => {
    store['erdmini_show_relation_lines'] = 'false';
    expect(restoreCanvasSettings().showRelationLines).toBe(false);
  });

  it('restores activeSchema', () => {
    store['erdmini_active_schema'] = 'public';
    expect(restoreCanvasSettings().activeSchema).toBe('public');
  });

  it('restores schemaViewports', () => {
    const viewports = { public: { x: 10, y: 20, scale: 1.5 } };
    store['erdmini_schema_viewports'] = JSON.stringify(viewports);
    expect(restoreCanvasSettings().schemaViewports).toEqual(viewports);
  });

  it('ignores malformed schemaViewports JSON', () => {
    store['erdmini_schema_viewports'] = '{invalid';
    expect(restoreCanvasSettings().schemaViewports).toBeUndefined();
  });

  it('restores all settings at once', () => {
    store['erdmini_column_display_mode'] = 'pk-fk-only';
    store['erdmini_line_type'] = 'bezier';
    store['erdmini_show_grid'] = 'false';
    store['erdmini_show_relation_lines'] = 'false';
    store['erdmini_active_schema'] = 'sales';
    store['erdmini_schema_viewports'] = '{"sales":{"x":0,"y":0,"scale":1}}';

    const s = restoreCanvasSettings();
    expect(s.columnDisplayMode).toBe('pk-fk-only');
    expect(s.lineType).toBe('bezier');
    expect(s.showGrid).toBe(false);
    expect(s.showRelationLines).toBe(false);
    expect(s.activeSchema).toBe('sales');
    expect(s.schemaViewports).toEqual({ sales: { x: 0, y: 0, scale: 1 } });
  });
});

// ── persist functions ──

describe('persistColumnDisplayMode', () => {
  it('removes key for "all" (default)', () => {
    store['erdmini_column_display_mode'] = 'pk-fk-only';
    persistColumnDisplayMode('all');
    expect(store['erdmini_column_display_mode']).toBeUndefined();
  });

  it('saves non-default value', () => {
    persistColumnDisplayMode('pk-fk-only');
    expect(store['erdmini_column_display_mode']).toBe('pk-fk-only');
  });
});

describe('persistLineType', () => {
  it('removes key for "orthogonal" (default)', () => {
    store['erdmini_line_type'] = 'rounded';
    persistLineType('orthogonal');
    expect(store['erdmini_line_type']).toBeUndefined();
  });

  it('saves non-default value', () => {
    persistLineType('bezier');
    expect(store['erdmini_line_type']).toBe('bezier');
  });
});

describe('persistShowGrid', () => {
  it('removes key for true (default)', () => {
    store['erdmini_show_grid'] = 'false';
    persistShowGrid(true);
    expect(store['erdmini_show_grid']).toBeUndefined();
  });

  it('saves "false" when grid hidden', () => {
    persistShowGrid(false);
    expect(store['erdmini_show_grid']).toBe('false');
  });
});

describe('persistShowRelationLines', () => {
  it('removes key for true (default)', () => {
    store['erdmini_show_relation_lines'] = 'false';
    persistShowRelationLines(true);
    expect(store['erdmini_show_relation_lines']).toBeUndefined();
  });

  it('saves "false" when lines hidden', () => {
    persistShowRelationLines(false);
    expect(store['erdmini_show_relation_lines']).toBe('false');
  });
});

describe('persistSchemaView', () => {
  it('removes activeSchema key for "(all)" default', () => {
    store['erdmini_active_schema'] = 'public';
    persistSchemaView('(all)', {});
    expect(store['erdmini_active_schema']).toBeUndefined();
    expect(store['erdmini_schema_viewports']).toBe('{}');
  });

  it('saves activeSchema and viewports', () => {
    const viewports = { sales: { x: 1, y: 2, scale: 1 } };
    persistSchemaView('sales', viewports);
    expect(store['erdmini_active_schema']).toBe('sales');
    expect(JSON.parse(store['erdmini_schema_viewports'])).toEqual(viewports);
  });

  it('round-trips through restore', () => {
    const viewports = { hr: { x: 100, y: -50, scale: 0.8 } };
    persistSchemaView('hr', viewports);
    persistColumnDisplayMode('names-only');
    persistLineType('rounded');
    persistShowGrid(false);

    const restored = restoreCanvasSettings();
    expect(restored.activeSchema).toBe('hr');
    expect(restored.schemaViewports).toEqual(viewports);
    expect(restored.columnDisplayMode).toBe('names-only');
    expect(restored.lineType).toBe('rounded');
    expect(restored.showGrid).toBe(false);
  });
});

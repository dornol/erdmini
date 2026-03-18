import type { ColumnDisplayMode, LineType } from '$lib/store/canvas.svelte';

interface CanvasSettings {
  columnDisplayMode?: ColumnDisplayMode;
  lineType?: LineType;
  showGrid?: boolean;
  showRelationLines?: boolean;
  activeSchema?: string;
  schemaViewports?: Record<string, { x: number; y: number; scale: number }>;
}

const KEYS = {
  columnDisplayMode: 'erdmini_column_display_mode',
  lineType: 'erdmini_line_type',
  showGrid: 'erdmini_show_grid',
  showRelationLines: 'erdmini_show_relation_lines',
  activeSchema: 'erdmini_active_schema',
  schemaViewports: 'erdmini_schema_viewports',
} as const;

export function restoreCanvasSettings(): CanvasSettings {
  const settings: CanvasSettings = {};
  const savedMode = localStorage.getItem(KEYS.columnDisplayMode);
  if (savedMode === 'pk-fk-only' || savedMode === 'names-only') {
    settings.columnDisplayMode = savedMode;
  }
  const savedLineType = localStorage.getItem(KEYS.lineType);
  if (savedLineType === 'bezier' || savedLineType === 'straight') {
    settings.lineType = savedLineType;
  }
  const savedShowGrid = localStorage.getItem(KEYS.showGrid);
  if (savedShowGrid === 'false') settings.showGrid = false;
  const savedShowRelLines = localStorage.getItem(KEYS.showRelationLines);
  if (savedShowRelLines === 'false') settings.showRelationLines = false;
  const savedActiveSchema = localStorage.getItem(KEYS.activeSchema);
  if (savedActiveSchema) settings.activeSchema = savedActiveSchema;
  const savedViewports = localStorage.getItem(KEYS.schemaViewports);
  if (savedViewports) {
    try { settings.schemaViewports = JSON.parse(savedViewports); } catch { /* ignore */ }
  }
  return settings;
}

export function persistColumnDisplayMode(mode: ColumnDisplayMode): void {
  if (mode === 'all') localStorage.removeItem(KEYS.columnDisplayMode);
  else localStorage.setItem(KEYS.columnDisplayMode, mode);
}

export function persistLineType(lt: LineType): void {
  if (lt === 'orthogonal') localStorage.removeItem(KEYS.lineType);
  else localStorage.setItem(KEYS.lineType, lt);
}

export function persistShowGrid(show: boolean): void {
  if (show) localStorage.removeItem(KEYS.showGrid);
  else localStorage.setItem(KEYS.showGrid, 'false');
}

export function persistShowRelationLines(show: boolean): void {
  if (show) localStorage.removeItem(KEYS.showRelationLines);
  else localStorage.setItem(KEYS.showRelationLines, 'false');
}

export function persistSchemaView(activeSchema: string, viewports: Record<string, unknown>): void {
  if (activeSchema === '(all)') localStorage.removeItem(KEYS.activeSchema);
  else localStorage.setItem(KEYS.activeSchema, activeSchema);
  localStorage.setItem(KEYS.schemaViewports, JSON.stringify(viewports));
}

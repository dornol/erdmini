import { TABLE_W } from '$lib/constants/layout';

export type ColumnDisplayMode = 'all' | 'pk-fk-only' | 'names-only';
export type LineType = 'bezier' | 'orthogonal' | 'rounded';

class CanvasState {
  x = $state(0);
  y = $state(0);
  scale = $state(1);
  snapToGrid = $state(false);
  showGrid = $state(true);
  showRelationLines = $state(true);
  gridSize = 20;
  columnDisplayMode = $state<ColumnDisplayMode>('all');
  lineType = $state<LineType>('orthogonal');
  tableWidths = $state<Map<string, number>>(new Map());
  activeSchema = $state<string>('(all)');
  schemaViewports = $state<Record<string, { x: number; y: number; scale: number }>>({});

  snap(v: number): number {
    return this.snapToGrid ? Math.round(v / this.gridSize) * this.gridSize : v;
  }

  getTableW(tableId: string): number {
    return this.tableWidths.get(tableId) ?? TABLE_W;
  }

  setTableWidth(tableId: string, width: number) {
    if (this.tableWidths.get(tableId) !== width) {
      this.tableWidths.set(tableId, width);
      this.tableWidths = new Map(this.tableWidths);
    }
  }

  /** Convert viewport center to world coordinates */
  viewportCenterToWorld(viewportWidth: number, viewportHeight: number): { x: number; y: number } {
    return {
      x: (viewportWidth / 2 - this.x) / this.scale,
      y: (viewportHeight / 2 - this.y) / this.scale,
    };
  }
}

export const canvasState = new CanvasState();

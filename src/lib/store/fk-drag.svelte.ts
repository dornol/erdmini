import { canvasState } from '$lib/store/erd.svelte';

class FkDragStore {
  active = $state(false);
  sourceTableId = $state('');
  sourceColumnId = $state('');
  startX = $state(0);
  startY = $state(0);
  currentX = $state(0);
  currentY = $state(0);
  targetTableId = $state<string | null>(null);
  targetColumnId = $state<string | null>(null);

  begin(sourceTableId: string, sourceColumnId: string, startX: number, startY: number) {
    this.active = true;
    this.sourceTableId = sourceTableId;
    this.sourceColumnId = sourceColumnId;
    this.startX = startX;
    this.startY = startY;
    this.currentX = startX;
    this.currentY = startY;
    this.targetTableId = null;
    this.targetColumnId = null;
  }

  updateCursor(clientX: number, clientY: number, viewportEl: HTMLElement) {
    const rect = viewportEl.getBoundingClientRect();
    this.currentX = (clientX - rect.left - canvasState.x) / canvasState.scale;
    this.currentY = (clientY - rect.top - canvasState.y) / canvasState.scale;
  }

  setTarget(tableId: string | null, columnId: string | null) {
    this.targetTableId = tableId;
    this.targetColumnId = columnId;
  }

  cancel() {
    this.active = false;
    this.sourceTableId = '';
    this.sourceColumnId = '';
    this.targetTableId = null;
    this.targetColumnId = null;
  }
}

export const fkDragStore = new FkDragStore();

class MemoDragState {
  isDragging = $state(false);
  hoverTableId = $state<string | null>(null);
}

export const memoDragState = new MemoDragState();

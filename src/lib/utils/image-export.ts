import { sanitizeFilename } from './common';

/**
 * Export the ERD canvas as a PNG image using html-to-image.
 * Temporarily repositions the canvas world element for a clean capture.
 */
export async function exportCanvasImage(projectName: string): Promise<void> {
  const worldEl = document.querySelector('.canvas-world') as HTMLElement | null;
  if (!worldEl) return;

  const { toPng } = await import('html-to-image');
  const PAD = 40;

  // Save originals
  const origTransform = worldEl.style.transform;
  const origWidth = worldEl.style.width;
  const origHeight = worldEl.style.height;

  // Reset to identity so getBoundingClientRect reflects actual world coords at scale=1
  worldEl.style.transform = 'translate(0px, 0px) scale(1)';
  void worldEl.getBoundingClientRect(); // force layout

  const worldRect = worldEl.getBoundingClientRect();
  const cards = Array.from(worldEl.querySelectorAll<HTMLElement>('.table-card, .memo-card'));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const x = rect.left - worldRect.left;
    const y = rect.top - worldRect.top;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + rect.width);
    maxY = Math.max(maxY, y + rect.height);
  }

  if (!isFinite(minX)) {
    worldEl.style.transform = origTransform;
    return;
  }

  const w = Math.ceil(maxX - minX + PAD * 2);
  const h = Math.ceil(maxY - minY + PAD * 2);

  // Shift so all tables start at (PAD, PAD) and give worldEl explicit dimensions
  worldEl.style.transform = `translate(${-minX + PAD}px, ${-minY + PAD}px) scale(1)`;
  worldEl.style.width = `${w}px`;
  worldEl.style.height = `${h}px`;

  // Temporarily allow overflow so capture sees full content
  const viewportEl = worldEl.parentElement;
  const origOverflow = viewportEl?.style.overflow ?? '';
  if (viewportEl) viewportEl.style.overflow = 'visible';

  try {
    const dataUrl = await toPng(worldEl, {
      width: w,
      height: h,
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.querySelector('.canvas-viewport')!).getPropertyValue('--erd-canvas-bg').trim() || '#f8fafc',
      filter: (node: HTMLElement) => {
        // Exclude hover tooltips from export
        return !node.classList?.contains('col-tooltip');
      },
    });

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `erdmini_${sanitizeFilename(projectName)}.png`;
    a.click();
  } finally {
    worldEl.style.transform = origTransform;
    worldEl.style.width = origWidth;
    worldEl.style.height = origHeight;
    if (viewportEl) viewportEl.style.overflow = origOverflow;
  }
}

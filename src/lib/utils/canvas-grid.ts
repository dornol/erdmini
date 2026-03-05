/**
 * Compute CSS background-position + background-size for canvas grid
 * that follows pan/zoom.
 */
export function computeGridBgStyle(
  x: number,
  y: number,
  scale: number,
  theme: string
): string {
  const pos = `${x}px ${y}px`;
  switch (theme) {
    case 'classic': {
      const s = 32 * scale;
      return `background-position: ${pos}, ${pos}; background-size: ${s}px ${s}px, ${s}px ${s}px;`;
    }
    case 'blueprint': {
      const major = 80 * scale;
      const minor = 16 * scale;
      return `background-position: ${pos}, ${pos}, ${pos}, ${pos}; background-size: ${major}px ${major}px, ${major}px ${major}px, ${minor}px ${minor}px, ${minor}px ${minor}px;`;
    }
    default: {
      // modern, minimal
      const s = 24 * scale;
      return `background-position: ${pos}; background-size: ${s}px ${s}px;`;
    }
  }
}

/**
 * Filter tables by active schema. Returns all tables when activeSchema is '(all)'.
 */
export function filterBySchema<T extends { schema?: string }>(
  items: T[],
  activeSchema: string
): T[] {
  if (activeSchema === '(all)') return items;
  return items.filter((item) => (item.schema ?? '') === activeSchema);
}

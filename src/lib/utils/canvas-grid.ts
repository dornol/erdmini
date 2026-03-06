/**
 * Compute CSS background-image + background-position + background-size for canvas grid
 * that follows pan/zoom. Line thickness scales with zoom level.
 */
export function computeGridBgStyle(
  x: number,
  y: number,
  scale: number,
  theme: string
): string {
  const pos = `${x}px ${y}px`;
  // Use sqrt for gentle falloff; snap to 0.5px steps to avoid sub-pixel flicker
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const t = (base: number, min: number, max: number) =>
    Math.round(clamp(base * Math.sqrt(scale), min, max) * 2) / 2;

  switch (theme) {
    case 'classic': {
      const s = 32 * scale;
      const th = t(1, 0.5, 2);
      const color = '#d4c9b8';
      return `background-image: linear-gradient(to right, ${color} ${th}px, transparent ${th}px), linear-gradient(to bottom, ${color} ${th}px, transparent ${th}px); background-position: ${pos}, ${pos}; background-size: ${s}px ${s}px, ${s}px ${s}px;`;
    }
    case 'blueprint': {
      const major = 80 * scale;
      const minor = 16 * scale;
      const tMajor = t(1, 0.5, 2);
      const tMinor = t(1, 0.3, 1.5);
      const majorColor = '#1a3050';
      const minorColor = 'rgba(26, 48, 80, 0.4)';
      return `background-image: linear-gradient(to right, ${majorColor} ${tMajor}px, transparent ${tMajor}px), linear-gradient(to bottom, ${majorColor} ${tMajor}px, transparent ${tMajor}px), linear-gradient(to right, ${minorColor} ${tMinor}px, transparent ${tMinor}px), linear-gradient(to bottom, ${minorColor} ${tMinor}px, transparent ${tMinor}px); background-position: ${pos}, ${pos}, ${pos}, ${pos}; background-size: ${major}px ${major}px, ${major}px ${major}px, ${minor}px ${minor}px, ${minor}px ${minor}px;`;
    }
    case 'minimal': {
      const s = 24 * scale;
      const r = t(0.8, 0.4, 1.5);
      return `background-image: radial-gradient(circle, #c8c8c8 ${r}px, transparent ${r}px); background-position: ${pos}; background-size: ${s}px ${s}px;`;
    }
    default: {
      // modern
      const s = 24 * scale;
      const r = t(1, 0.5, 1.8);
      return `background-image: radial-gradient(circle, #cbd5e1 ${r}px, transparent ${r}px); background-position: ${pos}; background-size: ${s}px ${s}px;`;
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

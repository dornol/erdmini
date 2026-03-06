import { describe, it, expect } from 'vitest';
import { computeGridBgStyle, filterBySchema } from './canvas-grid';

// ── computeGridBgStyle ──

describe('computeGridBgStyle', () => {
  describe('modern theme (default)', () => {
    it('returns background-image, position, and size at scale 1', () => {
      const style = computeGridBgStyle(0, 0, 1, 'modern');
      expect(style).toContain('background-image: radial-gradient(circle, #cbd5e1');
      expect(style).toContain('background-position: 0px 0px');
      expect(style).toContain('background-size: 24px 24px');
    });

    it('position follows canvas x/y', () => {
      const style = computeGridBgStyle(100, -50, 1, 'modern');
      expect(style).toContain('background-position: 100px -50px');
      expect(style).toContain('background-size: 24px 24px');
    });

    it('size scales with zoom', () => {
      const style = computeGridBgStyle(0, 0, 2, 'modern');
      expect(style).toContain('background-size: 48px 48px');
    });

    it('size shrinks when zoomed out', () => {
      const style = computeGridBgStyle(0, 0, 0.5, 'modern');
      expect(style).toContain('background-size: 12px 12px');
    });

    it('combines pan and zoom', () => {
      const style = computeGridBgStyle(200, 300, 1.5, 'modern');
      expect(style).toContain('background-position: 200px 300px');
      expect(style).toContain('background-size: 36px 36px');
    });
  });

  describe('minimal theme', () => {
    it('uses 24px base with radial-gradient', () => {
      const style = computeGridBgStyle(10, 20, 1, 'minimal');
      expect(style).toContain('background-image: radial-gradient(circle, #c8c8c8');
      expect(style).toContain('background-position: 10px 20px');
      expect(style).toContain('background-size: 24px 24px');
    });

    it('scales correctly', () => {
      const style = computeGridBgStyle(0, 0, 3, 'minimal');
      expect(style).toContain('background-size: 72px 72px');
    });
  });

  describe('classic theme', () => {
    it('returns linear-gradient with double position/size', () => {
      const style = computeGridBgStyle(0, 0, 1, 'classic');
      expect(style).toContain('background-image: linear-gradient');
      expect(style).toContain('background-position: 0px 0px, 0px 0px');
      expect(style).toContain('background-size: 32px 32px, 32px 32px');
    });

    it('position follows canvas x/y for both layers', () => {
      const style = computeGridBgStyle(50, -100, 1, 'classic');
      expect(style).toContain('background-position: 50px -100px, 50px -100px');
    });

    it('size scales with zoom', () => {
      const style = computeGridBgStyle(0, 0, 2, 'classic');
      expect(style).toContain('background-size: 64px 64px, 64px 64px');
    });
  });

  describe('blueprint theme', () => {
    it('returns 4 background-position/size pairs (major + minor grid)', () => {
      const style = computeGridBgStyle(0, 0, 1, 'blueprint');
      expect(style).toContain('background-position: 0px 0px, 0px 0px, 0px 0px, 0px 0px');
      expect(style).toContain('background-size: 80px 80px, 80px 80px, 16px 16px, 16px 16px');
    });

    it('major grid (80px) and minor grid (16px) scale independently', () => {
      const style = computeGridBgStyle(0, 0, 2, 'blueprint');
      expect(style).toContain('160px 160px, 160px 160px, 32px 32px, 32px 32px');
    });

    it('position follows canvas x/y for all 4 layers', () => {
      const style = computeGridBgStyle(-30, 70, 1, 'blueprint');
      const positions = style.match(/background-position: (.+?);/)?.[1];
      expect(positions).toBe('-30px 70px, -30px 70px, -30px 70px, -30px 70px');
    });

    it('fractional scale', () => {
      const style = computeGridBgStyle(0, 0, 0.25, 'blueprint');
      expect(style).toContain('background-size: 20px 20px, 20px 20px, 4px 4px, 4px 4px');
    });
  });

  describe('unknown theme falls through to default', () => {
    it('treats unknown theme as modern (24px base)', () => {
      const style = computeGridBgStyle(0, 0, 1, 'future-theme');
      expect(style).toContain('background-image: radial-gradient(circle, #cbd5e1');
      expect(style).toContain('background-position: 0px 0px');
      expect(style).toContain('background-size: 24px 24px');
    });
  });

  describe('grid thickness scales with zoom', () => {
    it('dot radius shrinks when zoomed out (modern)', () => {
      const style1 = computeGridBgStyle(0, 0, 1, 'modern');
      const style05 = computeGridBgStyle(0, 0, 0.5, 'modern');
      const r1 = style1.match(/radial-gradient\(circle, #cbd5e1 ([\d.]+)px/)?.[1];
      const r05 = style05.match(/radial-gradient\(circle, #cbd5e1 ([\d.]+)px/)?.[1];
      expect(Number(r05)).toBeLessThan(Number(r1));
    });

    it('dot radius grows when zoomed in (modern)', () => {
      const style1 = computeGridBgStyle(0, 0, 1, 'modern');
      const style2 = computeGridBgStyle(0, 0, 2, 'modern');
      const r1 = style1.match(/radial-gradient\(circle, #cbd5e1 ([\d.]+)px/)?.[1];
      const r2 = style2.match(/radial-gradient\(circle, #cbd5e1 ([\d.]+)px/)?.[1];
      expect(Number(r2)).toBeGreaterThan(Number(r1));
    });

    it('line thickness is clamped at minimum (classic)', () => {
      const style = computeGridBgStyle(0, 0, 0.01, 'classic');
      // At scale 0.01, sqrt(0.01)*1=0.1 would be clamped to min 0.5
      expect(style).toContain('0.5px');
    });

    it('line thickness is clamped at maximum (classic)', () => {
      const style = computeGridBgStyle(0, 0, 10, 'classic');
      // At scale 10, 1*10=10 would be clamped to max 2
      expect(style).toContain('2px');
    });
  });

  describe('edge cases', () => {
    it('very small scale', () => {
      const style = computeGridBgStyle(0, 0, 0.05, 'modern');
      // 24 * 0.05 = 1.2 (floating point may add trailing digits)
      expect(style).toMatch(/background-size: 1\.2\d*px 1\.2\d*px/);
    });

    it('very large scale', () => {
      const style = computeGridBgStyle(0, 0, 3, 'modern');
      expect(style).toContain('background-size: 72px 72px');
    });

    it('negative coordinates', () => {
      const style = computeGridBgStyle(-500, -300, 1.5, 'modern');
      expect(style).toContain('background-position: -500px -300px');
    });

    it('zero scale produces zero-sized grid', () => {
      const style = computeGridBgStyle(0, 0, 0, 'modern');
      expect(style).toContain('background-size: 0px 0px');
    });
  });
});

// ── filterBySchema ──

describe('filterBySchema', () => {
  const items = [
    { id: '1', name: 'users', schema: 'public' },
    { id: '2', name: 'orders', schema: 'billing' },
    { id: '3', name: 'logs', schema: 'public' },
    { id: '4', name: 'legacy' },                    // no schema field
    { id: '5', name: 'config', schema: '' },         // empty string schema
  ];

  it('returns all items when activeSchema is "(all)"', () => {
    const result = filterBySchema(items, '(all)');
    expect(result).toEqual(items);
    expect(result).toBe(items); // same array reference
  });

  it('filters by specific schema', () => {
    const result = filterBySchema(items, 'public');
    expect(result).toEqual([
      { id: '1', name: 'users', schema: 'public' },
      { id: '3', name: 'logs', schema: 'public' },
    ]);
  });

  it('filters billing schema', () => {
    const result = filterBySchema(items, 'billing');
    expect(result).toEqual([{ id: '2', name: 'orders', schema: 'billing' }]);
  });

  it('treats undefined schema as empty string', () => {
    const result = filterBySchema(items, '');
    expect(result.map((i) => i.id)).toEqual(['4', '5']);
  });

  it('returns empty array for non-existent schema', () => {
    const result = filterBySchema(items, 'nonexistent');
    expect(result).toEqual([]);
  });

  it('handles empty input array', () => {
    const result = filterBySchema([], 'public');
    expect(result).toEqual([]);
  });

  it('handles empty input with (all)', () => {
    const empty: typeof items = [];
    const result = filterBySchema(empty, '(all)');
    expect(result).toEqual([]);
  });

  it('works with memo-like objects (schema optional)', () => {
    const memos = [
      { id: 'm1', text: 'Note A', schema: 'auth' },
      { id: 'm2', text: 'Note B' },
    ];
    expect(filterBySchema(memos, 'auth')).toEqual([{ id: 'm1', text: 'Note A', schema: 'auth' }]);
    expect(filterBySchema(memos, '')).toEqual([{ id: 'm2', text: 'Note B' }]);
  });

  it('is case-sensitive', () => {
    const result = filterBySchema(items, 'Public');
    expect(result).toEqual([]);
  });

  it('does not mutate original array', () => {
    const original = [...items];
    filterBySchema(items, 'public');
    expect(items).toEqual(original);
  });
});

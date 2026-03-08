import { describe, it, expect } from 'vitest';
import { hasDragExceededThreshold } from './memo-expand';

describe('hasDragExceededThreshold', () => {
  it('returns false when within threshold', () => {
    expect(hasDragExceededThreshold(3, 2)).toBe(false);
    expect(hasDragExceededThreshold(0, 0)).toBe(false);
    expect(hasDragExceededThreshold(5, 5)).toBe(false);
  });

  it('returns true when X exceeds threshold', () => {
    expect(hasDragExceededThreshold(6, 0)).toBe(true);
    expect(hasDragExceededThreshold(10, 2)).toBe(true);
  });

  it('returns true when Y exceeds threshold', () => {
    expect(hasDragExceededThreshold(0, 6)).toBe(true);
    expect(hasDragExceededThreshold(3, 10)).toBe(true);
  });

  it('returns true when both exceed threshold', () => {
    expect(hasDragExceededThreshold(10, 10)).toBe(true);
  });

  it('handles negative values (uses abs)', () => {
    expect(hasDragExceededThreshold(-6, 0)).toBe(true);
    expect(hasDragExceededThreshold(0, -6)).toBe(true);
    expect(hasDragExceededThreshold(-3, -2)).toBe(false);
  });

  it('uses custom threshold', () => {
    expect(hasDragExceededThreshold(8, 0, 10)).toBe(false);
    expect(hasDragExceededThreshold(11, 0, 10)).toBe(true);
  });

  it('threshold=0 means any movement triggers', () => {
    expect(hasDragExceededThreshold(1, 0, 0)).toBe(true);
    expect(hasDragExceededThreshold(0, 0, 0)).toBe(false);
  });
});

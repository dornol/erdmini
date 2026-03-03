import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeTime } from './history-labels';

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeNow(now: number) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  }

  const BASE = 1_700_000_000_000;

  describe('fine granularity (default)', () => {
    it('returns "now" for less than 5 seconds ago', () => {
      fakeNow(BASE + 3_000);
      expect(relativeTime(BASE)).toBe('now');
    });

    it('returns seconds for 5-59s', () => {
      fakeNow(BASE + 30_000);
      expect(relativeTime(BASE)).toBe('30s');
    });

    it('returns minutes for 60s-59m', () => {
      fakeNow(BASE + 5 * 60_000);
      expect(relativeTime(BASE)).toBe('5m');
    });

    it('returns hours for 1h-23h', () => {
      fakeNow(BASE + 3 * 3_600_000);
      expect(relativeTime(BASE)).toBe('3h');
    });

    it('returns days for 24h+', () => {
      fakeNow(BASE + 2 * 86_400_000);
      expect(relativeTime(BASE)).toBe('2d');
    });

    it('floors partial values', () => {
      fakeNow(BASE + 90_000); // 1m30s
      expect(relativeTime(BASE)).toBe('1m');
    });
  });

  describe('coarse granularity', () => {
    it('returns "< 1m" for less than 60 seconds', () => {
      fakeNow(BASE + 30_000);
      expect(relativeTime(BASE, 'coarse')).toBe('< 1m');
    });

    it('returns "< 1m" for 0 diff', () => {
      fakeNow(BASE);
      expect(relativeTime(BASE, 'coarse')).toBe('< 1m');
    });

    it('returns minutes for 1m-59m', () => {
      fakeNow(BASE + 5 * 60_000);
      expect(relativeTime(BASE, 'coarse')).toBe('5m');
    });

    it('returns hours for 1h-23h', () => {
      fakeNow(BASE + 7 * 3_600_000);
      expect(relativeTime(BASE, 'coarse')).toBe('7h');
    });

    it('returns days for 24h+', () => {
      fakeNow(BASE + 3 * 86_400_000);
      expect(relativeTime(BASE, 'coarse')).toBe('3d');
    });

    it('floors partial minute values', () => {
      fakeNow(BASE + 90_000); // 1m30s → 1m
      expect(relativeTime(BASE, 'coarse')).toBe('1m');
    });
  });

  describe('edge cases', () => {
    it('fine: exactly 5s shows "5s"', () => {
      fakeNow(BASE + 5_000);
      expect(relativeTime(BASE)).toBe('5s');
    });

    it('fine: exactly 60s shows "1m"', () => {
      fakeNow(BASE + 60_000);
      expect(relativeTime(BASE)).toBe('1m');
    });

    it('coarse: exactly 60s shows "1m"', () => {
      fakeNow(BASE + 60_000);
      expect(relativeTime(BASE, 'coarse')).toBe('1m');
    });
  });
});

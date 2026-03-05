import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows requests within limit', () => {
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 1000 });
    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(true);
    expect(limiter.check('ip1')).toBe(true);
  });

  it('blocks requests exceeding limit', () => {
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 1000 });
    limiter.check('ip1');
    limiter.check('ip1');
    limiter.check('ip1');
    expect(limiter.check('ip1')).toBe(false);
  });

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 1000 });
    limiter.check('ip1');
    limiter.check('ip1');
    // ip1 is now exhausted
    expect(limiter.check('ip1')).toBe(false);
    // ip2 is still fresh
    expect(limiter.check('ip2')).toBe(true);
  });

  it('resets after window expires', () => {
    const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 1000 });
    const t0 = 100_000;
    limiter.check('ip1', t0);
    limiter.check('ip1', t0);
    expect(limiter.check('ip1', t0)).toBe(false);

    // After window expires, should be allowed again
    const t1 = t0 + 1001;
    expect(limiter.check('ip1', t1)).toBe(true);
  });

  it('cleans up expired entries', () => {
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 1000 });
    const t0 = 100_000;
    limiter.check('ip1', t0);
    limiter.check('ip2', t0);
    limiter.check('ip3', t0);
    expect(limiter.size).toBe(3);

    // After window expires, cleanup should remove all
    limiter.cleanup(t0 + 1001);
    expect(limiter.size).toBe(0);
  });

  it('cleanup keeps non-expired entries', () => {
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 1000 });
    const t0 = 100_000;
    limiter.check('ip1', t0);
    limiter.check('ip2', t0 + 500);

    // At t0+1001, ip1 expired but ip2 still valid
    limiter.cleanup(t0 + 1001);
    expect(limiter.size).toBe(1);
  });

  it('auto-cleans when map exceeds maxMapSize', () => {
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 1000, maxMapSize: 3 });
    const t0 = 100_000;

    // Add 3 entries at t0
    limiter.check('ip1', t0);
    limiter.check('ip2', t0);
    limiter.check('ip3', t0);
    expect(limiter.size).toBe(3);

    // At t0+1001, all 3 are expired. Adding ip4 triggers cleanup
    const t1 = t0 + 1001;
    limiter.check('ip4', t1);
    // Should have cleaned up expired entries: only ip4 remains
    expect(limiter.size).toBe(1);
  });

  it('auto-clean keeps non-expired entries when map exceeds maxMapSize', () => {
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 1000, maxMapSize: 2 });
    const t0 = 100_000;

    limiter.check('ip1', t0);
    limiter.check('ip2', t0);
    expect(limiter.size).toBe(2);

    // ip3 at t0+500: ip1 and ip2 still valid (window=1000), map size=3 > maxMapSize=2
    // but no expired entries to clean
    limiter.check('ip3', t0 + 500);
    expect(limiter.size).toBe(3); // nothing expired to clean

    // ip4 at t0+1001: ip1 and ip2 expired, cleanup triggers
    limiter.check('ip4', t0 + 1001);
    // ip1,ip2 cleaned, ip3 still valid, ip4 just added
    expect(limiter.size).toBe(2);
  });

  it('uses default values when no options provided', () => {
    const limiter = new RateLimiter();
    // Default maxAttempts=10
    for (let i = 0; i < 10; i++) {
      expect(limiter.check('ip1')).toBe(true);
    }
    expect(limiter.check('ip1')).toBe(false);
  });

  it('returns false on exact boundary (maxAttempts+1)', () => {
    const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 1000 });
    expect(limiter.check('ip1')).toBe(true);  // count=1, allowed
    expect(limiter.check('ip1')).toBe(false); // count=2, blocked
  });

  it('handles rapid successive calls to same key', () => {
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const t = 100_000;
    const results = [];
    for (let i = 0; i < 8; i++) {
      results.push(limiter.check('ip1', t));
    }
    expect(results).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('window resets completely after expiry', () => {
    const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 1000 });
    const t0 = 100_000;

    // Exhaust first window
    limiter.check('ip1', t0);
    limiter.check('ip1', t0);
    expect(limiter.check('ip1', t0)).toBe(false);

    // New window — full attempts available again
    const t1 = t0 + 1001;
    expect(limiter.check('ip1', t1)).toBe(true);
    expect(limiter.check('ip1', t1)).toBe(true);
    expect(limiter.check('ip1', t1)).toBe(false);
  });
});

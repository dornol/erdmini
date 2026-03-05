/**
 * In-memory rate limiter for login attempts.
 * Node.js single-threaded — no race conditions on Map access.
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxMapSize: number;

  constructor(options?: { maxAttempts?: number; windowMs?: number; maxMapSize?: number }) {
    this.maxAttempts = options?.maxAttempts ?? 10;
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxMapSize = options?.maxMapSize ?? 1000;
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  check(key: string, now = Date.now()): boolean {
    let entry = this.attempts.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + this.windowMs };
      this.attempts.set(key, entry);
    }
    entry.count++;

    // Prevent unbounded map growth
    if (this.attempts.size > this.maxMapSize) {
      this.cleanup(now);
    }

    return entry.count <= this.maxAttempts;
  }

  /** Remove expired entries. */
  cleanup(now = Date.now()): void {
    for (const [key, val] of this.attempts) {
      if (now > val.resetTime) this.attempts.delete(key);
    }
  }

  /** Current number of tracked keys. */
  get size(): number {
    return this.attempts.size;
  }
}

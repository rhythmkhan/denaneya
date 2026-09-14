import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressiveRateLimiter, MemoryRateLimitStore } from '../src/rate-limiter.js';
import type { RateLimitRule } from '../src/types.js';

describe('ProgressiveRateLimiter', () => {
  let limiter: ProgressiveRateLimiter;
  let store: MemoryRateLimitStore;

  const testRule: RateLimitRule = {
    name: 'test:limit',
    windowMs: 1000,
    maxRequests: 3,
    baseLockoutSeconds: 5,
    penaltyWindowMs: 60000,
  };

  beforeEach(() => {
    store = new MemoryRateLimitStore();
    limiter = new ProgressiveRateLimiter(store);
  });

  it('T2.17: allows requests within quota', async () => {
    const key = 'ip_1.2.3.4';
    const res1 = await limiter.check(key, testRule);
    const res2 = await limiter.check(key, testRule);
    const res3 = await limiter.check(key, testRule);

    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('T2.18: rejects requests exceeding quota with retry-after', async () => {
    const key = 'ip_5.6.7.8';
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);

    const blocked = await limiter.check(key, testRule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.isLockedOut).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('T2.19: progressive multiplier increases with repeated violations', async () => {
    const key = 'ip_violator';
    // 1st violation
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);
    const viol1 = await limiter.check(key, testRule);
    expect(viol1.penaltyMultiplier).toBe(1);
    expect(viol1.retryAfterSeconds).toBe(5);

    // Simulate lockout expiry but within penaltyWindow
    await store.recordViolation(key, 0, 60000); // add another violation
    const viol2 = await limiter.check(key, testRule);
    expect(viol2.penaltyMultiplier).toBeGreaterThanOrEqual(2);
  });

  it('T2.20: reset clears rate limit state', async () => {
    const key = 'ip_to_reset';
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);
    await limiter.check(key, testRule);
    await limiter.check(key, testRule); // blocked

    await limiter.reset(key);

    const fresh = await limiter.check(key, testRule);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(2);
  });
});

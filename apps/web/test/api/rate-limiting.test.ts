import { describe, it, expect } from 'vitest';
import { defaultRateLimiter, RATE_LIMIT_RULES } from '@denaneya/security';

describe('Sliding-Window Rate Limiting Engine', () => {
  it('permits requests within allowed quota', async () => {
    const key = `test_ratelimit_allow_${Date.now()}`;
    const rule = {
      name: 'TEST_RULE',
      maxRequests: 5,
      windowMs: 60 * 1000,
      baseLockoutSeconds: 10,
    };

    const res1 = await defaultRateLimiter.check(key, rule);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);
    expect(res1.limit).toBe(5);

    const res2 = await defaultRateLimiter.check(key, rule);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it('rejects requests exceeding quota with retry-after calculation', async () => {
    const key = `test_ratelimit_block_${Date.now()}`;
    const rule = {
      name: 'TEST_STRICT',
      maxRequests: 2,
      windowMs: 10 * 1000,
      baseLockoutSeconds: 10,
    };

    await defaultRateLimiter.check(key, rule); // 1
    await defaultRateLimiter.check(key, rule); // 2
    const blockedRes = await defaultRateLimiter.check(key, rule); // 3 (exceeded)

    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
    expect(blockedRes.retryAfterSeconds).toBeLessThanOrEqual(10);
  });

  it('provides predefined production rules for payment, auth, and webhooks', () => {
    expect(RATE_LIMIT_RULES.PAYMENT_API).toBeDefined();
    expect(RATE_LIMIT_RULES.PAYMENT_API.maxRequests).toBeGreaterThan(0);
    expect(RATE_LIMIT_RULES.AUTH_LOGIN).toBeDefined();
    expect(RATE_LIMIT_RULES.AUTH_LOGIN.maxRequests).toBeLessThanOrEqual(20); // Strict auth brute-force limit
  });
});

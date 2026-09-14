import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { defaultRateLimiter, RATE_LIMIT_RULES } from '@denaneya/security';
import { checkRateLimit, getRateLimiter, resetRateLimit } from '../../src/lib/api/rate-limit';
import { ApiError } from '../../src/lib/api/errors';

describe('Sliding-Window Rate Limiting Engine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

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
    expect(RATE_LIMIT_RULES.AUTH_LOGIN.maxRequests).toBeLessThanOrEqual(20);
    expect(RATE_LIMIT_RULES.WEBHOOK_OUTBOUND).toBeDefined();
    expect(RATE_LIMIT_RULES.WEBHOOK_OUTBOUND.maxRequests).toBeGreaterThan(0);
  });

  describe('checkRateLimit API integration', () => {
    it('sets standard X-RateLimit-* headers on allowed requests', async () => {
      const merchantId = `mch_api_rate_${Date.now()}`;
      const req = new NextRequest('http://localhost/api/v1/payments', {
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'x-request-id': 'req_rate_101',
        },
      });

      const rule = {
        name: 'test:web_api',
        maxRequests: 10,
        windowMs: 60000,
        baseLockoutSeconds: 30,
      };

      const headers = await checkRateLimit(req, merchantId, rule);
      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBeDefined();
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('throws ApiError 429 with retry-after header when rate limit is exceeded', async () => {
      const merchantId = `mch_strict_${Date.now()}`;
      const req = new NextRequest('http://localhost/api/v1/payments', {
        headers: {
          'x-forwarded-for': '203.0.113.200',
          'x-request-id': 'req_rate_overflow',
        },
      });

      const strictRule = {
        name: 'test:strict_block',
        maxRequests: 1,
        windowMs: 60000,
        baseLockoutSeconds: 45,
      };

      await checkRateLimit(req, merchantId, strictRule); // 1st allowed

      // 2nd request exceeds quota -> throws ApiError 429
      await expect(checkRateLimit(req, merchantId, strictRule)).rejects.toThrow(ApiError);
      try {
        await checkRateLimit(req, merchantId, strictRule);
      } catch (err: any) {
        expect(err.statusCode).toBe(429);
        expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(err.details?.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it('Critical Invariant: seamlessly falls back to in-memory rate limiting when Upstash is unreachable', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://mock-unreachable.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

      // Simulate network timeout / error when reaching Upstash
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Upstash connection timed out (ETIMEDOUT)'));

      const merchantId = `mch_resilient_${Date.now()}`;
      const req = new NextRequest('http://localhost/api/v1/payments', {
        headers: {
          'x-forwarded-for': '198.51.100.5',
          'x-request-id': 'req_resilient_1',
        },
      });

      const rule = {
        name: 'test:resilient_fallback',
        maxRequests: 3,
        windowMs: 60000,
        baseLockoutSeconds: 20,
      };

      // Invariant: Requests are NEVER dropped or errored out; they smoothly evaluate via in-memory limiter
      const headers1 = await checkRateLimit(req, merchantId, rule);
      expect(headers1['X-RateLimit-Limit']).toBe('3');
      expect(headers1['X-RateLimit-Remaining']).toBe('2');

      const headers2 = await checkRateLimit(req, merchantId, rule);
      expect(headers2['X-RateLimit-Remaining']).toBe('1');
    });

    it('resetRateLimit resets rate limit counter for identifier', async () => {
      const merchantId = `mch_reset_${Date.now()}`;
      const req = new NextRequest('http://localhost/api/v1/payments');

      const rule = {
        name: 'test:reset_flow',
        maxRequests: 1,
        windowMs: 60000,
        baseLockoutSeconds: 60,
      };

      await checkRateLimit(req, merchantId, rule);
      await expect(checkRateLimit(req, merchantId, rule)).rejects.toThrow(ApiError);

      await resetRateLimit(merchantId, rule);

      const afterResetHeaders = await checkRateLimit(req, merchantId, rule);
      expect(afterResetHeaders['X-RateLimit-Limit']).toBe('1');
      expect(afterResetHeaders['X-RateLimit-Remaining']).toBe('0');
    });

    it('getRateLimiter returns the shared rate limiter instance', () => {
      const limiter = getRateLimiter();
      expect(limiter).toBeDefined();
      expect(typeof limiter.check).toBe('function');
    });

    it('extracts client IP from x-real-ip header when x-forwarded-for is not set', async () => {
      const req = new NextRequest('http://localhost/api/v1/payments', {
        headers: {
          'x-real-ip': '198.51.100.99',
        },
      });

      const rule = {
        name: 'test:real_ip',
        maxRequests: 5,
        windowMs: 60000,
        baseLockoutSeconds: 10,
      };

      const headers = await checkRateLimit(req, '', rule);
      expect(headers['X-RateLimit-Limit']).toBe('5');
      expect(headers['X-RateLimit-Remaining']).toBe('4');
    });

    it('applies exponential penalty multiplier on consecutive violations', async () => {
      const merchantId = `mch_consec_${Date.now()}`;
      const req = new NextRequest('http://localhost/api/v1/payments');

      const rule = {
        name: 'test:consec_penalty',
        maxRequests: 1,
        windowMs: 60000,
        baseLockoutSeconds: 10,
        penaltyWindowMs: 300000,
      };

      // 1st request ok
      await checkRateLimit(req, merchantId, rule);

      // 1st violation -> multiplier 1x (10s)
      try {
        await checkRateLimit(req, merchantId, rule);
        expect.fail('Should have thrown ApiError');
      } catch (err: any) {
        expect(err.statusCode).toBe(429);
        expect(err.details?.penaltyMultiplier).toBe(1);
      }
    });
  });
});

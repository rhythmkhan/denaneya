import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UpstashRedisClient,
  UpstashRateLimitStore,
  ResilientRateLimitStore,
  DynamicResilientRateLimitStore,
  ProgressiveRateLimiter,
  DistributedRateLimiter,
  MemoryRateLimitStore,
  createRateLimiter,
  RATE_LIMIT_RULES,
} from '../src/rate-limiter.js';
import type { RateLimitRule } from '../src/types.js';

describe('Distributed Rate Limiting with Upstash Redis & Resilient Fallback', () => {
  const originalEnv = process.env;
  const mockUrl = 'https://mock-redis.upstash.io';
  const mockToken = 'mock-secret-token';

  const testRule: RateLimitRule = {
    name: 'test:distributed',
    windowMs: 60000,
    maxRequests: 3,
    baseLockoutSeconds: 10,
    penaltyWindowMs: 300000,
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('UpstashRedisClient', () => {
    it('executes single command with authorization headers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const result = await client.command(['SET', 'key1', 'val1']);

      expect(result).toBe('OK');
      expect(fetchSpy).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(['SET', 'key1', 'val1']),
        })
      );
    });

    it('executes atomic pipeline command and maps results', async () => {
      const pipelineResponse = [
        { result: 0 },
        { result: 1 },
        { result: 2 },
        { result: ['1726000000:abc', 1726000000] },
        { result: 1 },
      ];

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(pipelineResponse), { status: 200 })
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const results = await client.pipeline([
        ['ZREMRANGEBYSCORE', 'hits', '-inf', 100],
        ['ZADD', 'hits', 200, 'member'],
        ['ZCARD', 'hits'],
        ['ZRANGE', 'hits', 0, 0, 'WITHSCORES'],
        ['PEXPIRE', 'hits', 60000],
      ]);

      expect(results).toEqual([0, 1, 2, ['1726000000:abc', 1726000000], 1]);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${mockUrl}/pipeline`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
    });

    it('throws when Upstash returns HTTP error status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized token', { status: 401 })
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: 'invalid' });
      await expect(client.command(['GET', 'test'])).rejects.toThrow(/HTTP error 401/);
    });

    it('throws when Redis command returns error object', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'ERR unknown command' }), { status: 200 })
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      await expect(client.command(['INVALID'])).rejects.toThrow(/ERR unknown command/);
    });
  });

  describe('UpstashRateLimitStore', () => {
    it('increments sliding-window count using Redis sorted set pipeline', async () => {
      const now = Date.now();
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { result: 0 },
            { result: 1 },
            { result: 2 }, // count = 2
            { result: [`${now}:xyz`, now - 5000] }, // oldest score
            { result: 1 },
          ]),
          { status: 200 }
        )
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const store = new UpstashRateLimitStore(client);
      const res = await store.increment('usr_123', 60000);

      expect(res.count).toBe(2);
      expect(res.ttlMs).toBeGreaterThan(0);
      expect(res.ttlMs).toBeLessThanOrEqual(60000);
    });

    it('stores and retrieves lockout penalties', async () => {
      const lockedUntil = Date.now() + 60000;
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: null }), { status: 200 }) // getPenalty -> null
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: 'OK' }), { status: 200 }) // recordViolation SET
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ result: JSON.stringify({ violationCount: 1, lockedUntil }) }),
            { status: 200 }
          ) // getPenalty -> penalty object
        );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const store = new UpstashRateLimitStore(client);

      const violationCount = await store.recordViolation('usr_offender', 60000, 300000);
      expect(violationCount).toBe(1);

      const penalty = await store.getPenalty('usr_offender');
      expect(penalty).not.toBeNull();
      expect(penalty?.violationCount).toBe(1);
      expect(penalty?.lockedUntil).toBe(lockedUntil);
    });

    it('resets hits and penalty keys', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 2 }), { status: 200 })
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const store = new UpstashRateLimitStore(client);
      await store.reset('usr_reset');

      expect(fetchSpy).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          body: JSON.stringify(['DEL', 'rl:hits:usr_reset', 'rl:pen:usr_reset']),
        })
      );
    });
  });

  describe('Critical Invariant: Seamless Fallback & Zero Request Drops', () => {
    it('Invariant 1: falls back to in-memory store when UPSTASH env vars are not set', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiter = new DistributedRateLimiter();
      const key = 'ip_unconfigured_env';

      // 1. Requests within quota succeed
      const res1 = await limiter.check(key, testRule);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await limiter.check(key, testRule);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await limiter.check(key, testRule);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);

      // 2. Over-quota request rejected gracefully with retryAfter, not an unhandled crash
      const blocked = await limiter.check(key, testRule);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.isLockedOut).toBe(true);
    });

    it('Invariant 2: seamlessly falls back to memory store when Upstash is unreachable (network timeout/error)', async () => {
      process.env.UPSTASH_REDIS_REST_URL = mockUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = mockToken;

      // Simulate network connection failure
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));

      const limiter = createRateLimiter({
        redisUrl: mockUrl,
        redisToken: mockToken,
      });

      const key = 'ip_outage_fallback';

      // Despite Upstash being completely offline, requests are NEVER dropped or broken
      const r1 = await limiter.check(key, testRule);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.check(key, testRule);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.check(key, testRule);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      const blocked = await limiter.check(key, testRule);
      expect(blocked.allowed).toBe(false);
      expect(blocked.isLockedOut).toBe(true);
    });

    it('Invariant 3: seamlessly falls back when Upstash times out (AbortError)', async () => {
      process.env.UPSTASH_REDIS_REST_URL = mockUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = mockToken;

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      const limiter = new DistributedRateLimiter({
        redisUrl: mockUrl,
        redisToken: mockToken,
        timeoutMs: 100,
      });

      const key = 'ip_timeout_fallback';
      const res = await limiter.check(key, testRule);

      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(2);
    });

    it('Invariant 4: seamlessly falls back when Upstash returns HTTP 500 / 503 Internal Server Error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Redis cluster error', { status: 503 })
      );

      const limiter = createRateLimiter({
        redisUrl: mockUrl,
        redisToken: mockToken,
      });

      const key = 'ip_http500_fallback';
      const res = await limiter.check(key, testRule);

      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(2);
    });

    it('Invariant 5: reset operation functions smoothly under fallback', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network Down'));

      const limiter = createRateLimiter({
        redisUrl: mockUrl,
        redisToken: mockToken,
      });

      const key = 'ip_reset_fallback';
      await limiter.check(key, testRule);
      await limiter.check(key, testRule);
      await limiter.check(key, testRule);
      const blocked = await limiter.check(key, testRule);
      expect(blocked.allowed).toBe(false);

      await limiter.reset(key);

      const fresh = await limiter.check(key, testRule);
      expect(fresh.allowed).toBe(true);
      expect(fresh.remaining).toBe(2);
    });
  });

  describe('DynamicResilientRateLimitStore & defaultRateLimiter', () => {
    it('defaultRateLimiter automatically adapts when environment variables are set or removed', async () => {
      // Start with no env vars -> memory store
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const store = new DynamicResilientRateLimitStore();
      const res1 = await store.increment('key_dyn_1', 60000);
      expect(res1.count).toBe(1);

      // Dynamically supply Upstash env vars
      process.env.UPSTASH_REDIS_REST_URL = mockUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = mockToken;

      const pipelineResponse = [
        { result: 0 },
        { result: 1 },
        { result: 5 },
        { result: ['1726000000:m', 1726000000] },
        { result: 1 },
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(pipelineResponse), { status: 200 })
      );

      const res2 = await store.increment('key_dyn_2', 60000);
      expect(res2.count).toBe(5);
    });

    it('safely handles leading/trailing whitespace in environment variables', async () => {
      process.env.UPSTASH_REDIS_REST_URL = `  ${mockUrl}  \n`;
      process.env.UPSTASH_REDIS_REST_TOKEN = `  ${mockToken}  \t`;

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'PONG' }), { status: 200 })
      );

      const client = new UpstashRedisClient();
      expect(client.isConfigured).toBe(true);
      const res = await client.command(['PING']);
      expect(res).toBe('PONG');
      expect(fetchSpy).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
    });

    it('recovers to primary Upstash store after outage when cooldown expires', async () => {
      const primary = new UpstashRateLimitStore(new UpstashRedisClient({ url: mockUrl, token: mockToken }));
      const fallback = new MemoryRateLimitStore();
      const resilient = new ResilientRateLimitStore(primary, fallback, 100); // 100ms cooldown

      // 1. Primary fails
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const res1 = await resilient.increment('recovery_key', 60000);
      expect(res1.count).toBe(1); // from fallback
      expect(resilient.isFailing()).toBe(true);

      // 2. Immediate next call uses fallback without attempting fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const res2 = await resilient.increment('recovery_key', 60000);
      expect(res2.count).toBe(2); // fallback incremented
      expect(fetchSpy).not.toHaveBeenCalled();

      // 3. Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 4. Primary recovered
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { result: 0 },
            { result: 1 },
            { result: 1 },
            { result: [`1726000000:abc`, 1726000000] },
            { result: 1 },
          ]),
          { status: 200 }
        )
      );

      const res3 = await resilient.increment('recovery_key', 60000);
      expect(res3.count).toBe(1); // from primary
      expect(resilient.isFailing()).toBe(false);
    });
  });

  describe('Edge Case Hardening: Object array ZRANGE & Extended Lockout TTL', () => {
    it('parses oldest score when Redis returns array of objects with score property', async () => {
      const now = Date.now();
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { result: 0 },
            { result: 1 },
            { result: 3 },
            { result: [{ member: 'm1', score: now - 10000 }, { member: 'm2', score: now - 5000 }] },
            { result: 1 },
          ]),
          { status: 200 }
        )
      );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const store = new UpstashRateLimitStore(client);
      const res = await store.increment('usr_obj_score', 60000);

      expect(res.count).toBe(3);
      // ttl should be based on oldest item (m1 at now - 10000), so ~50000ms
      expect(res.ttlMs).toBeGreaterThanOrEqual(49000);
      expect(res.ttlMs).toBeLessThanOrEqual(51000);
    });

    it('ensures Redis lockout TTL does not truncate when lockout exceeds penalty window', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: null }), { status: 200 }) // getPenalty
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: 'OK' }), { status: 200 }) // recordViolation
        );

      const client = new UpstashRedisClient({ url: mockUrl, token: mockToken });
      const store = new UpstashRateLimitStore(client);

      const lockoutMs = 3600000; // 1 hour lockout
      const penaltyWindowMs = 900000; // 15 minute penalty window

      await store.recordViolation('usr_extended_lockout', lockoutMs, penaltyWindowMs);

      // Verify that Redis PX is set to Math.max(penaltyWindowMs, lockoutMs) = 3600000, NOT 900000
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe(mockUrl);
      const parsedBody = JSON.parse(lastCall[1].body);
      expect(parsedBody[0]).toBe('SET');
      expect(parsedBody[1]).toBe('rl:pen:usr_extended_lockout');
      expect(parsedBody[3]).toBe('PX');
      expect(parsedBody[4]).toBe(lockoutMs);
    });
  });
});

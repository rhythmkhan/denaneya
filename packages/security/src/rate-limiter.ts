import { Logger } from '@denaneya/observability';
import type {
  RateLimitRule,
  RateLimitResult,
  RateLimitStore,
  UpstashRedisConfig,
  ResilientRateLimiterOptions,
} from './types.js';

const logger = new Logger({ service: 'rate-limiter' });

export class MemoryRateLimitStore implements RateLimitStore {
  private hits: Map<string, { timestamps: number[] }> = new Map();
  private penalties: Map<string, { violationCount: number; lockedUntil: number }> = new Map();

  public async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    const now = Date.now();
    const threshold = now - windowMs;
    const record = this.hits.get(key) || { timestamps: [] };

    // Evict expired hits
    const active = record.timestamps.filter((t) => t > threshold);
    active.push(now);
    this.hits.set(key, { timestamps: active });

    const oldest = active[0] ?? now;
    const ttlMs = Math.max(0, oldest + windowMs - now);

    return { count: active.length, ttlMs };
  }

  public async getPenalty(key: string): Promise<{ violationCount: number; lockedUntil: number } | null> {
    const p = this.penalties.get(key);
    if (!p) return null;
    if (Date.now() > p.lockedUntil) {
      // Lockout expired, but preserve violationCount until penaltyWindow ends
      return { violationCount: p.violationCount, lockedUntil: p.lockedUntil };
    }
    return p;
  }

  public async recordViolation(key: string, lockoutMs: number, penaltyWindowMs: number): Promise<number> {
    const existing = this.penalties.get(key);
    const count = (existing?.violationCount || 0) + 1;
    const lockedUntil = Date.now() + lockoutMs;

    this.penalties.set(key, { violationCount: count, lockedUntil });

    // Clean up penalty record after penaltyWindowMs or lockoutMs (whichever is larger)
    const cleanupTtlMs = Math.max(penaltyWindowMs, lockoutMs);
    const timer = setTimeout(() => {
      const current = this.penalties.get(key);
      if (current && current.lockedUntil <= Date.now()) {
        this.penalties.delete(key);
      }
    }, cleanupTtlMs);
    timer.unref?.();

    return count;
  }

  public async reset(key: string): Promise<void> {
    this.hits.delete(key);
    this.penalties.delete(key);
  }
}

/**
 * Native HTTP client for Upstash Redis REST API.
 */
export class UpstashRedisClient {
  private url: string;
  private token: string;
  private timeoutMs: number;

  constructor(config: UpstashRedisConfig = {}) {
    const url = (config.url ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
    const token = (config.token ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = config.timeoutMs ?? 1500;
  }

  public get isConfigured(): boolean {
    return Boolean(this.url && this.token);
  }

  public async command<T = any>(cmd: (string | number)[]): Promise<T> {
    if (!this.url || !this.token) {
      throw new Error('Upstash Redis URL and Token must be configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cmd),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upstash Redis HTTP error ${res.status}: ${text}`);
      }

      const json = (await res.json()) as any;
      if (json && json.error) {
        throw new Error(`Upstash Redis error: ${json.error}`);
      }

      return json?.result;
    } finally {
      clearTimeout(timer);
    }
  }

  public async pipeline<T = any>(commands: (string | number)[][]): Promise<T[]> {
    if (!this.url || !this.token) {
      throw new Error('Upstash Redis URL and Token must be configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upstash Redis pipeline HTTP error ${res.status}: ${text}`);
      }

      const json = (await res.json()) as any;
      if (!Array.isArray(json)) {
        throw new Error('Upstash Redis pipeline expected array response');
      }

      for (const item of json) {
        if (item && item.error) {
          throw new Error(`Upstash Redis command error: ${item.error}`);
        }
      }

      return json.map((item: any) => item?.result);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Distributed rate limit store backed by Upstash Redis REST API.
 * Uses atomic Redis pipelines and sliding-window sorted sets (ZSET).
 */
export class UpstashRateLimitStore implements RateLimitStore {
  constructor(private readonly client: UpstashRedisClient) {}

  public async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    const now = Date.now();
    const threshold = now - windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    const hitsKey = `rl:hits:${key}`;

    const results = await this.client.pipeline([
      ['ZREMRANGEBYSCORE', hitsKey, '-inf', threshold],
      ['ZADD', hitsKey, now, member],
      ['ZCARD', hitsKey],
      ['ZRANGE', hitsKey, 0, 0, 'WITHSCORES'],
      ['PEXPIRE', hitsKey, Math.max(windowMs * 2, 60000)],
    ]);

    const count = typeof results[2] === 'number' ? results[2] : Number(results[2]) || 1;
    let ttlMs = windowMs;

    const oldestItem = results[3];
    let oldestScore: number | undefined;

    if (Array.isArray(oldestItem) && oldestItem.length > 0) {
      if (typeof oldestItem[0] === 'object' && oldestItem[0] !== null && 'score' in oldestItem[0]) {
        oldestScore = Number((oldestItem[0] as any).score);
      } else if (oldestItem.length >= 2) {
        oldestScore = Number(oldestItem[1]);
      } else if (typeof oldestItem[0] === 'number') {
        oldestScore = oldestItem[0];
      }
    }

    if (oldestScore !== undefined && !Number.isNaN(oldestScore)) {
      ttlMs = Math.max(0, oldestScore + windowMs - now);
    }

    return { count, ttlMs };
  }

  public async getPenalty(key: string): Promise<{ violationCount: number; lockedUntil: number } | null> {
    const penaltyKey = `rl:pen:${key}`;
    const raw = await this.client.command<any>(['GET', penaltyKey]);
    if (!raw) return null;

    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed.lockedUntil !== 'number') return null;
      if (Date.now() > parsed.lockedUntil) {
        return { violationCount: parsed.violationCount, lockedUntil: parsed.lockedUntil };
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public async recordViolation(key: string, lockoutMs: number, penaltyWindowMs: number): Promise<number> {
    const penaltyKey = `rl:pen:${key}`;
    const existing = await this.getPenalty(key);
    const count = (existing?.violationCount || 0) + 1;
    const lockedUntil = Date.now() + lockoutMs;
    const cleanupTtlMs = Math.max(penaltyWindowMs, lockoutMs);

    await this.client.command([
      'SET',
      penaltyKey,
      JSON.stringify({ violationCount: count, lockedUntil }),
      'PX',
      cleanupTtlMs,
    ]);

    return count;
  }

  public async reset(key: string): Promise<void> {
    const hitsKey = `rl:hits:${key}`;
    const penaltyKey = `rl:pen:${key}`;
    await this.client.command(['DEL', hitsKey, penaltyKey]);
  }
}

/**
 * Resilient rate limit store combining primary distributed store and fallback in-memory store.
 * Guarantees zero request drops: if primary fails or is unreachable, transparently falls back.
 */
export class ResilientRateLimitStore implements RateLimitStore {
  private isPrimaryFailing = false;
  private lastFailureTime = 0;
  private readonly failureCooldownMs: number;

  constructor(
    private readonly primaryStore: RateLimitStore | null = null,
    private readonly fallbackStore: RateLimitStore = new MemoryRateLimitStore(),
    failureCooldownMs = 5000
  ) {
    this.failureCooldownMs = failureCooldownMs;
  }

  private shouldTryPrimary(): boolean {
    if (!this.primaryStore) return false;
    if (!this.isPrimaryFailing) return true;
    if (Date.now() - this.lastFailureTime > this.failureCooldownMs) {
      this.isPrimaryFailing = false;
      return true;
    }
    return false;
  }

  private markPrimaryFailure(err: any): void {
    this.isPrimaryFailing = true;
    this.lastFailureTime = Date.now();
    logger.warn('Distributed rate limiter primary store unreachable, seamlessly falling back to in-memory store', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  public async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    if (this.shouldTryPrimary()) {
      try {
        return await this.primaryStore!.increment(key, windowMs);
      } catch (err) {
        this.markPrimaryFailure(err);
      }
    }
    return this.fallbackStore.increment(key, windowMs);
  }

  public async getPenalty(key: string): Promise<{ violationCount: number; lockedUntil: number } | null> {
    if (this.shouldTryPrimary()) {
      try {
        return await this.primaryStore!.getPenalty(key);
      } catch (err) {
        this.markPrimaryFailure(err);
      }
    }
    return this.fallbackStore.getPenalty(key);
  }

  public async recordViolation(key: string, lockoutMs: number, penaltyWindowMs: number): Promise<number> {
    if (this.shouldTryPrimary()) {
      try {
        return await this.primaryStore!.recordViolation(key, lockoutMs, penaltyWindowMs);
      } catch (err) {
        this.markPrimaryFailure(err);
      }
    }
    return this.fallbackStore.recordViolation(key, lockoutMs, penaltyWindowMs);
  }

  public async reset(key: string): Promise<void> {
    if (this.shouldTryPrimary()) {
      try {
        await this.primaryStore!.reset(key);
      } catch (err) {
        this.markPrimaryFailure(err);
      }
    }
    await this.fallbackStore.reset(key);
  }

  public getPrimaryStore(): RateLimitStore | null {
    return this.primaryStore;
  }

  public getFallbackStore(): RateLimitStore {
    return this.fallbackStore;
  }

  public isFailing(): boolean {
    return this.isPrimaryFailing;
  }
}

/**
 * Dynamic resilient store that reacts to runtime environment variables.
 * If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, uses Upstash;
 * otherwise uses in-memory store. Automatically falls back if Upstash is unreachable.
 */
export class DynamicResilientRateLimitStore implements RateLimitStore {
  private readonly fallbackStore = new MemoryRateLimitStore();
  private cachedStore: ResilientRateLimitStore | null = null;
  private lastUrl?: string;
  private lastToken?: string;

  private getStore(): RateLimitStore {
    const url = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();

    if (!url || !token) {
      return this.fallbackStore;
    }

    if (this.cachedStore && this.lastUrl === url && this.lastToken === token) {
      return this.cachedStore;
    }

    this.lastUrl = url;
    this.lastToken = token;
    const client = new UpstashRedisClient({ url, token });
    const primary = new UpstashRateLimitStore(client);
    this.cachedStore = new ResilientRateLimitStore(primary, this.fallbackStore);
    return this.cachedStore;
  }

  public getFallbackStore(): MemoryRateLimitStore {
    return this.fallbackStore;
  }

  public getCachedStore(): ResilientRateLimitStore | null {
    return this.cachedStore;
  }

  public async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    return this.getStore().increment(key, windowMs);
  }

  public async getPenalty(key: string): Promise<{ violationCount: number; lockedUntil: number } | null> {
    return this.getStore().getPenalty(key);
  }

  public async recordViolation(key: string, lockoutMs: number, penaltyWindowMs: number): Promise<number> {
    return this.getStore().recordViolation(key, lockoutMs, penaltyWindowMs);
  }

  public async reset(key: string): Promise<void> {
    return this.getStore().reset(key);
  }
}

export function createRateLimitStore(options: ResilientRateLimiterOptions = {}): RateLimitStore {
  const url = (options.redisUrl ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
  const token = (options.redisToken ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  const fallback = options.fallbackStore ?? new MemoryRateLimitStore();

  if (!url || !token) {
    return fallback;
  }

  const client = new UpstashRedisClient({
    url,
    token,
    timeoutMs: options.timeoutMs ?? 1500,
  });
  const primary = new UpstashRateLimitStore(client);
  return new ResilientRateLimitStore(primary, fallback);
}

export class ProgressiveRateLimiter {
  private store: RateLimitStore;

  constructor(store: RateLimitStore = new DynamicResilientRateLimitStore()) {
    this.store = store;
  }

  public getStore(): RateLimitStore {
    return this.store;
  }

  public async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const penaltyWindowMs = rule.penaltyWindowMs ?? 15 * 60 * 1000; // 15 mins default
    const baseLockoutSeconds = rule.baseLockoutSeconds ?? 60; // 60s default

    // 1. Check existing lockout penalty
    const penalty = await this.store.getPenalty(key);
    if (penalty && now < penalty.lockedUntil) {
      const retryAfterSeconds = Math.ceil((penalty.lockedUntil - now) / 1000);
      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetMs: penalty.lockedUntil - now,
        retryAfterSeconds,
        penaltyMultiplier: Math.pow(2, penalty.violationCount - 1),
        isLockedOut: true,
      };
    }

    // 2. Increment request count in window
    const { count, ttlMs } = await this.store.increment(key, rule.windowMs);

    if (count > rule.maxRequests) {
      // Consecutive violation penalty: baseLockout * 2^(violations - 1)
      // e.g. 60s -> 120s -> 240s -> 480s
      const currentViolations = (penalty?.violationCount || 0) + 1;
      const multiplier = Math.min(Math.pow(2, currentViolations - 1), 32); // cap multiplier at 32x
      const lockoutMs = baseLockoutSeconds * multiplier * 1000;

      await this.store.recordViolation(key, lockoutMs, penaltyWindowMs);

      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetMs: lockoutMs,
        retryAfterSeconds: Math.ceil(lockoutMs / 1000),
        penaltyMultiplier: multiplier,
        isLockedOut: true,
      };
    }

    return {
      allowed: true,
      limit: rule.maxRequests,
      remaining: Math.max(0, rule.maxRequests - count),
      resetMs: ttlMs,
      retryAfterSeconds: 0,
      penaltyMultiplier: 1,
      isLockedOut: false,
    };
  }

  public async reset(key: string): Promise<void> {
    await this.store.reset(key);
  }
}

export class DistributedRateLimiter extends ProgressiveRateLimiter {
  constructor(options: ResilientRateLimiterOptions = {}) {
    super(createRateLimitStore(options));
  }
}

export function createRateLimiter(options: ResilientRateLimiterOptions = {}): ProgressiveRateLimiter {
  return new ProgressiveRateLimiter(createRateLimitStore(options));
}

// Pre-configured rate limit rules per requirements
export const RATE_LIMIT_RULES = {
  AUTH_LOGIN: {
    name: 'auth:login',
    windowMs: 60 * 1000,
    maxRequests: 10,
    baseLockoutSeconds: 60,
    penaltyWindowMs: 30 * 60 * 1000,
  },
  CHECKOUT_PAGE: {
    name: 'checkout:view',
    windowMs: 60 * 1000,
    maxRequests: 60,
    baseLockoutSeconds: 60,
  },
  PAYMENT_API: {
    name: 'api:payments',
    windowMs: 60 * 1000,
    maxRequests: 120,
    baseLockoutSeconds: 60,
  },
  ANDROID_SMS_UPLOAD: {
    name: 'device:sms_events',
    windowMs: 60 * 1000,
    maxRequests: 30,
    baseLockoutSeconds: 120,
  },
  WEBHOOK_OUTBOUND: {
    name: 'webhook:outbound_host',
    windowMs: 60 * 1000,
    maxRequests: 60,
    baseLockoutSeconds: 30,
  },
} as const;

export const defaultRateLimiter = new ProgressiveRateLimiter(new DynamicResilientRateLimitStore());

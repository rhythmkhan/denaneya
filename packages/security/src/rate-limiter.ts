import type { RateLimitRule, RateLimitResult, RateLimitStore } from './types.js';

export class MemoryRateLimitStore implements RateLimitStore {
  private hits: Map<string, { timestamps: number[] }> = new Map();
  private penalties: Map<string, { violationCount: number; lockedUntil: number }> = new Map();

  public async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    const now = Date.now();
    const threshold = now - windowMs;
    const record = this.hits.get(key) || { timestamps: [] };

    // Evict expired hits
    const active = record.timestamps.filter(t => t > threshold);
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

    // Clean up penalty record after penaltyWindowMs
    const timer = setTimeout(() => {
      const current = this.penalties.get(key);
      if (current && current.lockedUntil <= Date.now()) {
        this.penalties.delete(key);
      }
    }, penaltyWindowMs);
    timer.unref?.();

    return count;
  }

  public async reset(key: string): Promise<void> {
    this.hits.delete(key);
    this.penalties.delete(key);
  }
}

export class ProgressiveRateLimiter {
  private store: RateLimitStore;

  constructor(store: RateLimitStore = new MemoryRateLimitStore()) {
    this.store = store;
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
  }
} as const;

export const defaultRateLimiter = new ProgressiveRateLimiter();

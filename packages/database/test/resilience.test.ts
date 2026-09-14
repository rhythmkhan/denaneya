import { describe, it, expect, vi } from 'vitest';
import {
  isRetryableDatabaseError,
  retryWithBackoff,
  checkDatabaseHealth,
} from '../src/resilience.js';

describe('Database Connection Resilience & Exponential Backoff', () => {
  describe('isRetryableDatabaseError', () => {
    it('identifies transient PostgreSQL error codes as retryable', () => {
      expect(isRetryableDatabaseError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableDatabaseError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isRetryableDatabaseError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableDatabaseError({ code: '08006' })).toBe(true); // connection_failure
      expect(isRetryableDatabaseError({ code: '40001' })).toBe(true); // serialization_failure
      expect(isRetryableDatabaseError({ code: '57P01' })).toBe(true); // admin_shutdown
      expect(isRetryableDatabaseError({ code: '53300' })).toBe(true); // too_many_connections
    });

    it('identifies Neon serverless compute suspension & connection messages as retryable', () => {
      expect(isRetryableDatabaseError(new Error('NeonDbError: WebSocket connection closed'))).toBe(true);
      expect(isRetryableDatabaseError(new Error('Connection terminated unexpectedly'))).toBe(true);
      expect(isRetryableDatabaseError(new Error('Compute is suspended, waking up endpoint'))).toBe(true);
      expect(isRetryableDatabaseError(new Error('Connection timed out'))).toBe(true);
      expect(isRetryableDatabaseError(new Error('NeonDbError: Remaining connection slots are reserved'))).toBe(true);
      expect(isRetryableDatabaseError({ name: 'NeonDbError', status: 503 })).toBe(true);
    });

    it('classifies non-transient schema/syntax errors as non-retryable', () => {
      expect(isRetryableDatabaseError(new Error('syntax error at or near "SELCT"'))).toBe(false);
      expect(isRetryableDatabaseError(new Error('relation "unknown_table" does not exist'))).toBe(false);
      expect(isRetryableDatabaseError(new Error('null value in column "name" violates not-null constraint'))).toBe(false);
      expect(isRetryableDatabaseError(null)).toBe(false);
      expect(isRetryableDatabaseError(undefined)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('returns result immediately on successful execution without retry', async () => {
      const op = vi.fn().mockResolvedValue('success_data');
      const result = await retryWithBackoff(op, { maxRetries: 3 });

      expect(result).toBe('success_data');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries on transient errors and succeeds within retry limit', async () => {
      let attempts = 0;
      const retryEvents: { attempt: number; delay: number }[] = [];

      const op = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('NeonDbError: WebSocket connection closed');
          (err as any).code = 'ECONNRESET';
          throw err;
        }
        return 'recovered_payload';
      });

      const result = await retryWithBackoff(op, {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffFactor: 2,
        jitter: false,
        onRetry: (_err, attempt, delay) => {
          retryEvents.push({ attempt, delay });
        },
      });

      expect(result).toBe('recovered_payload');
      expect(op).toHaveBeenCalledTimes(3);
      expect(retryEvents).toEqual([
        { attempt: 1, delay: 10 },
        { attempt: 2, delay: 20 },
      ]);
    });

    it('exhausts maxRetries and throws the final error if failure persists', async () => {
      const errorToThrow = new Error('connection refused persistently');
      (errorToThrow as any).code = 'ECONNREFUSED';

      const op = vi.fn().mockRejectedValue(errorToThrow);

      await expect(
        retryWithBackoff(op, {
          maxRetries: 2,
          initialDelayMs: 5,
          jitter: false,
        })
      ).rejects.toThrow('connection refused persistently');

      expect(op).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    });

    it('does not retry and throws immediately when error is not retryable', async () => {
      const fatalError = new Error('column "nonexistent" does not exist');
      const op = vi.fn().mockRejectedValue(fatalError);

      await expect(
        retryWithBackoff(op, {
          maxRetries: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow('column "nonexistent" does not exist');

      expect(op).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkDatabaseHealth', () => {
    it('returns MOCK status for in-memory / simulated client', async () => {
      const mockClient = {
        isMock: true,
        mode: 'mock',
        execute: vi.fn().mockResolvedValue({ rows: [[1]] }),
      };

      const health = await checkDatabaseHealth(mockClient);

      expect(health.status).toBe('MOCK');
      expect(health.mode).toBe('mock');
      expect(typeof health.latencyMs).toBe('number');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeDefined();
    });

    it('returns UP status for healthy real database client with low latency', async () => {
      const liveClient = {
        isMock: false,
        mode: 'neon-pooled',
        host: 'ep-cool-db.ap-southeast-1.aws.neon.tech',
        execute: vi.fn().mockResolvedValue({ rows: [[1]] }),
      };

      const health = await checkDatabaseHealth(liveClient, { degradedThresholdMs: 500 });

      expect(health.status).toBe('UP');
      expect(health.mode).toBe('neon-pooled');
      expect(health.host).toBe('ep-cool-db.ap-southeast-1.aws.neon.tech');
      expect(typeof health.latencyMs).toBe('number');
    });

    it('returns DEGRADED status when query latency exceeds degraded threshold', async () => {
      const slowClient = {
        isMock: false,
        mode: 'neon-pooled',
        host: 'ep-slow-db.neon.tech',
        execute: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 60));
          return { rows: [[1]] };
        }),
      };

      // Set low degraded threshold of 50ms to trigger DEGRADED
      const health = await checkDatabaseHealth(slowClient, { degradedThresholdMs: 50 });

      expect(health.status).toBe('DEGRADED');
      expect(health.latencyMs).toBeGreaterThanOrEqual(50);
    });

    it('returns DOWN status when ping probe fails all retries', async () => {
      const brokenClient = {
        isMock: false,
        mode: 'neon-pooled',
        host: 'ep-down-db.neon.tech',
        execute: vi.fn().mockRejectedValue(new Error('Connection reset by peer')),
      };

      const health = await checkDatabaseHealth(brokenClient, { retries: 1 });

      expect(health.status).toBe('DOWN');
      expect(health.error).toContain('Connection reset by peer');
    });
  });
});

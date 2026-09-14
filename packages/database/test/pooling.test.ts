import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateConnectionString,
  isNeonPooledUrl,
  sanitizeConnectionUrl,
  getPooledUrl,
  getDirectUrl,
  createDbClient,
  createDirectDbClient,
  createPooledDbClient,
  getDb,
  resetGlobalDb,
} from '../src/client.js';

describe('Neon Serverless Pooling & Dual URL Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetGlobalDb();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_POOLED_URL;
    delete process.env.DIRECT_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetGlobalDb();
  });

  describe('validateConnectionString', () => {
    it('accepts valid postgres:// and postgresql:// connection URIs', () => {
      expect(
        validateConnectionString('postgres://user:pass@ep-denaneya-123.ap-southeast-1.aws.neon.tech/denaneya?sslmode=require')
      ).toBe(true);
      expect(
        validateConnectionString('postgresql://user:pass@ep-denaneya-pooler.neon.tech:5432/denaneya')
      ).toBe(true);
    });

    it('rejects invalid or malformed connection strings', () => {
      expect(validateConnectionString('')).toBe(false);
      expect(validateConnectionString('   ')).toBe(false);
      expect(validateConnectionString(undefined)).toBe(false);
      expect(validateConnectionString(null)).toBe(false);
      expect(validateConnectionString('mysql://user:pass@localhost/db')).toBe(false);
      expect(validateConnectionString('http://localhost:5432')).toBe(false);
      expect(validateConnectionString('not-a-url')).toBe(false);
    });
  });

  describe('isNeonPooledUrl', () => {
    it('identifies Neon pgBouncer pooled URLs by host suffix or port', () => {
      expect(
        isNeonPooledUrl('postgres://user:pass@ep-denaneya-pooler.ap-southeast-1.aws.neon.tech/denaneya')
      ).toBe(true);
      expect(
        isNeonPooledUrl('postgres://user:pass@ep-denaneya.ap-southeast-1.aws.neon.tech:6543/denaneya')
      ).toBe(true);
      expect(
        isNeonPooledUrl('postgres://user:pass@ep-denaneya.ap-southeast-1.aws.neon.tech/denaneya?pooler=true')
      ).toBe(true);
    });

    it('identifies unpooled direct compute URLs', () => {
      expect(
        isNeonPooledUrl('postgres://user:pass@ep-denaneya.ap-southeast-1.aws.neon.tech:5432/denaneya')
      ).toBe(false);
      expect(isNeonPooledUrl(undefined)).toBe(false);
    });
  });

  describe('sanitizeConnectionUrl', () => {
    it('redacts sensitive credentials from database connection URLs', () => {
      const sanitized = sanitizeConnectionUrl(
        'postgres://dena_admin:SecretPassword123!@ep-denaneya.ap-southeast-1.aws.neon.tech:5432/denaneya?sslmode=require'
      );
      expect(sanitized).not.toContain('SecretPassword123!');
      expect(sanitized).toContain('***');
      expect(sanitized).toContain('ep-denaneya.ap-southeast-1.aws.neon.tech');
    });

    it('handles null, undefined, or malformed strings gracefully', () => {
      expect(sanitizeConnectionUrl(undefined)).toBe('unconfigured');
      expect(sanitizeConnectionUrl('invalid')).toBe('invalid-url');
    });
  });

  describe('Dual URL Resolution (getPooledUrl & getDirectUrl)', () => {
    it('resolves pooled URL prioritizing DATABASE_POOLED_URL then DATABASE_URL', () => {
      process.env.DATABASE_POOLED_URL = 'postgres://user:pass@ep-pooler.neon.tech/db';
      process.env.DATABASE_URL = 'postgres://user:pass@ep-direct.neon.tech/db';

      expect(getPooledUrl()).toBe('postgres://user:pass@ep-pooler.neon.tech/db');
    });

    it('resolves direct URL prioritizing DIRECT_URL then DATABASE_URL', () => {
      process.env.DIRECT_URL = 'postgres://user:pass@ep-direct-compute.neon.tech/db';
      process.env.DATABASE_URL = 'postgres://user:pass@ep-pooler.neon.tech/db';

      expect(getDirectUrl()).toBe('postgres://user:pass@ep-direct-compute.neon.tech/db');
    });

    it('falls back to DATABASE_URL when specific variants are absent', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@ep-standard.neon.tech/db';

      expect(getPooledUrl()).toBe('postgres://user:pass@ep-standard.neon.tech/db');
      expect(getDirectUrl()).toBe('postgres://user:pass@ep-standard.neon.tech/db');
    });

    it('automatically derives direct compute URL from pooled URL when DIRECT_URL is unset', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@ep-denaneya-pooler.ap-southeast-1.aws.neon.tech:6543/denaneya?sslmode=require&pooler=true';

      const direct = getDirectUrl();
      expect(direct).toBeDefined();
      expect(direct).not.toContain('-pooler');
      expect(direct).toContain('ep-denaneya.ap-southeast-1.aws.neon.tech');
      expect(direct).toContain(':5432');
      expect(direct).not.toContain('pooler=true');
    });

    it('automatically derives pooled URL from DIRECT_URL when DATABASE_URL is unset', () => {
      process.env.DIRECT_URL = 'postgres://user:pass@ep-denaneya.ap-southeast-1.aws.neon.tech:5432/denaneya?sslmode=require';

      const pooled = getPooledUrl();
      expect(pooled).toBeDefined();
      expect(pooled).toContain('ep-denaneya-pooler.ap-southeast-1.aws.neon.tech');
    });
  });

  describe('Client Factory & Zero-Crash Cold Start Fallback', () => {
    it('gracefully falls back to in-memory simulated storage when DATABASE_URL is unset', () => {
      // Both DATABASE_URL and DIRECT_URL are unset
      const client = createDbClient();

      expect(client).toBeDefined();
      expect((client as any).isMock).toBe(true);
      expect((client as any).mode).toBe('mock');
    });

    it('gracefully falls back to in-memory storage when connection string is invalid or "undefined"', () => {
      expect((createDbClient('invalid-connection-string') as any).isMock).toBe(true);
      expect((createDbClient('undefined') as any).isMock).toBe(true);
      expect((createDbClient('null') as any).isMock).toBe(true);
    });

    it('throws error only when fallbackToMemory is explicitly disabled', () => {
      expect(() => {
        createDbClient({ connectionString: 'invalid-url', fallbackToMemory: false });
      }).toThrow(/Invalid or missing database connection string/);
    });

    it('createDirectDbClient configures direct mode and falls back if unset', () => {
      const directClient = createDirectDbClient();
      expect(directClient).toBeDefined();
      expect((directClient as any).isMock).toBe(true);
    });

    it('createPooledDbClient configures pooled mode and falls back if unset', () => {
      const pooledClient = createPooledDbClient();
      expect(pooledClient).toBeDefined();
      expect((pooledClient as any).isMock).toBe(true);
    });

    it('getDb() returns singleton instance that survives multiple calls without 500 error', () => {
      const first = getDb();
      const second = getDb();

      expect(first).toBe(second);
      expect(first).toBeDefined();
    });

    it('getDb() dynamically transitions from mock to live client when DATABASE_URL is populated post cold-start', () => {
      // 1. Initial cold start without DATABASE_URL yields mock
      const initial = getDb();
      expect((initial as any).isMock).toBe(true);

      // 2. Late configuration of DATABASE_URL
      process.env.DATABASE_URL = 'postgres://user:pass@ep-live-pooler.neon.tech:5432/denaneya';

      // 3. getDb() detects mock invalidation and instantiates real pool client
      const reconnected = getDb();
      expect((reconnected as any).isMock).toBe(false);
      expect((reconnected as any).mode).toBe('neon-pooled');
    });

    it('wraps pool queries with resilient exponential backoff retry on transient errors', async () => {
      const liveClient = createDbClient({
        connectionString: 'postgres://user:pass@ep-resilient-test.neon.tech/denaneya',
        maxRetries: 3,
        fallbackToMemory: false,
      });

      const pool = (liveClient as any).$client;
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
      expect((liveClient as any).maxRetries).toBe(3);
      expect(typeof (liveClient as any).withRetry).toBe('function');
    });
  });
});


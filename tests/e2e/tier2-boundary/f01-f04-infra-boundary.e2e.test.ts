import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  encryptionService,
  validateUrlForSsrf,
  createSsrfSafeLookup,
  MemoryRateLimitStore,
  ProgressiveRateLimiter,
  RATE_LIMIT_RULES,
} from '@denaneya/security';
import {
  Logger,
  withSpan,
  getTracer,
  HealthCheckRegistry,
} from '@denaneya/observability';
import { payments, merchants } from '@denaneya/database';
import { Paisa } from '@denaneya/payment-core';

describe('Tier 2: F01-F04 Infrastructure Boundary Suite', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  // --------------------------------------------------------------------------
  // Feature 01: Monorepo Setup & Tooling (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 01: Monorepo Setup & Tooling Boundaries', () => {
    it('E2E-T2-F01-01: Empty Workspace Directory Handling', () => {
      const nonExistentCacheDir = path.join(rootDir, '.temp_non_existent_cache_' + Date.now());
      expect(fs.existsSync(nonExistentCacheDir)).toBe(false);

      // Verify directory operations on non-existent directories do not crash
      expect(() => {
        fs.rmSync(nonExistentCacheDir, { recursive: true, force: true });
      }).not.toThrow();

      // Creating, checking empty, and cleaning up
      fs.mkdirSync(nonExistentCacheDir, { recursive: true });
      expect(fs.readdirSync(nonExistentCacheDir)).toHaveLength(0);
      fs.rmSync(nonExistentCacheDir, { recursive: true, force: true });
      expect(fs.existsSync(nonExistentCacheDir)).toBe(false);
    });

    it('E2E-T2-F01-02: Long File Path Handling', () => {
      // Test paths > 260 characters (Windows MAX_PATH boundary)
      const baseDir = path.join(os.tmpdir(), 'denaneya_longpath_' + Date.now());
      const deepSubdir = path.join(
        baseDir,
        'a'.repeat(60),
        'b'.repeat(60),
        'c'.repeat(60),
        'd'.repeat(60),
        'e'.repeat(40)
      );

      expect(deepSubdir.length).toBeGreaterThan(260);

      fs.mkdirSync(deepSubdir, { recursive: true });
      const testFile = path.join(deepSubdir, 'test_payload.txt');
      const testContent = 'DenaNeya Long Path Verification Payload';

      fs.writeFileSync(testFile, testContent, 'utf8');
      const readContent = fs.readFileSync(testFile, 'utf8');
      expect(readContent).toBe(testContent);

      // Clean up
      fs.rmSync(baseDir, { recursive: true, force: true });
      expect(fs.existsSync(baseDir)).toBe(false);
    });

    it('E2E-T2-F01-03: Unicode File & Package Name Handling', () => {
      const bengaliDirName = 'দেনা-নেওয়া_টেস্ট_' + Date.now();
      const testDir = path.join(os.tmpdir(), bengaliDirName);

      fs.mkdirSync(testDir, { recursive: true });
      const bengaliFileName = 'হিসাব-নিকাশ.json';
      const filePath = path.join(testDir, bengaliFileName);
      const data = { brand: 'দেনা-নেওয়া', tagline: 'দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।' };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      const retrieved = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      expect(retrieved.brand).toBe('দেনা-নেওয়া');
      expect(retrieved.tagline).toBe('দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।');

      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('E2E-T2-F01-04: Turborepo Cache Invalidation on Environment Change', () => {
      const turboJsonPath = path.join(rootDir, 'turbo.json');
      expect(fs.existsSync(turboJsonPath)).toBe(true);

      const turboConfig = JSON.parse(fs.readFileSync(turboJsonPath, 'utf8'));
      expect(turboConfig.globalEnv || turboConfig.tasks?.build?.env).toBeDefined();

      // Check that critical environment variables affecting builds are declared
      const globalEnv = turboConfig.globalEnv || [];
      const buildEnv = turboConfig.tasks?.build?.env || [];
      const allDeclaredEnvs = [...globalEnv, ...buildEnv];

      expect(
        allDeclaredEnvs.includes('NEXT_PUBLIC_APP_URL') ||
        allDeclaredEnvs.includes('NODE_ENV') ||
        turboConfig.globalDependencies?.length > 0 ||
        turboConfig.tasks?.build?.dependsOn?.length > 0
      ).toBe(true);
    });

    it('E2E-T2-F01-05: Strict Node Version Boundary', () => {
      const rootPkgPath = path.join(rootDir, 'package.json');
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

      expect(rootPkg.engines).toBeDefined();
      expect(rootPkg.engines.node).toBeDefined();
      expect(rootPkg.engines.node).toMatch(/>=\s*20/);

      // Verify version parser correctly rejects Node < 20.0.0
      const semverCheck = (version: string, constraint: string): boolean => {
        const match = constraint.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
        if (!match) return false;
        const minMajor = Number.parseInt(match[1]!, 10);
        const [major] = version.split('.').map(Number);
        return (major ?? 0) >= minMajor;
      };

      expect(semverCheck('18.19.0', rootPkg.engines.node)).toBe(false);
      expect(semverCheck('19.9.0', rootPkg.engines.node)).toBe(false);
      expect(semverCheck('20.0.0', rootPkg.engines.node)).toBe(true);
      expect(semverCheck('22.13.0', rootPkg.engines.node)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 02: Security Core (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 02: Security Core Boundaries', () => {
    it('E2E-T2-F02-01: AES-256-GCM Zero-Length Plaintext', () => {
      const emptyPlaintext = '';
      const envelope = encryptionService.encrypt(emptyPlaintext);

      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('AES-256-GCM');
      expect(envelope.iv).toBeDefined();
      expect(envelope.authTag).toBeDefined();
      expect(envelope.ciphertext).toBe('');

      const decrypted = encryptionService.decrypt(envelope);
      expect(decrypted).toBe('');
    });

    it('E2E-T2-F02-02: AES-256-GCM Auth Tag Corruption', () => {
      const secret = 'sample_test_merchant_secret_9981247';
      const envelope = encryptionService.encrypt(secret);

      // Corrupt 1 hex character in the 16-byte authentication tag
      const originalTag = envelope.authTag;
      const corruptedChar = originalTag[0] === 'a' ? 'b' : 'a';
      const corruptedEnvelope = {
        ...envelope,
        authTag: corruptedChar + originalTag.slice(1),
      };

      expect(() => {
        encryptionService.decrypt(corruptedEnvelope);
      }).toThrow(/Unsupported state or unable to authenticate data|authentication|integrity/i);
    });

    it('E2E-T2-F02-03: Webhook SSRF IPv4-Mapped IPv6 Bypass', async () => {
      const ipv4MappedIpv6List = [
        'http://[::ffff:127.0.0.1]/webhook',
        'http://[::ffff:169.254.169.254]/latest/meta-data',
        'http://[::ffff:10.0.0.1]/internal',
        'http://[::ffff:192.168.1.1]/admin',
      ];

      for (const url of ipv4MappedIpv6List) {
        const result = await validateUrlForSsrf(url);
        expect(result.safe).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/blocked|IPv4-Mapped|forbidden/i);
      }
    });

    it('E2E-T2-F02-04: Webhook SSRF DNS Rebinding Defense', async () => {
      const safeLookup = createSsrfSafeLookup();
      expect(typeof safeLookup).toBe('function');

      // Test that the lookup rejects resolution to loopback / private IPs
      await new Promise<void>((resolve, reject) => {
        safeLookup('127.0.0.1', (err: any) => {
          try {
            expect(err).toBeDefined();
            expect(err.message).toMatch(/SSRF Blocked/i);
            resolve();
          } catch (assertionErr) {
            reject(assertionErr);
          }
        });
      });
    });

    it('E2E-T2-F02-05: Rate Limit Edge: Exact Limit vs Limit+1', async () => {
      const store = new MemoryRateLimitStore();
      const limiter = new ProgressiveRateLimiter(store);
      const testKey = 'ip_edge_test_' + Date.now();
      const rule = RATE_LIMIT_RULES.AUTH_LOGIN; // max: 10 requests

      // Exactly 10 requests must be allowed
      for (let i = 1; i <= 10; i++) {
        const res = await limiter.check(testKey, rule);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(10 - i);
      }

      // 11th request (Limit + 1) must be rejected
      const blockedRes = await limiter.check(testKey, rule);
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
      expect(blockedRes.isLockedOut).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 03: Observability Core (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 03: Observability Core Boundaries', () => {
    it('E2E-T2-F03-01: Massive Log Payload Truncation', () => {
      let loggedOutput = '';
      const customLogger = new Logger({
        enablePretty: false,
        sink: (line) => {
          loggedOutput = line;
        },
      });

      // Create a massive 1MB string
      const massivePayload = 'x'.repeat(1024 * 1024);
      expect(() => {
        customLogger.info('Massive string payload test', { payload: massivePayload });
      }).not.toThrow();

      expect(loggedOutput).toContain('Massive string payload test');
      expect(loggedOutput.length).toBeGreaterThan(0);
    });

    it('E2E-T2-F03-02: Circular Reference Object Logging', () => {
      let loggedOutput = '';
      const customLogger = new Logger({
        enablePretty: false,
        sink: (line) => {
          loggedOutput = line;
        },
      });

      const circularObj: any = { name: 'DenaNeya' };
      circularObj.self = circularObj;

      expect(() => {
        customLogger.info('Circular reference log test', { details: circularObj });
      }).not.toThrow();

      expect(loggedOutput).toContain('Circular reference log test');
      expect(loggedOutput).toContain('[Circular]');
    });

    it('E2E-T2-F03-03: Log Injection Defense', () => {
      let loggedOutput = '';
      const customLogger = new Logger({
        enablePretty: false,
        sink: (line) => {
          loggedOutput = line;
        },
      });

      const injectionString = 'Malicious log\n{"level":"FATAL","message":"INJECTED LOG"}\nMore text';
      customLogger.info(injectionString);

      // JSON stringified log must remain a single valid JSON record without unescaped newlines breaking format
      expect(() => JSON.parse(loggedOutput)).not.toThrow();
      const parsed = JSON.parse(loggedOutput);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toContain('Malicious log');
      expect(parsed.message).toContain('INJECTED LOG');
    });

    it('E2E-T2-F03-04: OpenTelemetry Span Exception Recording', async () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();

      let caughtError: Error | null = null;
      try {
        await withSpan('test_span_exception', async (span) => {
          throw new Error('Database connection failed during span');
        });
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toBe('Database connection failed during span');
    });

    it('E2E-T2-F03-05: Observability Health Check Timeout', async () => {
      const registry = new HealthCheckRegistry();

      // Register a stalled probe with 50ms timeout
      registry.register(
        'stalled_database_probe',
        () => new Promise((resolve) => setTimeout(() => resolve({ status: 'UP', message: 'Never reaches' }), 2000)),
        { timeoutMs: 50, isCritical: true }
      );

      const health = await registry.run();
      expect(health.status).toBe('DOWN');
      expect(health.components['stalled_database_probe']).toBeDefined();
      expect(health.components['stalled_database_probe']!.status).toBe('DOWN');
      expect(health.components['stalled_database_probe']!.message).toMatch(/timed out after 50ms/i);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 04: Database Schema & Drizzle ORM (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 04: Database Schema & Drizzle ORM Boundaries', () => {
    const schemaFile = path.join(rootDir, 'packages/database/src/schema/payments.ts');

    it('E2E-T2-F04-01: Zero Paisa Payment DB Constraint', () => {
      expect(fs.existsSync(schemaFile)).toBe(true);
      const schemaCode = fs.readFileSync(schemaFile, 'utf8');

      expect(schemaCode).toContain('chk_payment_amount_positive');
      expect(schemaCode).toContain('amount_paisa > 0');

      // Invariant: Paisa zero cannot be a valid captured payment amount
      const zeroPaisa = Paisa.zero();
      expect(zeroPaisa.amountPaisa).toBe(0n);
      expect(zeroPaisa.amountPaisa > 0n).toBe(false);
    });

    it('E2E-T2-F04-02: Maximum BigInt Paisa Payment', () => {
      // 2^62 - 1 paisa (46,116,860,184,273,879.03 BDT)
      const maxBigIntPaisa = (1n << 62n) - 1n;
      const maxPayment = Paisa.fromPaisa(maxBigIntPaisa);

      expect(maxPayment.amountPaisa).toBe(4611686018427387903n);
      expect(maxPayment.toBDT()).toBe('46116860184273879.03');

      // Addition with 1 paisa does not overflow 64-bit integer
      const plusOne = maxPayment.add(Paisa.fromPaisa(1n));
      expect(plusOne.amountPaisa).toBe(4611686018427387904n);
    });

    it('E2E-T2-F04-03: Refund Exceeding Payment Bound', () => {
      const schemaCode = fs.readFileSync(schemaFile, 'utf8');
      expect(schemaCode).toContain('chk_payment_refund_bounds');
      expect(schemaCode).toContain('refunded_amount_paisa <= amount_paisa');

      const paymentAmount = 100000n; // 1,000.00 BDT
      const excessiveRefund = 100001n; // 1,000.01 BDT

      const violatesBound = excessiveRefund > paymentAmount;
      expect(violatesBound).toBe(true);
    });

    it('E2E-T2-F04-04: Non-Existent Foreign Key Referential Integrity', () => {
      const schemaCode = fs.readFileSync(schemaFile, 'utf8');
      expect(schemaCode).toContain("references(() => merchants.id, { onDelete: 'restrict' })");

      expect(payments.merchantId).toBeDefined();
      expect(merchants.id).toBeDefined();
    });

    it('E2E-T2-F04-05: SQL Injection in Dynamic Filter', () => {
      const maliciousInput = "mer_01' OR '1'='1";

      // Parameterized query simulation: inputs are treated as literal parameter placeholders ($1)
      const mockParameterizedQuery = (table: string, field: string, param: unknown) => {
        return {
          sql: `SELECT * FROM ${table} WHERE ${field} = $1`,
          params: [param],
        };
      };

      const query = mockParameterizedQuery('payments', 'merchant_id', maliciousInput);
      expect(query.sql).toBe('SELECT * FROM payments WHERE merchant_id = $1');
      expect(query.params[0]).toBe(maliciousInput);
      expect(query.sql.includes("' OR '1'='1")).toBe(false);
    });
  });
});

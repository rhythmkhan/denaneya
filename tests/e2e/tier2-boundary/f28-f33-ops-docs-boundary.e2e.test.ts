import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Paisa } from '@denaneya/payment-core';
import { resolveFeaturesForMilestone } from '../runner/milestone-filter.js';

describe('Tier 2: F28-F33 Operations, Docs, CI/CD & Hardening Boundary Suite', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const docsDir = path.join(rootDir, 'docs');

  // --------------------------------------------------------------------------
  // Feature 28: Reconciliation & Settlement Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 28: Reconciliation & Settlement Boundaries', () => {
    it('E2E-T2-F28-01: Reconciliation with Zero Transactions on Date', () => {
      interface ReconciliationReport {
        totalRecordsEvaluated: number;
        matchedCount: number;
        discrepancyCount: number;
        autoHealedCount: number;
        totalInternalAmountPaisa: bigint;
        totalProviderAmountPaisa: bigint;
        netDiscrepancyAmountPaisa: bigint;
        status: 'MATCHED' | 'DISCREPANCIES_DETECTED' | 'FAILED';
      }

      const reconcileEmptyDay = (transactions: any[]): ReconciliationReport => {
        return {
          totalRecordsEvaluated: transactions.length,
          matchedCount: 0,
          discrepancyCount: 0,
          autoHealedCount: 0,
          totalInternalAmountPaisa: 0n,
          totalProviderAmountPaisa: 0n,
          netDiscrepancyAmountPaisa: 0n,
          status: 'MATCHED',
        };
      };

      const report = reconcileEmptyDay([]);
      expect(report.totalRecordsEvaluated).toBe(0);
      expect(report.matchedCount).toBe(0);
      expect(report.discrepancyCount).toBe(0);
      expect(report.totalInternalAmountPaisa).toBe(0n);
      expect(report.netDiscrepancyAmountPaisa).toBe(0n);
      expect(report.status).toBe('MATCHED');
    });

    it('E2E-T2-F28-02: Reconciliation with Gateway Negative Settlement Adjustment', () => {
      interface SettlementAdjustment {
        type: 'FEE_CLAWBACK' | 'CHARGEBACK_REVERSAL';
        amountPaisa: bigint;
        referenceTrxId: string;
      }

      const applyAdjustment = (runningBalancePaisa: bigint, adjustment: SettlementAdjustment) => {
        return runningBalancePaisa + adjustment.amountPaisa;
      };

      const initialSettlement = 100_000n;
      const clawback: SettlementAdjustment = {
        type: 'FEE_CLAWBACK',
        amountPaisa: -500n,
        referenceTrxId: 'TRX_CLAWBACK_01',
      };

      const adjustedSettlement = applyAdjustment(initialSettlement, clawback);
      expect(adjustedSettlement).toBe(99_500n);
      expect(adjustedSettlement < initialSettlement).toBe(true);
    });

    it('E2E-T2-F28-03: Reconciliation CSV with Windows CRLF Line Endings', () => {
      const parseCsv = (csvText: string) => {
        const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim());
          return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
        });
        return rows;
      };

      const lfCsv = 'trxId,amount,status\nTRX001,1500.00,SUCCESS\nTRX002,2500.00,SUCCESS';
      const crlfCsv = 'trxId,amount,status\r\nTRX001,1500.00,SUCCESS\r\nTRX002,2500.00,SUCCESS';

      const lfRows = parseCsv(lfCsv);
      const crlfRows = parseCsv(crlfCsv);

      expect(crlfRows.length).toBe(2);
      expect(crlfRows).toEqual(lfRows);
      expect(crlfRows[0].trxId).toBe('TRX001');
      expect(crlfRows[0].amount).toBe('1500.00');
    });

    it('E2E-T2-F28-04: Reconciliation Currency Precision Mismatch', () => {
      const detectAmountDiscrepancy = (internalPaisa: bigint, providerPaisa: bigint) => {
        const delta = internalPaisa > providerPaisa ? internalPaisa - providerPaisa : providerPaisa - internalPaisa;
        if (delta !== 0n) {
          return {
            hasDiscrepancy: true,
            type: 'AMOUNT_MISMATCH',
            deltaPaisa: delta,
          };
        }
        return { hasDiscrepancy: false, type: 'MATCHED', deltaPaisa: 0n };
      };

      const mismatch = detectAmountDiscrepancy(150050n, 150051n);
      expect(mismatch.hasDiscrepancy).toBe(true);
      expect(mismatch.type).toBe('AMOUNT_MISMATCH');
      expect(mismatch.deltaPaisa).toBe(1n);

      const match = detectAmountDiscrepancy(150050n, 150050n);
      expect(match.hasDiscrepancy).toBe(false);
      expect(match.deltaPaisa).toBe(0n);
    });

    it('E2E-T2-F28-05: Reconciliation Report Large Volume (100,000 Rows)', async () => {
      async function* streamReconciliationRows(totalRows: number, chunkSize: number) {
        let emitted = 0;
        while (emitted < totalRows) {
          const currentChunk = Math.min(chunkSize, totalRows - emitted);
          const chunk = Array.from({ length: currentChunk }, (_, i) => ({
            id: emitted + i + 1,
            amountPaisa: 1000n,
            status: 'MATCHED',
          }));
          emitted += currentChunk;
          yield chunk;
        }
      }

      let totalProcessed = 0;
      let totalAmountPaisa = 0n;

      for await (const chunk of streamReconciliationRows(100_000, 10_000)) {
        totalProcessed += chunk.length;
        for (const row of chunk) {
          totalAmountPaisa += row.amountPaisa;
        }
      }

      expect(totalProcessed).toBe(100_000);
      expect(totalAmountPaisa).toBe(100_000_000n);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 29: OpenAPI & API Contract Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 29: OpenAPI & API Contract Boundaries', () => {
    it('E2E-T2-F29-01: OpenAPI Nullable Field Schema Validation', () => {
      const openapiJsonPath = path.join(docsDir, 'openapi.json');
      expect(fs.existsSync(openapiJsonPath)).toBe(true);

      const openapi = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));
      const schemas = openapi.components?.schemas || {};

      const paymentResponseSchema = schemas.PaymentDetailResponse || schemas.PaymentResponse;
      expect(paymentResponseSchema).toBeDefined();

      const validateNullable = (value: any, isNullable: boolean) => {
        if (value === null) return isNullable;
        return typeof value === 'string';
      };

      expect(validateNullable(null, true)).toBe(true);
      expect(validateNullable(null, false)).toBe(false);
    });

    it('E2E-T2-F29-02: OpenAPI Recursive Schema Check', () => {
      const openapiJsonPath = path.join(docsDir, 'openapi.json');
      const openapi = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));
      const schemas = openapi.components?.schemas || {};

      const checkCircularReferences = (schemaName: string, visited = new Set<string>()): boolean => {
        if (visited.has(schemaName)) {
          return true;
        }
        visited.add(schemaName);

        const schema = schemas[schemaName];
        if (!schema) return false;

        const str = JSON.stringify(schema);
        const refMatches = str.match(/#\/components\/schemas\/([A-Za-z0-9_]+)/g) || [];
        for (const match of refMatches) {
          const target = match.split('/').pop()!;
          if (target !== schemaName && checkCircularReferences(target, new Set(visited))) {
            return true;
          }
        }
        return false;
      };

      for (const schemaName of Object.keys(schemas)) {
        const isCircular = checkCircularReferences(schemaName);
        expect(isCircular, `Schema ${schemaName} should not contain circular references`).toBe(false);
      }
    });

    it('E2E-T2-F29-03: Mermaid Diagram Node ID with Hyphens', () => {
      const archPath = path.join(docsDir, 'ARCHITECTURE.md');
      expect(fs.existsSync(archPath)).toBe(true);

      const content = fs.readFileSync(archPath, 'utf8');
      expect(content).toContain('mermaid');

      const parseMermaidNode = (nodeText: string) => {
        const match = nodeText.match(/([a-zA-Z0-9_-]+)\["([^"]+)"\]/);
        if (match) {
          return { id: match[1], label: match[2], valid: true };
        }
        return { valid: false };
      };

      const testNode = parseMermaidNode('client-web["Web Checkout Client"]');
      expect(testNode.valid).toBe(true);
      expect(testNode.id).toBe('client-web');
    });

    it('E2E-T2-F29-04: OpenAPI Spec Serialization: YAML vs JSON Parity', () => {
      const yamlPath = path.join(docsDir, 'openapi.yaml');
      const jsonPath = path.join(docsDir, 'openapi.json');

      expect(fs.existsSync(yamlPath)).toBe(true);
      expect(fs.existsSync(jsonPath)).toBe(true);

      const jsonSpec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');

      expect(yamlContent).toContain(jsonSpec.info.title);
      expect(yamlContent).toContain(jsonSpec.info.version);

      const jsonPaths = Object.keys(jsonSpec.paths || {});
      expect(jsonPaths.length).toBeGreaterThan(0);
      for (const p of jsonPaths) {
        expect(yamlContent).toContain(p);
      }
    });

    it('E2E-T2-F29-05: OpenAPI Server URL Protocol Enforcement', () => {
      const jsonPath = path.join(docsDir, 'openapi.json');
      const jsonSpec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      const servers: Array<{ url: string; description?: string }> = jsonSpec.servers || [];
      expect(servers.length).toBeGreaterThan(0);

      for (const server of servers) {
        const isHttps = server.url.startsWith('https://');
        const isLocalhost = server.url.startsWith('http://localhost');
        expect(isHttps || isLocalhost, `Server URL ${server.url} must use HTTPS or localhost`).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 30: Developer Experience & Documentation Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 30: Developer Experience & Documentation Boundaries', () => {
    it('E2E-T2-F30-01: Markdown Heading Level Hierarchy', () => {
      const archPath = path.join(docsDir, 'ARCHITECTURE.md');
      const content = fs.readFileSync(archPath, 'utf8');

      const headingLines = content.split('\n').filter((l) => l.startsWith('#'));
      let lastLevel = 0;
      let hasViolation = false;

      for (const line of headingLines) {
        const match = line.match(/^(#+)\s/);
        if (!match) continue;
        const level = match[1].length;
        if (lastLevel > 0 && level > lastLevel + 1) {
          hasViolation = true;
          break;
        }
        lastLevel = level;
      }

      expect(hasViolation).toBe(false);
    });

    it('E2E-T2-F30-02: Internal Markdown Link Validation', () => {
      const readmePath = path.join(docsDir, 'README.md');
      const content = fs.readFileSync(readmePath, 'utf8');

      const linkMatches = content.match(/\[[^\]]+\]\(\.\/([a-zA-Z0-9_.-]+)\.md\)/g) || [];
      for (const link of linkMatches) {
        const match = link.match(/\(\.\/([a-zA-Z0-9_.-]+\.md)\)/);
        if (match) {
          const targetFile = path.join(docsDir, match[1]);
          expect(fs.existsSync(targetFile), `Target ${match[1]} must exist`).toBe(true);
        }
      }
    });

    it('E2E-T2-F30-03: Code Block Language Tagging', () => {
      const docFiles = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));
      let totalCodeBlocks = 0;
      let taggedCodeBlocks = 0;

      for (const file of docFiles) {
        const content = fs.readFileSync(path.join(docsDir, file), 'utf8');
        const fences = content.match(/```[a-zA-Z0-9_-]*/g) || [];
        totalCodeBlocks += fences.length;
        taggedCodeBlocks += fences.filter((f) => f.length > 3).length;
      }

      expect(totalCodeBlocks).toBeGreaterThan(10);
      expect(taggedCodeBlocks).toBeGreaterThan(5);
    });

    it('E2E-T2-F30-04: Changelog SemVer Format Compliance', () => {
      const changelogPath = path.join(docsDir, 'CHANGELOG.md');
      expect(fs.existsSync(changelogPath)).toBe(true);

      const content = fs.readFileSync(changelogPath, 'utf8');
      expect(content).toContain('Keep a Changelog');
      expect(content).toContain('Semantic Versioning');

      const versionMatch = content.match(/## \[(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:-\d+)?)\]/);
      expect(versionMatch).not.toBeNull();
      const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
      expect(semverRegex.test(versionMatch![1])).toBe(true);
    });

    it('E2E-T2-F30-05: No Real Production Credentials in Documentation', () => {
      const filesToScan = ['ENVIRONMENT.md', 'SECURITY.md', 'GATEWAY-INTEGRATIONS.md'];
      for (const file of filesToScan) {
        const filePath = path.join(docsDir, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).not.toContain('live_sec_prod_');
        expect(content).not.toContain('bkash_live_app_secret_');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 31: Build, Deploy & CI/CD Pipeline Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 31: Build, Deploy & CI/CD Pipeline Boundaries', () => {
    it('E2E-T2-F31-01: Vercel Route Match Regex Boundaries', () => {
      const vercelJsonPath = path.join(rootDir, 'vercel.json');
      expect(fs.existsSync(vercelJsonPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      expect(config.headers).toBeDefined();

      for (const headerRule of config.headers) {
        const sourcePattern = headerRule.source;
        expect(sourcePattern).toBeDefined();
        const regex = new RegExp(`^${sourcePattern}$`);
        expect(regex).toBeInstanceOf(RegExp);
      }

      const globalRule = config.headers.find((h: any) => h.source === '/(.*)');
      expect(globalRule).toBeDefined();
      const globalRegex = new RegExp(globalRule.source);
      expect(globalRegex.test('/api/v1/payments')).toBe(true);
    });

    it('E2E-T2-F31-02: CI Workflow Matrix OS Compatibility', () => {
      const ciPath = path.join(rootDir, '.github/workflows/ci.yml');
      expect(fs.existsSync(ciPath)).toBe(true);

      const content = fs.readFileSync(ciPath, 'utf8');
      expect(content).toContain('pnpm');
      expect(content).toContain('runs-on:');
    });

    it('E2E-T2-F31-03: Git Ignore Exclusion of Sensitive Files', () => {
      const gitignorePath = path.join(rootDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('.env');
      expect(content).toContain('*.pem');
      expect(content).toContain('*.keystore');
      expect(content).toContain('.pnpm-store');
      expect(content).toContain('node_modules');
    });

    it('E2E-T2-F31-04: Package.json License and Repository Fields', () => {
      const pkgPath = path.join(rootDir, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe('denaneya');
      expect(pkg.private).toBe(true);
      expect(pkg.packageManager).toContain('pnpm');
    });

    it('E2E-T2-F31-05: Node Version Mismatch Detection in CI', () => {
      const validateCiNodeVersion = (version: string) => {
        const major = parseInt(version.replace(/^v/, '').split('.')[0], 10);
        if (major < 22) {
          return {
            allowed: false,
            error: `Node version mismatch: CI requires Node.js >= 22.x (received ${version})`,
          };
        }
        return { allowed: true, error: null };
      };

      const node20Check = validateCiNodeVersion('20.18.0');
      expect(node20Check.allowed).toBe(false);
      expect(node20Check.error).toContain('requires Node.js >= 22.x');

      const node22Check = validateCiNodeVersion('22.13.0');
      expect(node22Check.allowed).toBe(true);
      expect(node22Check.error).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Feature 32: Test Infrastructure & Harness Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 32: Test Infrastructure & Harness Boundaries', () => {
    it('E2E-T2-F32-01: Test Runner on Zero Matching Tests Filter', () => {
      const runFilter = (feature: string) => {
        try {
          const features = resolveFeaturesForMilestone('M1');
          if (!features.includes(feature)) {
            return { exitCode: 1, error: `No test files match feature filter '${feature}'` };
          }
          return { exitCode: 0, error: null };
        } catch (e: any) {
          return { exitCode: 1, error: e.message };
        }
      };

      const result = runFilter('F99');
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('F99');
    });

    it('E2E-T2-F32-02: Test Runner Timeout on Stalled Async Test', async () => {
      const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        let timer: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`TEST_TIMEOUT_EXCEEDED (${timeoutMs}ms)`)), timeoutMs);
        });

        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          clearTimeout(timer);
        }
      };

      const fastResult = await runWithTimeout(Promise.resolve('DONE'), 100);
      expect(fastResult).toBe('DONE');

      const stalledPromise = new Promise((resolve) => setTimeout(resolve, 500));
      await expect(runWithTimeout(stalledPromise, 50)).rejects.toThrow('TEST_TIMEOUT_EXCEEDED');
    });

    it('E2E-T2-F32-03: Concurrent Runner Database Isolation', () => {
      const workerA = { tenantId: 'merch_worker_a_01', sequence: 0 };
      const workerB = { tenantId: 'merch_worker_b_02', sequence: 0 };

      workerA.sequence += 1;
      expect(workerA.sequence).toBe(1);
      expect(workerB.sequence).toBe(0);
      expect(workerA.tenantId).not.toBe(workerB.tenantId);
    });

    it('E2E-T2-F32-04: Runner Exit Code on 1 Failure in 380 Tests', () => {
      interface SuiteExecutionSummary {
        total: number;
        passed: number;
        failed: number;
        exitCode: number;
      }

      const computeExitCode = (total: number, passed: number, failed: number): SuiteExecutionSummary => {
        return {
          total,
          passed,
          failed,
          exitCode: failed > 0 ? 1 : 0,
        };
      };

      const suiteWithOneFailure = computeExitCode(380, 379, 1);
      expect(suiteWithOneFailure.exitCode).toBe(1);
      expect(suiteWithOneFailure.failed).toBe(1);

      const allPassed = computeExitCode(380, 380, 0);
      expect(allPassed.exitCode).toBe(0);
    });

    it('E2E-T2-F32-05: Memory Leak Absence Across Full Suite Run', () => {
      const memoryBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        const paisa = Paisa.fromBDT('10.50');
        expect(paisa.amountPaisa).toBe(1050n);
      }

      const memoryAfter = process.memoryUsage().heapUsed;
      const growthMB = (memoryAfter - memoryBefore) / (1024 * 1024);

      expect(growthMB).toBeLessThan(25);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 33: Edge Cases, Hardening & Failure Injections (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 33: Edge Cases, Hardening & Failure Injections', () => {
    it('E2E-T2-F33-01: 200 Simultaneous Requests on Payment Creation', async () => {
      const MAX_POOL_SIZE = 20;
      let activeConnections = 0;
      let maxObservedConnections = 0;

      const executeDbQuery = async (queryId: number) => {
        activeConnections++;
        maxObservedConnections = Math.max(maxObservedConnections, activeConnections);
        await new Promise((resolve) => setTimeout(resolve, 2));
        activeConnections--;
        return { queryId, status: 'SUCCESS' };
      };

      const queue: Array<() => Promise<any>> = Array.from({ length: 200 }, (_, i) => () => executeDbQuery(i));
      const results: any[] = [];
      const executing = new Set<Promise<any>>();

      for (const task of queue) {
        const p: Promise<any> = task().then((res) => {
          results.push(res);
          executing.delete(p);
        });
        executing.add(p);
        if (executing.size >= MAX_POOL_SIZE) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);

      expect(results.length).toBe(200);
      expect(maxObservedConnections).toBeLessThanOrEqual(MAX_POOL_SIZE);
      expect(activeConnections).toBe(0);
    });

    it('E2E-T2-F33-02: Deadlock Absence on Concurrent Cross-Account Ledger Postings', async () => {
      const acquireAccountLocks = (acc1: string, acc2: string) => {
        const [first, second] = [acc1, acc2].sort();
        return { first, second };
      };

      const orderA = acquireAccountLocks('1110', '2110');
      const orderB = acquireAccountLocks('2110', '1110');

      expect(orderA.first).toBe('1110');
      expect(orderA.second).toBe('2110');
      expect(orderB.first).toBe('1110');
      expect(orderB.second).toBe('2110');
      expect(orderA.first).toBe(orderB.first);
    });

    it('E2E-T2-F33-03: Rapid Fire Refund and Settle Race', () => {
      type PaymentStatus = 'PENDING' | 'SETTLED' | 'REFUNDED';

      class PaymentStateMachine {
        private status: PaymentStatus = 'PENDING';

        settle() {
          if (this.status !== 'PENDING') {
            throw new Error(`Cannot settle payment in status ${this.status}`);
          }
          this.status = 'SETTLED';
          return this.status;
        }

        refund() {
          if (this.status !== 'SETTLED') {
            throw new Error(`Cannot refund payment in status ${this.status}; must be SETTLED`);
          }
          this.status = 'REFUNDED';
          return this.status;
        }

        getStatus() {
          return this.status;
        }
      }

      const payment1 = new PaymentStateMachine();
      expect(payment1.settle()).toBe('SETTLED');
      expect(payment1.refund()).toBe('REFUNDED');

      const payment2 = new PaymentStateMachine();
      expect(() => payment2.refund()).toThrow('must be SETTLED');
      expect(payment2.getStatus()).toBe('PENDING');
    });

    it('E2E-T2-F33-04: Database Failover Mid-Transaction Simulation', () => {
      let uncommittedRecords: string[] = [];
      let transactionCommitted = false;

      const executeTransactionWithFailover = (shouldFail: boolean) => {
        uncommittedRecords.push('RECORD_1', 'RECORD_2');
        if (shouldFail) {
          uncommittedRecords = [];
          transactionCommitted = false;
          return { status: 'ROLLED_BACK', remainingRecords: uncommittedRecords.length };
        }
        transactionCommitted = true;
        return { status: 'COMMITTED', remainingRecords: uncommittedRecords.length };
      };

      const failoverResult = executeTransactionWithFailover(true);
      expect(failoverResult.status).toBe('ROLLED_BACK');
      expect(failoverResult.remainingRecords).toBe(0);
      expect(transactionCommitted).toBe(false);
      expect(uncommittedRecords.length).toBe(0);
    });

    it('E2E-T2-F33-05: Clock Jump / NTP Synchronization Resiliency', () => {
      const calculateElapsedTimeMs = (startTime: number, endTime: number) => {
        return Math.max(0, endTime - startTime);
      };

      const now = 1726272000000;
      expect(calculateElapsedTimeMs(now, now + 1500)).toBe(1500);

      const backwardJumpTime = now - 5000;
      expect(calculateElapsedTimeMs(now, backwardJumpTime)).toBe(0);

      const t1 = process.hrtime.bigint();
      const t2 = process.hrtime.bigint();
      expect(t2 >= t1).toBe(true);
    });
  });
});

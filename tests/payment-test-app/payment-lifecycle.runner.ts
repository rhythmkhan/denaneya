/**
 * DenaNeya Dedicated Payment Integration Test Application (Phase 24 Runner)
 *
 * Runs the full 24-scenario payment lifecycle validation suite:
 * - Sandbox initiation, pending, completion, fail, cancel, expire
 * - Multi-line invoice creation, lookup, and verification
 * - Idempotency replay resistance, duplicate handling
 * - Outbound webhooks and HMAC-SHA256 signatures
 * - SSRF guard and double-entry ledger balance
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function runPaymentIntegrationTestApp(): number {
  console.log('\n======================================================================');
  console.log('       DenaNeya Dedicated Payment Integration Test Application        ');
  console.log('                 (Fulfills Phases 24 & 25 Verification)               ');
  console.log('======================================================================\n');

  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'pnpm.cmd' : 'pnpm';
  const configPath = path.resolve(process.cwd(), 'tests/e2e/config/vitest.config.e2e.ts');
  const testFile = path.resolve(process.cwd(), 'tests/e2e/payment-app/payment-lifecycle.e2e.test.ts');

  const result = spawnSync(
    executable,
    ['vitest', 'run', '--config', configPath, testFile],
    {
      stdio: 'inherit',
      shell: isWindows,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    }
  );

  const exitCode = result.status ?? (result.error ? 1 : 0);
  console.log('\n======================================================================');
  console.log(`Payment Lifecycle Test Execution Exit Code: ${exitCode}`);
  console.log(`Lifecycle Verdict: ${exitCode === 0 ? '100% PASS' : 'FAIL'}`);
  console.log('======================================================================\n');
  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('payment-lifecycle.runner')) {
  const code = runPaymentIntegrationTestApp();
  process.exit(code);
}

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'DenaNeya-E2E',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    environment: 'node',
    globals: false,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-reports/e2e-results.xml',
    },
    sequence: {
      concurrent: false, // Ensures deterministic database assertions
    },
    setupFiles: [path.resolve(__dirname, './global-setup.ts')],
  },
  resolve: {
    alias: {
      '@denaneya/observability': path.resolve(__dirname, '../../../packages/observability/src/index.ts'),
      '@denaneya/security': path.resolve(__dirname, '../../../packages/security/src/index.ts'),
      '@denaneya/database': path.resolve(__dirname, '../../../packages/database/src/index.ts'),
      '@denaneya/payment-core': path.resolve(__dirname, '../../../packages/payment-core/src/index.ts'),
      '@denaneya/sms-parser': path.resolve(__dirname, '../../../packages/sms-parser/src/index.ts'),
      '@denaneya/fraud-engine': path.resolve(__dirname, '../../../packages/fraud-engine/src/index.ts'),
      '@denaneya/gateway-adapters': path.resolve(__dirname, '../../../packages/gateway-adapters/src/index.ts'),
      '@denaneya/ledger': path.resolve(__dirname, '../../../packages/ledger/src/index.ts'),
      '@denaneya/webhooks': path.resolve(__dirname, '../../../packages/webhooks/src/index.ts'),
      '@denaneya/reconciliation': path.resolve(__dirname, '../../../packages/reconciliation/src/index.ts'),
      '@': path.resolve(__dirname, '../../../apps/web/src'),
      '@/': path.resolve(__dirname, '../../../apps/web/src') + '/',
    },
  },
});

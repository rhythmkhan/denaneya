import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 16: Documentation Portal (E2E-T1-F16)', () => {
  const docsDir = path.resolve(process.cwd(), 'apps/web/src/app/(docs)/docs');

  // E2E-T1-F16-01: Docs Home Navigation & Quickstart Guide
  it('E2E-T1-F16-01: Docs Home Navigation & Quickstart Guide', () => {
    const docsHome = path.join(docsDir, 'page.tsx');
    const quickstart = path.join(docsDir, 'quickstart', 'page.tsx');

    expect(fs.existsSync(docsHome)).toBe(true);
    expect(fs.existsSync(quickstart)).toBe(true);

    const homeContent = fs.readFileSync(docsHome, 'utf8');
    expect(homeContent).toContain('Documentation');

    const quickContent = fs.readFileSync(quickstart, 'utf8');
    expect(quickContent).toContain('Quickstart');
  });

  // E2E-T1-F16-02: Interactive API Reference Page Rendering
  it('E2E-T1-F16-02: Interactive API Reference Page Rendering', () => {
    const paymentsApi = path.join(docsDir, 'payments-api', 'page.tsx');
    expect(fs.existsSync(paymentsApi)).toBe(true);

    const content = fs.readFileSync(paymentsApi, 'utf8');
    expect(content).toContain('/api/v1/payments');
    expect(content).toContain('POST');
    expect(content).toContain('Idempotency-Key');
  });

  // E2E-T1-F16-03: Webhook HMAC Verification Code Snippets
  it('E2E-T1-F16-03: Webhook HMAC Verification Code Snippets', () => {
    const webhooksDoc = path.join(docsDir, 'webhooks', 'page.tsx');
    expect(fs.existsSync(webhooksDoc)).toBe(true);

    const content = fs.readFileSync(webhooksDoc, 'utf8');
    expect(content).toContain('createHmac');
    expect(content).toContain('X-DenaNeya-Signature');
  });

  // E2E-T1-F16-04: Android Collector Integration Documentation
  it('E2E-T1-F16-04: Android Collector Integration Documentation', () => {
    const androidDoc = path.join(docsDir, 'mfs-sms-automation', 'page.tsx');
    expect(fs.existsSync(androidDoc)).toBe(true);

    const content = fs.readFileSync(androidDoc, 'utf8');
    expect(content).toContain('Android');
    expect(content).toContain('Keystore');
    expect(content).toContain('ECDSA');
  });

  // E2E-T1-F16-05: Comprehensive Error Codes Catalog
  it('E2E-T1-F16-05: Comprehensive Error Codes Catalog', () => {
    const errorCatalog = path.join(docsDir, 'error-catalog', 'page.tsx');
    expect(fs.existsSync(errorCatalog)).toBe(true);

    const content = fs.readFileSync(errorCatalog, 'utf8');
    expect(content).toContain('Error Code Catalog');
    expect(content).toContain('IDEMPOTENCY');
  });
});

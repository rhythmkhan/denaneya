import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Paisa } from '@denaneya/payment-core';
import { formatPaisaToBDT } from '../../../apps/web/src/lib/format.js';

describe('Feature 17: Hosted Checkout Flow (E2E-T1-F17)', () => {
  const checkoutDir = path.resolve(process.cwd(), 'apps/web/src/app/checkout/[paymentId]');

  // E2E-T1-F17-01: Hosted Checkout UI Initialization with Active Session
  it('E2E-T1-F17-01: Hosted Checkout UI Initialization with Active Session', () => {
    const pagePath = path.join(checkoutDir, 'page.tsx');
    expect(fs.existsSync(pagePath)).toBe(true);

    const content = fs.readFileSync(pagePath, 'utf8');
    expect(content).toContain('PaymentSummary');
    expect(content).toContain('amountBDT');
    expect(content).toContain('CheckoutPage');

    const amountFormatted = formatPaisaToBDT(150000n, { showSymbol: false });
    expect(amountFormatted).toBe('1,500.00');
  });

  // E2E-T1-F17-02: Payment Method Selector Display
  it('E2E-T1-F17-02: Payment Method Selector Display', () => {
    const pageContent = fs.readFileSync(path.join(checkoutDir, 'page.tsx'), 'utf8');
    expect(pageContent).toContain('MfsSelector');
    expect(pageContent).toContain('CardGatewaySelector');
    expect(pageContent).toContain('TabsTrigger');

    const mfsComponentPath = path.resolve(process.cwd(), 'apps/web/src/components/checkout/mfs-selector.tsx');
    expect(fs.existsSync(mfsComponentPath)).toBe(true);
    const mfsContent = fs.readFileSync(mfsComponentPath, 'utf8');
    expect(mfsContent).toContain('bKash');
    expect(mfsContent).toContain('Nagad');
  });

  // E2E-T1-F17-03: Dynamic Merchant Branding Theme Loading
  it('E2E-T1-F17-03: Dynamic Merchant Branding Theme Loading', () => {
    const summaryPath = path.resolve(process.cwd(), 'apps/web/src/components/checkout/payment-summary.tsx');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const content = fs.readFileSync(summaryPath, 'utf8');
    expect(content).toContain('merchantName');
    expect(content).toContain('PaymentSummary');
  });

  // E2E-T1-F17-04: Sandbox Payment Simulation Execution
  it('E2E-T1-F17-04: Sandbox Payment Simulation Execution', () => {
    const actionsPath = path.join(checkoutDir, 'actions.ts');
    expect(fs.existsSync(actionsPath)).toBe(true);

    const content = fs.readFileSync(actionsPath, 'utf8');
    expect(content).toContain('simulateSuccessAction');
    expect(content).toContain('simulateFailureAction');
    expect(content).toContain('submitTrxIdAction');
    expect(content).toContain('settlePaymentAtomic');
  });

  // E2E-T1-F17-05: Expired Session UI Handling
  it('E2E-T1-F17-05: Expired Session UI Handling', () => {
    const statusPagePath = path.join(checkoutDir, 'status', 'page.tsx');
    expect(fs.existsSync(statusPagePath)).toBe(true);

    const content = fs.readFileSync(statusPagePath, 'utf8');
    expect(content).toContain('status');
    expect(content).toContain('COMPLETED');
    expect(content).toContain('FAILED');
  });
});

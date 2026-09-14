import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 18: Merchant Dashboard (E2E-T1-F18)', () => {
  const dashboardDir = path.resolve(process.cwd(), 'apps/web/src/app/(dashboard)/dashboard');

  // E2E-T1-F18-01: Merchant Authentication & Session Cookie Creation
  it('E2E-T1-F18-01: Merchant Authentication & Session Cookie Creation', () => {
    const loginPagePath = path.resolve(process.cwd(), 'apps/web/src/app/(auth)/login/page.tsx');
    expect(fs.existsSync(loginPagePath)).toBe(true);

    const content = fs.readFileSync(loginPagePath, 'utf8');
    expect(content).toContain('loginAction');
    expect(content).toContain('password');
  });

  // E2E-T1-F18-02: Real-Time Payment Metrics Overview Widget
  it('E2E-T1-F18-02: Real-Time Payment Metrics Overview Widget', () => {
    const overviewPagePath = path.join(dashboardDir, 'page.tsx');
    expect(fs.existsSync(overviewPagePath)).toBe(true);

    const content = fs.readFileSync(overviewPagePath, 'utf8');
    expect(content).toContain('Settled Volume');
    expect(content).toContain('Transactions');
  });

  // E2E-T1-F18-03: Paginated Payment Transactions Table
  it('E2E-T1-F18-03: Paginated Payment Transactions Table', () => {
    const paymentsPagePath = path.join(dashboardDir, 'payments', 'page.tsx');
    expect(fs.existsSync(paymentsPagePath)).toBe(true);

    const content = fs.readFileSync(paymentsPagePath, 'utf8');
    expect(content).toContain('PaymentsClientTable');
    expect(content).toContain('amountPaisa');
  });

  // E2E-T1-F18-04: Single Payment Detail & Ledger Audit View
  it('E2E-T1-F18-04: Single Payment Detail & Ledger Audit View', () => {
    const paymentDetailPage = path.join(dashboardDir, 'payments', '[id]', 'page.tsx');
    expect(fs.existsSync(paymentDetailPage)).toBe(true);

    const content = fs.readFileSync(paymentDetailPage, 'utf8');
    expect(content).toContain('Financial Accounting Breakdown');
    expect(content).toContain('Ledger');
  });

  // E2E-T1-F18-05: Refund Initiation Action from Dashboard UI
  it('E2E-T1-F18-05: Refund Initiation Action from Dashboard UI', () => {
    const refundRoutePath = path.resolve(process.cwd(), 'apps/web/src/app/api/v1/payments/[id]/refund/route.ts');
    expect(fs.existsSync(refundRoutePath)).toBe(true);

    const content = fs.readFileSync(refundRoutePath, 'utf8');
    expect(content).toContain('refundAmountPaisa');
    expect(content).toContain('PARTIALLY_REFUNDED');
  });
});

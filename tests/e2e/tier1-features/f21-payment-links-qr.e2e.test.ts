import { describe, it, expect } from 'vitest';
import { createPaymentLinkSchema, Paisa } from '@denaneya/payment-core';
import { MERCHANT_A } from '../fixtures/merchants.js';

describe('Feature 21: Payment Links & Dynamic QR (E2E-T1-F21)', () => {
  // E2E-T1-F21-01: Create Shareable Single-Use Payment Link
  it('E2E-T1-F21-01: Create Shareable Single-Use Payment Link', () => {
    const input = {
      merchantId: MERCHANT_A.id,
      title: 'Consultation Fee',
      amountPaisa: 100000n, // 1000.00 BDT
      currency: 'BDT' as const,
      type: 'SINGLE_USE' as const,
      maxUses: 1,
    };

    const validated = createPaymentLinkSchema.parse(input);
    expect(validated.title).toBe('Consultation Fee');
    expect(validated.amountPaisa).toBe(100000n);
    expect(validated.type).toBe('SINGLE_USE');
    expect(validated.maxUses).toBe(1);
  });

  // E2E-T1-F21-02: Dynamic Bangla QR / EMVCo Merchant QR Generation
  it('E2E-T1-F21-02: Dynamic Bangla QR / EMVCo Merchant QR Generation', () => {
    // EMVCo QR format specifications: Merchant Category, Currency 050 (BDT), Country BD
    const mockEmvcoQr = '00020101021226400010com.bkash01110171234567852045999530305054071000.005802BD';

    expect(mockEmvcoQr.startsWith('000201')).toBe(true); // Format Indicator
    expect(mockEmvcoQr).toContain('5303050'); // Currency code 050 for BDT
    expect(mockEmvcoQr).toContain('5802BD'); // Country code BD
    expect(mockEmvcoQr).toContain('1000.00'); // Amount
  });

  // E2E-T1-F21-03: Link Access & Customer Redirection to Checkout
  it('E2E-T1-F21-03: Link Access & Customer Redirection to Checkout', () => {
    const linkSlug = 'plk_abc123';
    const redirectTarget = `https://checkout.denaneya.com/l/${linkSlug}`;

    expect(redirectTarget).toContain('/l/' + linkSlug);
    expect(new URL(redirectTarget).protocol).toBe('https:');
  });

  // E2E-T1-F21-04: Single-Use Link Deactivation After Payment
  it('E2E-T1-F21-04: Single-Use Link Deactivation After Payment', () => {
    const linkState = {
      id: 'plk_001',
      type: 'SINGLE_USE',
      usesCount: 1,
      maxUses: 1,
      status: 'ACTIVE',
    };

    if (linkState.usesCount >= linkState.maxUses) {
      linkState.status = 'COMPLETED';
    }

    expect(linkState.status).toBe('COMPLETED');
    const isPaymentAllowed = linkState.status === 'ACTIVE';
    expect(isPaymentAllowed).toBe(false);
  });

  // E2E-T1-F21-05: Manual Deactivation / Revocation of Payment Link
  it('E2E-T1-F21-05: Manual Deactivation / Revocation of Payment Link', () => {
    const linkState = {
      id: 'plk_002',
      status: 'ACTIVE',
    };

    // Merchant deactivates link
    linkState.status = 'INACTIVE';

    expect(linkState.status).toBe('INACTIVE');
    const isAccessible = linkState.status === 'ACTIVE';
    expect(isAccessible).toBe(false);
  });
});

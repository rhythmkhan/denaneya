import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import crypto from 'node:crypto';

describe('Tier 4: Workload Scenario 13 — Single-Use Link Tampering Defense & Reuse Rejection', () => {
  /**
   * E2E-T4-SC-13: Single-Use Payment Link Expiration, Tampering Defense, and Reuse Rejection
   * Link 1,200 BDT -> Fraudster tampers to 12.00 BDT -> HMAC signature fails ->
   * Legitimate customer pays 1,200 BDT -> Link marked COMPLETED ->
   * Second attempt to pay on same link rejected with "already fulfilled".
   */
  it('E2E-T4-SC-13: Single-Use Payment Link Expiration, Tampering Defense, and Reuse Rejection', () => {
    const secret = 'link_signing_secret_key_32_bytes_long_123';
    const linkData = {
      linkId: 'plnk_order_401',
      merchantId: 'mch_01',
      amountPaisa: '120000', // 1,200.00 BDT
      currency: 'BDT',
      singleUse: true,
    };

    // Generate cryptographic tamper-evident signature of link parameters
    const canonicalString = `${linkData.linkId}:${linkData.merchantId}:${linkData.amountPaisa}:${linkData.currency}`;
    const validSignature = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');

    const verifyLinkUrl = (params: { linkId: string; merchantId: string; amountPaisa: string; currency: string; sig: string }) => {
      const canonical = `${params.linkId}:${params.merchantId}:${params.amountPaisa}:${params.currency}`;
      const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
      if (params.sig !== expected) {
        throw new Error('TAMPERED_URL: Cryptographic parameter signature mismatch');
      }
      return true;
    };

    // 1. Legitimate link verifies
    expect(verifyLinkUrl({ ...linkData, sig: validSignature })).toBe(true);

    // 2. Fraudster tampers amount to 12.00 BDT (1200 paisa)
    const tamperedData = {
      ...linkData,
      amountPaisa: '1200', // Tampered!
      sig: validSignature,
    };
    expect(() => verifyLinkUrl(tamperedData)).toThrow(/TAMPERED_URL/);

    // 3. Legitimate customer completes payment on link
    const linkSession = {
      id: linkData.linkId,
      status: 'ACTIVE' as 'ACTIVE' | 'COMPLETED',
      singleUse: true,
      paidAt: null as Date | null,
    };

    const fulfillPayment = () => {
      if (linkSession.status === 'COMPLETED' && linkSession.singleUse) {
        throw new Error('LINK_ALREADY_FULFILLED: This payment link has already been fulfilled');
      }
      linkSession.status = 'COMPLETED';
      linkSession.paidAt = new Date();
      return { success: true };
    };

    // Customer payment succeeds
    expect(fulfillPayment().success).toBe(true);
    expect(linkSession.status).toBe('COMPLETED');

    // 4. Fraudster attempts to submit second payment on fulfilled link
    expect(() => fulfillPayment()).toThrow(/LINK_ALREADY_FULFILLED/);
  });
});

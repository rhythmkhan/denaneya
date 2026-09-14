import { describe, it, expect, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { MockAdapter } from '../src/adapters/mock.js';

describe('Gateway Adapters Concurrency & Idempotency', () => {
  beforeEach(() => {
    MockAdapter.clearMockData();
  });

  it('handles 50 concurrent payment initiations with same paymentId idempotently', async () => {
    const adapter = new MockAdapter({ isSandbox: true, simulatedLatencyMs: 1 });
    const paymentId = 'pay_concurrent_idempotent_01';

    const tasks = Array.from({ length: 50 }, () =>
      adapter.initiatePayment({
        paymentId,
        merchantId: 'mer_concurrency',
        amount: Paisa.fromBDT('500.00'),
        currency: 'BDT',
        customer: { name: 'Concurrent Buyer', email: 'buyer@example.com' },
        returnUrl: 'https://app.test/checkout/return',
        cancelUrl: 'https://app.test/checkout/cancel',
        ipnUrl: 'https://app.test/api/ipn',
      })
    );

    const results = await Promise.all(tasks);

    // All 50 calls should return the exact same redirectUrl and providerPaymentId
    const firstRedirect = results[0]!.redirectUrl;
    const firstSessionId = results[0]!.providerPaymentId;

    for (const res of results) {
      expect(res.redirectUrl).toBe(firstRedirect);
      expect(res.providerPaymentId).toBe(firstSessionId);
    }
  });
});
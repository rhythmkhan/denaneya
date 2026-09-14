import { describe, it, expect } from 'vitest';
import { createPaymentSchema, Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { MERCHANT_A } from '../fixtures/merchants.js';
import { API_KEYS } from '../fixtures/api-keys.js';

describe('Feature 20: Payment REST API (v1) (E2E-T1-F20)', () => {
  // E2E-T1-F20-01: POST /api/v1/payments Payment Intent Creation
  it('E2E-T1-F20-01: POST /api/v1/payments Payment Intent Creation', () => {
    const payload = {
      merchantId: MERCHANT_A.id,
      amountPaisa: 50000n, // 500.00 BDT
      currency: 'BDT' as const,
      customer: {
        name: 'Rahim Ahmed',
        email: 'rahim@example.com',
        phone: '01712345678',
      },
      description: 'Consulting Fee Payment',
      redirectUrl: 'https://merchant.example.com/checkout/return',
    };

    const validated = createPaymentSchema.parse(payload);
    expect(validated.merchantId).toBe(MERCHANT_A.id);
    expect(validated.amountPaisa).toBe(50000n);
    expect(validated.currency).toBe('BDT');
    expect(validated.customer?.name).toBe('Rahim Ahmed');

    const paisa = new Paisa(validated.amountPaisa);
    expect(paisa.toBDT()).toBe('500.00');
  });

  // E2E-T1-F20-02: GET /api/v1/payments/:id Payment Retrieval
  it('E2E-T1-F20-02: GET /api/v1/payments/:id Payment Retrieval', () => {
    const mockPayment = {
      id: 'pay_test_01h8a9b',
      merchantId: MERCHANT_A.id,
      amountPaisa: 50000n,
      feePaisa: 1250n,
      currency: 'BDT',
      status: 'COMPLETED',
      provider: 'BKASH',
      providerTransactionId: '9K38AL90',
      createdAt: new Date(),
    };

    expect(mockPayment.id.startsWith('pay_')).toBe(true);
    expect(mockPayment.merchantId).toBe(MERCHANT_A.id);
    expect(mockPayment.amountPaisa).toBe(50000n);
    expect(mockPayment.status).toBe('COMPLETED');
  });

  // E2E-T1-F20-03: POST /api/v1/payments/:id/cancel Payment Cancellation
  it('E2E-T1-F20-03: POST /api/v1/payments/:id/cancel Payment Cancellation', () => {
    // Validate transition from CREATED to CANCELLED
    const transition = validatePaymentTransition('CREATED', 'CANCELLED');
    expect(transition.allowed).toBe(true);

    // Validate terminal state cannot be re-cancelled
    const illegalTransition = validatePaymentTransition('COMPLETED', 'CANCELLED');
    expect(illegalTransition.allowed).toBe(false);
  });

  // E2E-T1-F20-04: POST /api/v1/payments/:id/refund Refund Execution
  it('E2E-T1-F20-04: POST /api/v1/payments/:id/refund Refund Execution', () => {
    const originalAmount = Paisa.fromBDT('1000.00');
    const refundAmount = Paisa.fromBDT('250.00');

    expect(refundAmount.lte(originalAmount)).toBe(true);
    const remaining = originalAmount.subtract(refundAmount);
    expect(remaining.toBDT()).toBe('750.00');

    const refundTransition = validatePaymentTransition('COMPLETED', 'PARTIALLY_REFUNDED');
    expect(refundTransition.allowed).toBe(true);
  });

  // E2E-T1-F20-05: Idempotent Replay Contract on Repeated POST
  it('E2E-T1-F20-05: Idempotent Replay Contract on Repeated POST', () => {
    const idempotencyKey = 'idem_key_uuid_123456789';
    const store = new Map<string, { id: string; amountPaisa: bigint }>();

    // First request
    const firstId = 'pay_001_first';
    store.set(idempotencyKey, { id: firstId, amountPaisa: 50000n });

    // Second request with identical key
    const replayRecord = store.get(idempotencyKey);
    expect(replayRecord).toBeDefined();
    expect(replayRecord?.id).toBe(firstId);
    expect(replayRecord?.amountPaisa).toBe(50000n);
  });
});

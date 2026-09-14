import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { createRefundSchema } from '@denaneya/payment-core';
import { buildRefundTransaction, validateLedgerEntries } from '@denaneya/ledger';
import { POST as refundPost } from '../../src/app/api/v1/payments/[id]/refund/route';

describe('Refund Management & Double-Entry Ledger Invariants', () => {
  it('createRefundSchema validates valid integer Paisa refund payload', () => {
    const valid = createRefundSchema.parse({
      paymentId: 'pay_test_123',
      merchantId: 'mch_test_123',
      amountPaisa: 150000n,
      currency: 'BDT',
      reason: 'CUSTOMER_REQUEST',
    });
    expect(valid.amountPaisa).toBe(150000n);
    expect(valid.merchantId).toBe('mch_test_123');
    expect(valid.currency).toBe('BDT');
    expect(valid.reason).toBe('CUSTOMER_REQUEST');
  });

  it('createRefundSchema rejects invalid currencies and non-positive amounts', () => {
    expect(() => {
      createRefundSchema.parse({
        paymentId: 'pay_test_123',
        merchantId: 'mch_test_123',
        amountPaisa: -100n,
        currency: 'BDT',
        reason: 'CUSTOMER_REQUEST',
      });
    }).toThrow();

    expect(() => {
      createRefundSchema.parse({
        paymentId: 'pay_test_123',
        merchantId: 'mch_test_123',
        amountPaisa: 5000n,
        currency: 'USD',
        reason: 'CUSTOMER_REQUEST',
      });
    }).toThrow();
  });

  it('buildRefundTransaction generates balanced double-entry entries (sum debits === sum credits)', () => {
    const refundPaisa = 150000n;
    const tx = buildRefundTransaction({
      refundId: 'ref_gen_01',
      paymentId: 'pay_gen_01',
      merchantId: 'mch_company_bd',
      refundAmountPaisa: refundPaisa,
      platformFeeRefundPaisa: 2250n,
    });

    expect(tx.transactionType).toBe('REFUND');
    expect(tx.entries.length).toBeGreaterThanOrEqual(2);

    const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBeGreaterThan(0n);
    expect(totalDebits - totalCredits).toBe(0n);
  });

  it('refund route handler rejects unauthenticated requests with HTTP 401', async () => {
    const unauthReq = new NextRequest('http://localhost/api/v1/payments/pay_123/refund', {
      method: 'POST',
      body: JSON.stringify({
        amountPaisa: 10000,
        reason: 'CUSTOMER_REQUEST',
      }),
    });

    const res = await refundPost(unauthReq, { params: Promise.resolve({ id: 'pay_123' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

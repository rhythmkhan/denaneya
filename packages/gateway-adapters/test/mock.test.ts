import { describe, it, expect, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { MockAdapter } from '../src/adapters/mock.js';
import { GatewayError } from '../src/errors.js';

describe('MockAdapter Deterministic Sandbox', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    MockAdapter.clearMockData();
    adapter = new MockAdapter({ isSandbox: true, simulatedLatencyMs: 0 });
  });

  it('completes normal payment workflow with deterministic generated TrxId', async () => {
    const initResult = await adapter.initiatePayment({
      paymentId: 'pay_mock_100',
      merchantId: 'mer_mock',
      amount: Paisa.fromBDT('500.00'),
      currency: 'BDT',
      customer: { name: 'Mock User', email: 'mock@example.com' },
      returnUrl: 'https://app.test/checkout/return',
      cancelUrl: 'https://app.test/checkout/cancel',
      ipnUrl: 'https://app.test/api/ipn',
    });

    expect(initResult.provider).toBe('MOCK');
    expect(initResult.redirectUrl).toContain('status=success');

    // Idempotent second initiate call
    const init2 = await adapter.initiatePayment({
      paymentId: 'pay_mock_100',
      merchantId: 'mer_mock',
      amount: Paisa.fromBDT('500.00'),
      currency: 'BDT',
      customer: { name: 'Mock User' },
      returnUrl: 'https://app.test/checkout/return',
      cancelUrl: 'https://app.test/checkout/cancel',
      ipnUrl: 'https://app.test/api/ipn',
    });
    expect(init2.providerPaymentId).toBe(initResult.providerPaymentId);

    const verifyResult = await adapter.verifyPayment({
      paymentId: 'pay_mock_100',
      amount: Paisa.fromBDT('500.00'),
    });

    expect(verifyResult.status).toBe('COMPLETED');
    expect(verifyResult.providerTrxId).toMatch(/^MOCK_TRX_/);
    expect(verifyResult.amount.toBDT()).toBe('500.00');

    // Query payment
    const queryResult = await adapter.queryPayment(verifyResult.providerTrxId);
    expect(queryResult.status).toBe('COMPLETED');
    expect(queryResult.amount.toBDT()).toBe('500.00');

    // Query non-existent payment
    const queryNotFound = await adapter.queryPayment('NON_EXISTENT_TRX');
    expect(queryNotFound.status).toBe('FAILED');
    expect(queryNotFound.amount.toBDT()).toBe('0.00');
  });

  it('triggers PAYMENT_DECLINED for amounts ending in .99', async () => {
    const result = await adapter.verifyPayment({
      paymentId: 'pay_mock_decline',
      amount: Paisa.fromBDT('100.99'), // 10099 paisa
    });

    expect(result.status).toBe('FAILED');
    expect(result.rawResponse).toEqual(expect.objectContaining({ reason: 'CARD_DECLINED' }));
  });

  it('triggers NETWORK_TIMEOUT for amounts ending in .98', async () => {
    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_mock_timeout',
        amount: Paisa.fromBDT('100.98'), // 10098 paisa
      })
    ).rejects.toThrow(/NETWORK_TIMEOUT/);
  });

  it('triggers INSUFFICIENT_FUNDS for amounts ending in .97', async () => {
    const result = await adapter.verifyPayment({
      paymentId: 'pay_mock_insufficient',
      amount: Paisa.fromBDT('100.97'),
    });

    expect(result.status).toBe('FAILED');
    expect(result.rawResponse).toEqual(expect.objectContaining({ reason: 'INSUFFICIENT_FUNDS' }));
  });

  it('triggers EXPIRED_SESSION for amounts ending in .96', async () => {
    const result = await adapter.verifyPayment({
      paymentId: 'pay_mock_expired',
      amount: Paisa.fromBDT('100.96'),
    });

    expect(result.status).toBe('EXPIRED');
  });

  it('enforces refund boundaries and supports queryRefund', async () => {
    await adapter.initiatePayment({
      paymentId: 'pay_mock_refund_1',
      merchantId: 'mer_mock',
      amount: Paisa.fromBDT('1000.00'),
      currency: 'BDT',
      customer: { name: 'User', email: 'u@example.com' },
      returnUrl: 'https://return',
      cancelUrl: 'https://cancel',
      ipnUrl: 'https://ipn',
    });

    await adapter.verifyPayment({
      paymentId: 'pay_mock_refund_1',
      amount: Paisa.fromBDT('1000.00'),
    });

    // Partial refund 1: 400 BDT
    const ref1 = await adapter.refundPayment({
      paymentId: 'pay_mock_refund_1',
      providerTrxId: 'TRX_1',
      refundAmount: Paisa.fromBDT('400.00'),
      totalCapturedAmount: Paisa.fromBDT('1000.00'),
      refundReason: 'Partial refund',
      refundId: 'ref_1',
    });
    expect(ref1.status).toBe('SUCCEEDED');

    // Query existing refund
    const queryRef1 = await adapter.queryRefund('ref_1');
    expect(queryRef1.status).toBe('SUCCEEDED');
    expect(queryRef1.amount.toBDT()).toBe('400.00');

    // Query non-existent refund
    const queryNotFound = await adapter.queryRefund('NON_EXISTENT_REF');
    expect(queryNotFound.status).toBe('FAILED');
    expect(queryNotFound.amount.toBDT()).toBe('0.00');

    // Partial refund 2: 600 BDT (Cumulative 1000 BDT)
    const ref2 = await adapter.refundPayment({
      paymentId: 'pay_mock_refund_1',
      providerTrxId: 'TRX_1',
      refundAmount: Paisa.fromBDT('600.00'),
      totalCapturedAmount: Paisa.fromBDT('1000.00'),
      refundReason: 'Remaining refund',
      refundId: 'ref_2',
    });
    expect(ref2.status).toBe('SUCCEEDED');

    // Excess refund over totalCapturedAmount: 1500 BDT > 1000 BDT
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_mock_refund_1',
        providerTrxId: 'TRX_1',
        refundAmount: Paisa.fromBDT('1500.00'),
        totalCapturedAmount: Paisa.fromBDT('1000.00'),
        refundReason: 'Excess of total captured',
        refundId: 'ref_excess_total',
      })
    ).rejects.toThrow(/Refund amount cannot exceed total captured amount/);

    // Excess refund: 100 BDT -> throws REFUND_EXCEEDS_AMOUNT
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_mock_refund_1',
        providerTrxId: 'TRX_1',
        refundAmount: Paisa.fromBDT('100.00'),
        totalCapturedAmount: Paisa.fromBDT('1000.00'),
        refundReason: 'Excess refund',
        refundId: 'ref_3',
      })
    ).rejects.toThrow(/REFUND_EXCEEDS_AMOUNT/);
  });

  it('looks up record by providerPaymentId when paymentId does not match', async () => {
    const init = await adapter.initiatePayment({
      paymentId: 'pay_orig_1',
      merchantId: 'mer_1',
      amount: Paisa.fromBDT('300.00'),
      currency: 'BDT',
      customer: { name: 'Customer' },
      returnUrl: 'https://return',
      cancelUrl: 'https://cancel',
      ipnUrl: 'https://ipn',
    });

    const verify = await adapter.verifyPayment({
      paymentId: 'unmatched_payment_id',
      providerPaymentId: init.providerPaymentId,
    });
    expect(verify.status).toBe('COMPLETED');
    expect(verify.amount.toBDT()).toBe('300.00');
  });

  it('verifies mock webhook signatures and runs healthCheck', async () => {
    expect(await adapter.verifyWebhookSignature({ 'x-mock-signature': 'valid' }, {})).toBe(true);
    expect(await adapter.verifyWebhookSignature({ 'x-mock-signature': 'invalid' }, {})).toBe(false);

    const health = await adapter.healthCheck();
    expect(health.status).toBe('UP');
    expect(health.provider).toBe('MOCK');
  });
});
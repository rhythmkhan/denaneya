import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { AamarPayAdapter } from '../src/adapters/aamarpay.js';
import { GatewayError } from '../src/errors.js';
import { hmacSha256 } from '../src/crypto/hash.js';

describe('AamarPayAdapter', () => {
  const config = {
    isSandbox: true,
    storeId: 'aamarpaytest',
    signatureKey: '28c78bb1f45112f5d40b956fe104645a',
  };

  let adapter: AamarPayAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new AamarPayAdapter(config);
  });

  it('initiates JSON POST checkout and returns payment URL', async () => {
    const mockResponse = {
      result: 'true',
      payment_url: 'https://sandbox.aamarpay.com/paynow?track=AAM1726244005',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await adapter.initiatePayment({
      paymentId: 'pay_aamar_001',
      merchantId: 'mer_aamar',
      amount: Paisa.fromBDT('320.50'),
      currency: 'BDT',
      customer: {
        name: 'Sadia Sultana',
        email: 'sadia@example.com',
        phone: '01922334455',
      },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(result.provider).toBe('AAMARPAY');
    expect(result.redirectUrl).toBe(mockResponse.payment_url);
    expect(result.providerPaymentId).toBe('pay_aamar_001');
  });

  it('throws INVALID_REQUEST when initiation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'false', error: 'Invalid store' }), { status: 200 })
    );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_aamar_err',
        merchantId: 'mer_aamar',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'Customer' },
        returnUrl: 'https://a.test/cb',
        cancelUrl: 'https://a.test/can',
        ipnUrl: 'https://a.test/ipn',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('verifies payment with trxcheck API and parses service charge', async () => {
    const mockCheckResponse = {
      pg_txnid: 'AAM1726244005',
      mer_txnid: 'pay_aamar_002',
      amount: '320.50',
      currency: 'BDT',
      pay_status: 'Successful',
      card_type: 'bKash-bKash',
      pg_service_charge_bdt: '4.80',
      date_processed: '2026-09-13 22:50:00',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockCheckResponse), { status: 200 })
    );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_aamar_002',
      amount: Paisa.fromBDT('320.50'),
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('AAM1726244005');
    expect(result.amount.toBDT()).toBe('320.50');
    expect(result.fee.toBDT()).toBe('4.80');
    expect(result.cardType).toBe('bKash-bKash');
  });

  it('handles missing transaction id in verifyPayment', async () => {
    await expect(adapter.verifyPayment({})).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('maps Pending and Cancelled pay_status in verifyPayment', async () => {
    // Pending
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ pay_status: 'Pending', mer_txnid: 'pay_p' }), { status: 200 })
    );
    const resP = await adapter.verifyPayment({ paymentId: 'pay_p' });
    expect(resP.status).toBe('PENDING');

    // Cancelled
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ pay_status: 'Cancelled', mer_txnid: 'pay_c' }), { status: 200 })
    );
    const resC = await adapter.verifyPayment({ paymentId: 'pay_c' });
    expect(resC.status).toBe('CANCELLED');

    // Failed
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ pay_status: 'Failed', mer_txnid: 'pay_f' }), { status: 200 })
    );
    const resF = await adapter.verifyPayment({ paymentId: 'pay_f' });
    expect(resF.status).toBe('FAILED');
  });

  it('throws GATEWAY_UNAVAILABLE when validation response has missing pay_status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'Empty pay status' }), { status: 200 })
    );

    await expect(
      adapter.verifyPayment({ paymentId: 'pay_missing' })
    ).rejects.toMatchObject({
      code: 'GATEWAY_UNAVAILABLE',
      httpStatus: 502,
      isRetryable: true,
    });
  });

  it('throws AMOUNT_MISMATCH on verified amount disparity', async () => {
    const mockCheckResponse = {
      pg_txnid: 'AAM1726244006',
      mer_txnid: 'pay_aamar_003',
      amount: '200.00',
      currency: 'BDT',
      pay_status: 'Successful',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockCheckResponse), { status: 200 })
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_aamar_003',
        amount: Paisa.fromBDT('300.00'),
      })
    ).rejects.toThrow(/AMOUNT_MISMATCH/);
  });

  it('throws REFUND_EXCEEDS_AMOUNT and REFUND_NOT_ALLOWED on refundPayment', async () => {
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_1',
        providerTrxId: 'AAM_1',
        refundAmount: Paisa.fromBDT('500.00'),
        totalCapturedAmount: Paisa.fromBDT('400.00'),
        refundReason: 'Excess',
        refundId: 'ref_1',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_EXCEEDS_AMOUNT',
    });

    await expect(
      adapter.refundPayment({
        paymentId: 'pay_1',
        providerTrxId: 'AAM_1',
        refundAmount: Paisa.fromBDT('100.00'),
        totalCapturedAmount: Paisa.fromBDT('400.00'),
        refundReason: 'Return',
        refundId: 'ref_1',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
    });
  });

  it('verifies webhook signature using cryptographic HMAC or server verification fallback', async () => {
    const payload = JSON.stringify({ mer_txnid: 'AAM_WEBHOOK_01', amount: '100.00' });
    const signature = hmacSha256(payload, config.signatureKey);

    // Valid HMAC header
    expect(
      await adapter.verifyWebhookSignature({ 'x-aamarpay-signature': signature }, payload)
    ).toBe(true);

    // Invalid HMAC header
    expect(
      await adapter.verifyWebhookSignature({ 'x-aamarpay-signature': 'bad_sig' }, payload)
    ).toBe(false);

    // Missing tranId
    expect(await adapter.verifyWebhookSignature({}, {})).toBe(false);

    // Fallback to server query
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mer_txnid: 'AAM_WEBHOOK_01',
          pay_status: 'Successful',
          amount: '100.00',
        }),
        { status: 200 }
      )
    );

    expect(await adapter.verifyWebhookSignature({}, { mer_txnid: 'AAM_WEBHOOK_01' })).toBe(true);

    // Fallback query throws -> returns false
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Down'));
    expect(await adapter.verifyWebhookSignature({}, { mer_txnid: 'AAM_ERR' })).toBe(false);

    // URLSearchParams body string
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mer_txnid: 'AAM_URL_01',
          pay_status: 'Successful',
          amount: '100.00',
        }),
        { status: 200 }
      )
    );
    expect(await adapter.verifyWebhookSignature({}, 'mer_txnid=AAM_URL_01&amount=100.00')).toBe(true);
  });

  it('uses production baseUrl when isSandbox is false', async () => {
    const liveAdapter = new AamarPayAdapter({ ...config, isSandbox: false });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'true', payment_url: 'https://secure.aamarpay.com/pay' }), { status: 200 })
    );
    await liveAdapter.initiatePayment({
      paymentId: 'live_pay_1',
      merchantId: 'mer_1',
      amount: Paisa.fromBDT('100.00'),
      currency: 'BDT',
      customer: { name: 'Customer' },
      returnUrl: 'https://return',
      cancelUrl: 'https://cancel',
      ipnUrl: 'https://ipn',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('https://secure.aamarpay.com'),
      expect.anything()
    );
  });

  it('queries payment details with queryPayment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mer_txnid: 'AAM_QUERY_001',
          pg_txnid: 'PG_QUERY_TRX',
          pay_status: 'Successful',
          amount: '250.00',
          date_processed: '2026-09-13T10:00:00Z',
        }),
        { status: 200 }
      )
    );

    const res = await adapter.queryPayment('AAM_QUERY_001');
    expect(res.status).toBe('COMPLETED');
    expect(res.amount.toBDT()).toBe('250.00');
    expect(res.providerTrxId).toBe('PG_QUERY_TRX');
  });

  it('throws REFUND_NOT_ALLOWED on queryRefund', async () => {
    await expect(adapter.queryRefund('REF_AAMAR_1')).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
      httpStatus: 400,
      isRetryable: false,
    });
  });

  it('runs healthCheck returning UP or DOWN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('OK', { status: 200 })
    );
    const up = await adapter.healthCheck();
    expect(up.status).toBe('UP');

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Down'));
    const down = await adapter.healthCheck();
    expect(down.status).toBe('DOWN');
  });
});
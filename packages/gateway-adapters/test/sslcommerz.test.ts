import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { SslCommerzAdapter } from '../src/adapters/sslcommerz.js';
import { GatewayError } from '../src/errors.js';
import { md5 } from '../src/crypto/hash.js';

describe('SslCommerzAdapter', () => {
  const config = {
    isSandbox: true,
    storeId: 'test_store_123',
    storePassword: 'test_password_456',
  };

  let adapter: SslCommerzAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new SslCommerzAdapter(config);
  });

  it('initiates payment and returns GatewayPageURL', async () => {
    const mockResponse = {
      status: 'SUCCESS',
      sessionkey: 'sess_abc_123',
      GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testsession',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await adapter.initiatePayment({
      paymentId: 'pay_test_001',
      merchantId: 'mer_123',
      amount: Paisa.fromBDT('500.00'),
      currency: 'BDT',
      customer: {
        name: 'Rahim Ahmed',
        email: 'rahim@example.com',
        phone: '01712345678',
      },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(result.provider).toBe('SSLCOMMERZ');
    expect(result.redirectUrl).toBe(mockResponse.GatewayPageURL);
    expect(result.providerPaymentId).toBe('sess_abc_123');
  });

  it('throws GatewayError when initiation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'FAILED', failedreason: 'Store Credential Error' }),
        { status: 200 }
      )
    );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_test_002',
        merchantId: 'mer_123',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'Customer', email: 'c@example.com' },
        returnUrl: 'https://merchant.example/callback',
        cancelUrl: 'https://merchant.example/cancel',
        ipnUrl: 'https://api.example/ipn',
      })
    ).rejects.toThrow(GatewayError);
  });

  it('verifies payment with validation query and parses Paisa fee', async () => {
    const mockValResponse = {
      status: 'VALID',
      tran_id: 'pay_test_003',
      val_id: 'val_998877',
      amount: '500.00',
      store_amount: '487.50',
      currency: 'BDT',
      bank_tran_id: 'BANK_TRX_101',
      card_type: 'VISA-CityBank',
      tran_date: '2026-09-13 22:30:00',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockValResponse), { status: 200 })
    );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_test_003',
      amount: Paisa.fromBDT('500.00'),
      rawCallbackParams: { val_id: 'val_998877' },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('BANK_TRX_101');
    expect(result.amount.toBDT()).toBe('500.00');
    expect(result.fee.toBDT()).toBe('12.50');
    expect(result.currency).toBe('BDT');
    expect(result.cardType).toBe('VISA-CityBank');
  });

  it('throws INVALID_REQUEST when val_id is missing', async () => {
    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_test_missing_val',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('throws GATEWAY_UNAVAILABLE when validation response lacks status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ no_status_field: true }), { status: 200 })
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_test_missing_status',
        rawCallbackParams: { val_id: 'val_123' },
      })
    ).rejects.toMatchObject({
      code: 'GATEWAY_UNAVAILABLE',
      isRetryable: true,
      httpStatus: 502,
    });
  });

  it('throws CURRENCY_MISMATCH when currency is not BDT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'VALID',
          tran_id: 'pay_cur_mismatch',
          currency: 'USD',
          amount: '100.00',
        }),
        { status: 200 }
      )
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_cur_mismatch',
        rawCallbackParams: { val_id: 'val_usd' },
      })
    ).rejects.toMatchObject({
      code: 'CURRENCY_MISMATCH',
    });
  });

  it('throws AMOUNT_MISMATCH error when verified amount differs from expectation', async () => {
    const mockValResponse = {
      status: 'VALID',
      tran_id: 'pay_test_004',
      val_id: 'val_112233',
      amount: '400.00',
      currency: 'BDT',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockValResponse), { status: 200 })
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_test_004',
        amount: Paisa.fromBDT('500.00'),
        rawCallbackParams: { val_id: 'val_112233' },
      })
    ).rejects.toThrow(/AMOUNT_MISMATCH/);
  });

  it('verifies MD5 webhook IPN signature correctly and rejects invalid/missing keys', async () => {
    const storePassword = config.storePassword;
    const passwordHash = md5(storePassword);

    const params: Record<string, string> = {
      tran_id: 'pay_test_005',
      val_id: 'val_778899',
      amount: '350.00',
      status: 'VALID',
      verify_key: 'amount,status,tran_id,val_id',
    };

    const signaturePayload = `amount=350.00&status=VALID&tran_id=pay_test_005&val_id=val_778899&store_passwd=${passwordHash}`;
    const verifySign = md5(signaturePayload);
    params.verify_sign = verifySign;

    const isValid = await adapter.verifyWebhookSignature({}, params);
    expect(isValid).toBe(true);

    const isTampered = await adapter.verifyWebhookSignature({}, { ...params, verify_sign: 'invalid_hash' });
    expect(isTampered).toBe(false);

    expect(await adapter.verifyWebhookSignature({}, {})).toBe(false);
    expect(await adapter.verifyWebhookSignature({}, { verify_sign: 'abc' })).toBe(false);
    expect(await adapter.verifyWebhookSignature({}, { verify_key: 'abc' })).toBe(false);
  });

  it('processes refund and checks amount bounds', async () => {
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_test_006',
        providerTrxId: 'BANK_TRX_101',
        refundAmount: Paisa.fromBDT('600.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Customer request',
        refundId: 'ref_001',
      })
    ).rejects.toThrow(/REFUND_EXCEEDS_AMOUNT/);

    // Upstream failure
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'failed', errorReason: 'Already refunded' }), {
        status: 200,
      })
    );

    await expect(
      adapter.refundPayment({
        paymentId: 'pay_test_006',
        providerTrxId: 'BANK_TRX_101',
        refundAmount: Paisa.fromBDT('200.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Partial return',
        refundId: 'ref_001',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
    });

    // Success
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'success', refund_ref_id: 'SSL_REF_999' }), {
        status: 200,
      })
    );

    const result = await adapter.refundPayment({
      paymentId: 'pay_test_006',
      providerTrxId: 'BANK_TRX_101',
      refundAmount: Paisa.fromBDT('200.00'),
      totalCapturedAmount: Paisa.fromBDT('500.00'),
      refundReason: 'Partial return',
      refundId: 'ref_001',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.providerRefundId).toBe('SSL_REF_999');
    expect(result.refundAmount.toBDT()).toBe('200.00');
  });

  it('queries payment details with queryPayment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          element: [
            {
              status: 'VALID',
              tran_id: 'pay_query_001',
              bank_tran_id: 'BANK_TRX_999',
              amount: '120.50',
              tran_date: '2026-09-13 12:00:00',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await adapter.queryPayment('pay_query_001');
    expect(res.status).toBe('COMPLETED');
    expect(res.amount.toBDT()).toBe('120.50');
    expect(res.providerTrxId).toBe('BANK_TRX_999');
  });

  it('queries refund details with queryRefund', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'success',
          refund_ref_id: 'REF_SSL_777',
          bank_tran_id: 'BANK_TRX_777',
          refund_amount: '50.00',
        }),
        { status: 200 }
      )
    );

    const res = await adapter.queryRefund('REF_SSL_777');
    expect(res.status).toBe('SUCCEEDED');
    expect(res.amount.toBDT()).toBe('50.00');
    expect(res.providerRefundId).toBe('REF_SSL_777');
  });

  it('uses live baseUrl when isSandbox is false', async () => {
    const liveAdapter = new SslCommerzAdapter({ ...config, isSandbox: false });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'SUCCESS', GatewayPageURL: 'https://securepay.sslcommerz.com/gw' }))
    );
    await liveAdapter.initiatePayment({
      paymentId: 'live_001',
      merchantId: 'mer_1',
      amount: Paisa.fromBDT('100.00'),
      currency: 'BDT',
      customer: { name: 'Live User', email: 'live@example.com' },
      returnUrl: 'https://app.com/ret',
      cancelUrl: 'https://app.com/can',
      ipnUrl: 'https://app.com/ipn',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('https://securepay.sslcommerz.com'),
      expect.anything()
    );
  });

  it('handles non-valid status in verifyPayment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'FAILED', error: 'Payment declined' }), { status: 200 })
    );
    const res = await adapter.verifyPayment({
      paymentId: 'pay_fail_1',
      providerTrxId: 'trx_fail_1',
      rawCallbackParams: { val_id: 'val_fail' },
    });
    expect(res.status).toBe('FAILED');
    expect(res.amount.amountPaisa).toBe(0n);

    // Non-valid status with amount present
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'CANCELLED', amount: '250.00' }), { status: 200 })
    );
    const resAmount = await adapter.verifyPayment({
      paymentId: 'pay_fail_2',
      providerTrxId: 'trx_fail_2',
      rawCallbackParams: { val_id: 'val_fail_2' },
    });
    expect(resAmount.status).toBe('CANCELLED');
    expect(resAmount.amount.toBDT()).toBe('250.00');
  });

  it('throws REFUND_NOT_ALLOWED with errorReason when refund status is not success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'failed', errorReason: 'Declined by bank' }), { status: 200 })
    );
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_ref_fail',
        providerTrxId: 'TRX_1',
        refundAmount: Paisa.fromBDT('50.00'),
        totalCapturedAmount: Paisa.fromBDT('100.00'),
        refundReason: 'Return',
        refundId: 'ref_f',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
      message: expect.stringContaining('Declined by bank'),
    });
  });

  it('returns false in verifyWebhookSignature when verify_sign or verify_key is missing', async () => {
    expect(await adapter.verifyWebhookSignature({}, {})).toBe(false);
    expect(await adapter.verifyWebhookSignature({}, 'foo=bar')).toBe(false);
  });

  it('handles FAILED status in queryPayment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'FAILED' }), { status: 200 })
    );
    const res = await adapter.queryPayment('trx_failed');
    expect(res.status).toBe('FAILED');
  });

  it('handles pending or failed status in queryRefund', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'pending', refund_amount: '30.00' }), { status: 200 })
    );
    const res = await adapter.queryRefund('ref_pending');
    expect(res.status).toBe('PENDING');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'failed' }), { status: 200 })
    );
    const resFailed = await adapter.queryRefund('ref_failed');
    expect(resFailed.status).toBe('FAILED');
  });

  it('performs healthCheck returning UP, DEGRADED, or DOWN', async () => {
    // UP
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('OK', { status: 200 })
    );
    const healthUp = await adapter.healthCheck();
    expect(healthUp.status).toBe('UP');

    // DEGRADED
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 })
    );
    const healthDegraded = await adapter.healthCheck();
    expect(healthDegraded.status).toBe('DEGRADED');

    // DOWN
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Connection failed')
    );
    const healthDown = await adapter.healthCheck();
    expect(healthDown.status).toBe('DOWN');
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { BkashAdapter } from '../src/adapters/bkash.js';
import { GatewayError } from '../src/errors.js';
import { hmacSha256 } from '../src/crypto/hash.js';

describe('BkashAdapter', () => {
  const config = {
    isSandbox: true,
    appKey: 'test_app_key_1',
    appSecret: 'test_app_secret_1',
    username: 'test_bkash_user',
    password: 'test_bkash_password',
  };

  let adapter: BkashAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new BkashAdapter(config);
  });

  it('uses production baseUrl when isSandbox is false', async () => {
    const prodAdapter = new BkashAdapter({ ...config, isSandbox: false });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: '0000', id_token: 'prod_tok', expires_in: 3600 }), { status: 200 })
    );
    const token = await prodAdapter.getAuthToken();
    expect(token).toBe('prod_tok');
  });

  it('handles token refresh via /token/refresh when refresh token exists', async () => {
    // First grant token with refresh_token
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: '0000',
          id_token: 'init_token',
          refresh_token: 'refresh_tok_123',
          expires_in: 0,
        }),
        { status: 200 }
      )
    );
    await adapter.getAuthToken();

    // Now token is expired (expires_in: 0). Next call should invoke refresh
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: '0000',
          id_token: 'refreshed_token',
          refresh_token: 'new_refresh_tok',
          expires_in: 3600,
        }),
        { status: 200 }
      )
    );
    const refreshed = await adapter.getAuthToken();
    expect(refreshed).toBe('refreshed_token');
  });

  it('falls back to token grant when /token/refresh fails', async () => {
    // First grant token with refresh_token
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: '0000',
          id_token: 'init_token',
          refresh_token: 'bad_refresh',
          expires_in: 0,
        }),
        { status: 200 }
      )
    );
    await adapter.getAuthToken();

    // Refresh fails, grant succeeds
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Refresh failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            id_token: 'fallback_granted_token',
            expires_in: 3600,
          }),
          { status: 200 }
        )
      );

    const resultToken = await adapter.getAuthToken();
    expect(resultToken).toBe('fallback_granted_token');
  });

  it('grants token and initiates payment with mode 0011', async () => {
    const grantResponse = {
      statusCode: '0000',
      id_token: 'bkash_token_999',
      refresh_token: 'bkash_refresh_888',
      expires_in: 3600,
    };

    const createResponse = {
      statusCode: '0000',
      paymentID: 'BK_PAY_12345',
      bkashURL: 'https://tokenized.sandbox.bka.sh/checkout?paymentID=BK_PAY_12345',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(grantResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createResponse), { status: 200 }));

    const result = await adapter.initiatePayment({
      paymentId: 'pay_bkash_001',
      merchantId: 'mer_bkash',
      amount: Paisa.fromBDT('1200.00'),
      currency: 'BDT',
      customer: {
        name: 'Tanvir Hossain',
        email: 'tanvir@example.com',
        phone: '01711223344',
      },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(result.provider).toBe('BKASH');
    expect(result.redirectUrl).toBe(createResponse.bkashURL);
    expect(result.providerPaymentId).toBe(createResponse.paymentID);
  });

  it('throws GatewayError when initiatePayment fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_1', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '2001', statusMessage: 'Invalid amount' }), { status: 200 })
      );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_fail',
        merchantId: 'mer_1',
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

  it('executes payment upon callback and verifies completed transaction', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            paymentID: 'BK_PAY_12345',
            trxID: '9K38AL90',
            amount: '1200.00',
            transactionStatus: 'Completed',
            customerMsisdn: '01711223344',
            paymentExecuteTime: '2026-09-13T22:55:00+06:00',
          }),
          { status: 200 }
        )
      );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_bkash_001',
      providerPaymentId: 'BK_PAY_12345',
      amount: Paisa.fromBDT('1200.00'),
      rawCallbackParams: { status: 'success', paymentID: 'BK_PAY_12345' },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('9K38AL90');
    expect(result.amount.toBDT()).toBe('1200.00');
    expect(result.customerPhone).toBe('01711223344');
    expect(result.cardType).toBe('bKash');
  });

  it('queries /payment/status if /execute returns non-completed status', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '2005', statusMessage: 'Already executed' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Completed',
            amount: '500.00',
            trxID: 'TRX_STATUS_CHECK',
            paymentID: 'PAY_EXEC_CHECK',
          }),
          { status: 200 }
        )
      );

    const result = await adapter.verifyPayment({
      paymentId: 'PAY_EXEC_CHECK',
      amount: Paisa.fromBDT('500.00'),
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('TRX_STATUS_CHECK');
  });

  it('maps Pending, Cancelled, and Failed transactionStatus in verifyPayment', async () => {
    // Pending
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Pending',
            paymentID: 'BK_PENDING',
          }),
          { status: 200 }
        )
      );

    const resP = await adapter.verifyPayment({ paymentId: 'BK_PENDING' });
    expect(resP.status).toBe('PENDING');

    // Cancelled
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Cancelled',
            paymentID: 'BK_CANCELLED',
          }),
          { status: 200 }
        )
      );

    const resC = await adapter.verifyPayment({ paymentId: 'BK_CANCELLED' });
    expect(resC.status).toBe('CANCELLED');

    // Failed
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Failed',
            paymentID: 'BK_FAILED',
          }),
          { status: 200 }
        )
      );

    const resF = await adapter.verifyPayment({ paymentId: 'BK_FAILED' });
    expect(resF.status).toBe('FAILED');
  });

  it('throws GATEWAY_UNAVAILABLE when neither execute nor status returns transactionStatus or valid code', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '9999', statusMessage: 'Unknown error' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '9999', statusMessage: 'Unknown error' }), { status: 200 })
      );

    await expect(adapter.verifyPayment({ paymentId: 'BK_ERR_UNKNOWN' })).rejects.toMatchObject({
      code: 'GATEWAY_UNAVAILABLE',
      isRetryable: true,
      httpStatus: 502,
    });
  });

  it('handles untrusted cancel and failure callbacks', async () => {
    // Cancel override by completed status
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Completed',
            amount: '250.00',
            trxID: 'OVERRIDE_CANCEL_TRX',
            paymentID: 'BK_PAY_CANCEL',
          }),
          { status: 200 }
        )
      );

    const resultOverride = await adapter.verifyPayment({
      paymentId: 'pay_bkash_cancel',
      providerPaymentId: 'BK_PAY_CANCEL',
      rawCallbackParams: { status: 'cancel', paymentID: 'BK_PAY_CANCEL' },
    });
    expect(resultOverride.status).toBe('COMPLETED');
    expect(resultOverride.providerTrxId).toBe('OVERRIDE_CANCEL_TRX');

    // Cancel accepted
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Cancelled',
          }),
          { status: 200 }
        )
      );

    const resultCancel = await adapter.verifyPayment({
      paymentId: 'pay_bkash_cancel',
      providerPaymentId: 'BK_PAY_CANCEL',
      rawCallbackParams: { status: 'cancel', paymentID: 'BK_PAY_CANCEL' },
    });
    expect(resultCancel.status).toBe('CANCELLED');

    // Failure callback
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            transactionStatus: 'Failed',
          }),
          { status: 200 }
        )
      );

    const resultFailure = await adapter.verifyPayment({
      paymentId: 'pay_bkash_fail',
      providerPaymentId: 'BK_PAY_FAIL',
      rawCallbackParams: { status: 'failure', paymentID: 'BK_PAY_FAIL' },
    });
    expect(resultFailure.status).toBe('FAILED');
  });

  it('throws AMOUNT_MISMATCH if executed amount does not match expected amount', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            paymentID: 'BK_PAY_MISMATCH',
            trxID: 'TRX_MISMATCH',
            amount: '100.00',
            transactionStatus: 'Completed',
          }),
          { status: 200 }
        )
      );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_mismatch',
        providerPaymentId: 'BK_PAY_MISMATCH',
        amount: Paisa.fromBDT('500.00'),
      })
    ).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH',
    });
  });

  it('executes refund and checks refund bounds', async () => {
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_bkash_001',
        providerTrxId: '9K38AL90',
        providerPaymentId: 'BK_PAY_12345',
        refundAmount: Paisa.fromBDT('1500.00'),
        totalCapturedAmount: Paisa.fromBDT('1200.00'),
        refundReason: 'Excess refund test',
        refundId: 'ref_bk_01',
      })
    ).rejects.toThrow(/REFUND_EXCEEDS_AMOUNT/);

    // Upstream failure
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: '2001', statusMessage: 'Refund not allowed' }),
          { status: 200 }
        )
      );

    await expect(
      adapter.refundPayment({
        paymentId: 'pay_bkash_001',
        providerTrxId: '9K38AL90',
        providerPaymentId: 'BK_PAY_12345',
        refundAmount: Paisa.fromBDT('500.00'),
        totalCapturedAmount: Paisa.fromBDT('1200.00'),
        refundReason: 'Product return',
        refundId: 'ref_bk_01',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
    });

    // Upstream success
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: '0000',
          refundTrxID: 'REF_9K38AL90',
          transactionStatus: 'Completed',
        }),
        { status: 200 }
      )
    );

    const result = await adapter.refundPayment({
      paymentId: 'pay_bkash_001',
      providerTrxId: '9K38AL90',
      providerPaymentId: 'BK_PAY_12345',
      refundAmount: Paisa.fromBDT('500.00'),
      totalCapturedAmount: Paisa.fromBDT('1200.00'),
      refundReason: 'Product return',
      refundId: 'ref_bk_01',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.providerRefundId).toBe('REF_9K38AL90');
    expect(result.refundAmount.toBDT()).toBe('500.00');
  });

  it('verifies webhook signature using cryptographic HMAC', async () => {
    const payload = JSON.stringify({ paymentID: 'BK_WEBHOOK_001', amount: '100.00' });
    const validHmac = hmacSha256(payload, config.appSecret);

    // Valid HMAC header
    const valid = await adapter.verifyWebhookSignature(
      { 'x-bkash-signature': validHmac },
      payload
    );
    expect(valid).toBe(true);

    // Invalid HMAC header
    const invalid = await adapter.verifyWebhookSignature(
      { 'x-bkash-signature': 'wrong_hmac' },
      payload
    );
    expect(invalid).toBe(false);

    // Missing paymentID / trxID
    expect(await adapter.verifyWebhookSignature({}, {})).toBe(false);
  });

  it('verifies webhook signature using server fallback when HMAC header is missing', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            trxID: 'BK_WEBHOOK_001',
            transactionStatus: 'Completed',
            amount: '100.00',
          }),
          { status: 200 }
        )
      );

    const fallbackSuccess = await adapter.verifyWebhookSignature({}, { paymentID: 'BK_WEBHOOK_001' });
    expect(fallbackSuccess).toBe(true);
  });

  it('returns false in verifyWebhookSignature when fallback queryPayment throws or fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockRejectedValueOnce(new Error('Network error'));

    expect(await adapter.verifyWebhookSignature({}, { paymentID: 'BK_ERR_TRX' })).toBe(false);
  });

  it('handles URLSearchParams string in verifyWebhookSignature fallback', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            trxID: 'BK_URL_001',
            transactionStatus: 'Completed',
          }),
          { status: 200 }
        )
      );

    expect(await adapter.verifyWebhookSignature({}, 'paymentID=BK_URL_001&amount=100')).toBe(true);
  });

  it('queries payment details with queryPayment (completed vs failed)', async () => {
    // Completed
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            trxID: 'SEARCH_TRX_123',
            paymentID: 'BK_SEARCH_PAY',
            amount: '750.00',
            transactionStatus: 'Completed',
            customerMsisdn: '01700000000',
            paymentExecuteTime: '2026-09-13T10:00:00Z',
          }),
          { status: 200 }
        )
      );

    const res = await adapter.queryPayment('SEARCH_TRX_123');
    expect(res.status).toBe('COMPLETED');
    expect(res.amount.toBDT()).toBe('750.00');
    expect(res.providerTrxId).toBe('SEARCH_TRX_123');

    // Failed
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            trxID: 'SEARCH_TRX_FAIL',
            transactionStatus: 'Failed',
          }),
          { status: 200 }
        )
      );

    const resFail = await adapter.queryPayment('SEARCH_TRX_FAIL');
    expect(resFail.status).toBe('FAILED');
  });

  it('queries refund details with queryRefund (succeeded and pending)', async () => {
    // Succeeded
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_bk', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            refundTrxID: 'REF_SEARCH_123',
            trxID: 'ORIG_TRX_123',
            amount: '200.00',
            transactionStatus: 'Completed',
          }),
          { status: 200 }
        )
      );

    const res = await adapter.queryRefund('REF_SEARCH_123');
    expect(res.status).toBe('SUCCEEDED');
    expect(res.amount.toBDT()).toBe('200.00');
    expect(res.providerRefundId).toBe('REF_SEARCH_123');

    // Pending
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: '0000',
          refundTrxID: 'REF_SEARCH_PENDING',
          trxID: 'ORIG_TRX_PENDING',
          refundStatus: 'Pending',
        }),
        { status: 200 }
      )
    );

    const resPend = await adapter.queryRefund('REF_SEARCH_PENDING');
    expect(resPend.status).toBe('PENDING');
  });

  it('runs healthCheck returning UP or DOWN', async () => {
    // UP
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: '0000', id_token: 'tok_health', expires_in: 3600 }), { status: 200 })
    );
    const up = await adapter.healthCheck();
    expect(up.status).toBe('UP');

    // DOWN
    const downAdapter = new BkashAdapter(config);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection error'));
    const down = await downAdapter.healthCheck();
    expect(down.status).toBe('DOWN');
  });
});
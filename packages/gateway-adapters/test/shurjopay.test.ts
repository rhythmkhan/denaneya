import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { ShurjoPayAdapter } from '../src/adapters/shurjopay.js';
import { GatewayError } from '../src/errors.js';
import { hmacSha256 } from '../src/crypto/hash.js';

describe('ShurjoPayAdapter', () => {
  const config = {
    isSandbox: true,
    username: 'sp_user_1',
    password: 'sp_password_1',
    prefix: 'DN',
  };

  let adapter: ShurjoPayAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new ShurjoPayAdapter(config);
  });

  it('authenticates, caches token, and initiates secret-pay checkout', async () => {
    const tokenResponse = {
      token: 'jwt_mock_token_123',
      store_id: 101,
      sp_code: '1000',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const secretPayResponse = {
      checkout_url: 'https://sandbox.shurjopayment.com/pay/SP66a8...',
      sp_order_id: 'SP66a8c439b1a2',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(tokenResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secretPayResponse), { status: 200 }));

    const result = await adapter.initiatePayment({
      paymentId: 'pay_sp_001',
      merchantId: 'mer_sp',
      amount: Paisa.fromBDT('750.00'),
      currency: 'BDT',
      customer: {
        name: 'Kamal Hasan',
        email: 'kamal@example.com',
        phone: '01811223344',
      },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(result.provider).toBe('SHURJOPAY');
    expect(result.redirectUrl).toBe(secretPayResponse.checkout_url);
    expect(result.providerPaymentId).toBe(secretPayResponse.sp_order_id);

    // Second call should reuse cached token
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkout_url: 'https://sandbox.shurjopayment.com/pay/SP222',
          sp_order_id: 'SP222',
        }),
        { status: 200 }
      )
    );

    const secondResult = await adapter.initiatePayment({
      paymentId: 'pay_sp_002',
      merchantId: 'mer_sp',
      amount: Paisa.fromBDT('100.00'),
      currency: 'BDT',
      customer: { name: 'Customer 2', email: 'c2@example.com' },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(secondResult.providerPaymentId).toBe('SP222');
  });

  it('throws AUTHENTICATION_FAILED when token response fails or has sp_code !== 1000', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ sp_code: '1005', message: 'Auth failed' }), { status: 200 })
    );

    await expect(adapter.ensureToken()).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('throws INVALID_REQUEST when initiatePayment fails to return checkout_url', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Missing order_id' }), { status: 200 })
      );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_err',
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

  it('verifies payment with code 1000 as COMPLETED', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1000',
              sp_order_id: 'SP66a8c439b1a2',
              bank_trx_id: 'SP_BANK_TRX_99',
              amount: '750.00',
              currency: 'BDT',
              method: 'bkash',
              date_time: '2026-09-13 22:45:00',
            },
          ]),
          { status: 200 }
        )
      );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_sp_001',
      providerPaymentId: 'SP66a8c439b1a2',
      amount: Paisa.fromBDT('750.00'),
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('SP_BANK_TRX_99');
    expect(result.amount.toBDT()).toBe('750.00');
    expect(result.cardType).toBe('bkash');
  });

  it('throws AMOUNT_MISMATCH if verified amount differs from expected amount', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1000',
              sp_order_id: 'SP_MISMATCH',
              amount: '500.00',
            },
          ]),
          { status: 200 }
        )
      );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_mismatch',
        providerPaymentId: 'SP_MISMATCH',
        amount: Paisa.fromBDT('750.00'),
      })
    ).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH',
    });
  });

  it('throws TRANSACTION_NOT_FOUND when verification returns empty array', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_not_found',
        providerPaymentId: 'SP_EMPTY',
      })
    ).rejects.toMatchObject({
      code: 'TRANSACTION_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('maps non-1000 sp_code to CANCELLED or FAILED', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1002',
              sp_order_id: 'SP_CANCELLED_01',
              amount: '500.00',
            },
          ]),
          { status: 200 }
        )
      );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_sp_cancelled',
      providerPaymentId: 'SP_CANCELLED_01',
    });

    expect(result.status).toBe('CANCELLED');

    // 1001 -> PENDING
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            sp_code: '1001',
            sp_order_id: 'SP_PENDING_01',
            amount: '500.00',
          },
        ]),
        { status: 200 }
      )
    );
    const resP = await adapter.verifyPayment({ paymentId: 'pay_sp_p', providerPaymentId: 'SP_PENDING_01' });
    expect(resP.status).toBe('PENDING');

    // 1005 -> FAILED
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            sp_code: '1005',
            sp_order_id: 'SP_FAILED_01',
            amount: '500.00',
          },
        ]),
        { status: 200 }
      )
    );
    const resF = await adapter.verifyPayment({ paymentId: 'pay_sp_f', providerPaymentId: 'SP_FAILED_01' });
    expect(resF.status).toBe('FAILED');
  });

  it('throws INVALID_REQUEST when order_id is missing in verifyPayment', async () => {
    await expect(adapter.verifyPayment({})).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('rejects refund as not allowed in direct v2.1 API', async () => {
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_sp_ref',
        providerTrxId: 'SP_TRX_1',
        refundAmount: Paisa.fromBDT('600.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Refund test',
        refundId: 'ref_sp_1',
      })
    ).rejects.toThrow(/REFUND_EXCEEDS_AMOUNT/);

    await expect(
      adapter.refundPayment({
        paymentId: 'pay_sp_ref',
        providerTrxId: 'SP_TRX_1',
        refundAmount: Paisa.fromBDT('100.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Refund test',
        refundId: 'ref_sp_1',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
      httpStatus: 400,
    });
  });

  it('verifies webhook signature using cryptographic HMAC or server verification fallback', async () => {
    const payload = JSON.stringify({ order_id: 'SP_WEBHOOK_01', amount: '100.00' });
    const signature = hmacSha256(payload, config.password);

    // Valid HMAC header
    expect(
      await adapter.verifyWebhookSignature({ 'x-shurjopay-signature': signature }, payload)
    ).toBe(true);

    // Invalid HMAC header
    expect(
      await adapter.verifyWebhookSignature({ 'x-shurjopay-signature': 'bad_sig' }, payload)
    ).toBe(false);

    // Missing order_id
    expect(await adapter.verifyWebhookSignature({}, {})).toBe(false);

    // Fallback to server query
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1000',
              sp_order_id: 'SP_WEBHOOK_01',
              amount: '100.00',
            },
          ]),
          { status: 200 }
        )
      );

    expect(await adapter.verifyWebhookSignature({}, { order_id: 'SP_WEBHOOK_01' })).toBe(true);

    // Server verification throws -> returns false
    const freshAdapter = new ShurjoPayAdapter(config);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockRejectedValueOnce(new Error('Network failure'));
    expect(await freshAdapter.verifyWebhookSignature({}, { order_id: 'SP_FAIL' })).toBe(false);

    // URLSearchParams body string
    const freshAdapter2 = new ShurjoPayAdapter(config);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1000',
              sp_order_id: 'SP_URL_01',
              amount: '50.00',
            },
          ]),
          { status: 200 }
        )
      );
    expect(await freshAdapter2.verifyWebhookSignature({}, 'order_id=SP_URL_01&amount=50.00')).toBe(true);
  });

  it('uses production baseUrl when isSandbox is false', async () => {
    const liveAdapter = new ShurjoPayAdapter({ ...config, isSandbox: false });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'live_tok', store_id: 999, sp_code: '1000', expires_in: 3600 }),
        { status: 200 }
      )
    );
    await liveAdapter.ensureToken();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('https://engine.shurjopay.com/api'),
      expect.anything()
    );
  });

  it('queries payment details with queryPayment', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'tok_1', store_id: 101, sp_code: '1000', expires_in: 3600 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sp_code: '1000',
              sp_order_id: 'SP_QUERY_001',
              bank_trx_id: 'SP_QUERY_TRX',
              amount: '300.00',
              date_time: '2026-09-13T10:00:00Z',
            },
          ]),
          { status: 200 }
        )
      );

    const res = await adapter.queryPayment('SP_QUERY_001');
    expect(res.status).toBe('COMPLETED');
    expect(res.amount.toBDT()).toBe('300.00');
    expect(res.providerTrxId).toBe('SP_QUERY_TRX');
  });

  it('throws REFUND_NOT_ALLOWED on queryRefund', async () => {
    await expect(adapter.queryRefund('REF_123')).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
      httpStatus: 400,
      isRetryable: false,
    });
  });

  it('performs healthCheck returning UP or DOWN', async () => {
    // UP
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'tok_health', store_id: 101, sp_code: '1000', expires_in: 3600 }),
        { status: 200 }
      )
    );
    const up = await adapter.healthCheck();
    expect(up.status).toBe('UP');

    // DOWN
    const downAdapter = new ShurjoPayAdapter(config);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const down = await downAdapter.healthCheck();
    expect(down.status).toBe('DOWN');
  });
});
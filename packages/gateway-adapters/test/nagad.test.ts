import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { NagadAdapter } from '../src/adapters/nagad.js';
import { GatewayError } from '../src/errors.js';
import { rsaEncrypt, rsaDecrypt, rsaSign, rsaVerify } from '../src/crypto/rsa.js';

describe('NagadAdapter & RSA Cryptography Engine', () => {
  // Generate genuine test RSA-2048 keypairs for merchant and nagad
  const merchantKeys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const nagadKeys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const config = {
    isSandbox: true,
    merchantId: 'NAGAD_TEST_MERCHANT',
    merchantPrivateKey: merchantKeys.privateKey,
    nagadPublicKey: nagadKeys.publicKey,
  };

  let adapter: NagadAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new NagadAdapter(config);
  });

  it('performs genuine RSA encryption, decryption, signing, and verification', () => {
    const message = 'Hello Bangladesh Payment Ecosystem';

    // Encryption with Nagad public key & Decryption with Nagad private key
    const encrypted = rsaEncrypt(message, nagadKeys.publicKey);
    const decrypted = rsaDecrypt(encrypted, nagadKeys.privateKey);
    expect(decrypted).toBe(message);

    // Signing with merchant private key & Verification with merchant public key
    const signature = rsaSign(message, merchantKeys.privateKey);
    const isValid = rsaVerify(message, signature, merchantKeys.publicKey);
    expect(isValid).toBe(true);

    const isTampered = rsaVerify(message + ' tampered', signature, merchantKeys.publicKey);
    expect(isTampered).toBe(false);
  });

  it('initiates payment with 2-step encrypted sensitive payload and returns callback URL', async () => {
    // Step 1: Initialize response mock
    const initSensitive = JSON.stringify({
      paymentReferenceId: 'NAGAD_PAY_REF_99',
      challenge: 'chal_server_123',
    });
    const encInitSensitive = rsaEncrypt(initSensitive, merchantKeys.publicKey);

    const mockInitResponse = {
      sensitiveData: encInitSensitive,
      signature: rsaSign(initSensitive, nagadKeys.privateKey),
    };

    // Step 2: Complete response mock
    const mockCompleteResponse = {
      status: 'Success',
      callBackUrl: 'https://sandbox.mynagad.com/client-checkout?paymentRefId=NAGAD_PAY_REF_99',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockInitResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockCompleteResponse), { status: 200 }));

    const result = await adapter.initiatePayment({
      paymentId: 'pay_nagad_001',
      merchantId: 'mer_nagad',
      amount: Paisa.fromBDT('1500.00'),
      currency: 'BDT',
      customer: {
        name: 'Fatema Khatun',
        email: 'fatema@example.com',
        phone: '01812345678',
      },
      returnUrl: 'https://merchant.example/callback',
      cancelUrl: 'https://merchant.example/cancel',
      ipnUrl: 'https://api.example/ipn',
    });

    expect(result.provider).toBe('NAGAD');
    expect(result.redirectUrl).toBe(mockCompleteResponse.callBackUrl);
    expect(result.providerPaymentId).toBe('NAGAD_PAY_REF_99');
  });

  it('throws INVALID_REQUEST when initialize or complete step fails in initiatePayment', async () => {
    // Step 1 fails
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Init failed' }), { status: 200 })
    );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_err_1',
        merchantId: 'mer_1',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'C' },
        returnUrl: 'https://a.test/cb',
        cancelUrl: 'https://a.test/can',
        ipnUrl: 'https://a.test/ipn',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });

    // Step 2 fails
    const initSensitive = JSON.stringify({
      paymentReferenceId: 'NAGAD_PAY_REF_99',
    });
    const encInitSensitive = rsaEncrypt(initSensitive, merchantKeys.publicKey);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sensitiveData: encInitSensitive,
            signature: rsaSign(initSensitive, nagadKeys.privateKey),
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'Failed', message: 'Step 2 failed' }), { status: 200 })
      );

    await expect(
      adapter.initiatePayment({
        paymentId: 'pay_err_2',
        merchantId: 'mer_1',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'C' },
        returnUrl: 'https://a.test/cb',
        cancelUrl: 'https://a.test/can',
        ipnUrl: 'https://a.test/ipn',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('verifies payment through Nagad GET verify API', async () => {
    const mockVerifyResponse = {
      merchantId: 'NAGAD_TEST_MERCHANT',
      orderId: 'pay_nagad_002',
      paymentRefId: 'NAGAD_PAY_REF_100',
      amount: '1500.00',
      clientMobileNo: '01812345678',
      status: 'Success',
      statusCode: '000',
      issuerPaymentDateTime: '2026-09-13 23:05:00',
      issuerPaymentRefNo: 'NAGAD_TRX_9K38AL99',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockVerifyResponse), { status: 200 })
    );

    const result = await adapter.verifyPayment({
      paymentId: 'pay_nagad_002',
      providerPaymentId: 'NAGAD_PAY_REF_100',
      amount: Paisa.fromBDT('1500.00'),
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.providerTrxId).toBe('NAGAD_TRX_9K38AL99');
    expect(result.amount.toBDT()).toBe('1500.00');
    expect(result.customerPhone).toBe('01812345678');
    expect(result.cardType).toBe('Nagad');
  });

  it('handles missing payment reference id in verifyPayment', async () => {
    await expect(adapter.verifyPayment({})).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('throws AMOUNT_MISMATCH when verifyPayment returns mismatched amount', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'Success',
          statusCode: '000',
          amount: '800.00',
        }),
        { status: 200 }
      )
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_nagad_mismatch',
        providerPaymentId: 'REF_MISMATCH',
        amount: Paisa.fromBDT('1000.00'),
      })
    ).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH',
    });
  });

  it('maps non-Success status in verifyPayment to FAILED or CANCELLED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'Cancelled',
          statusCode: '001',
          amount: '100.00',
        }),
        { status: 200 }
      )
    );

    const res = await adapter.verifyPayment({
      paymentId: 'pay_cancel',
      providerPaymentId: 'REF_CANCEL',
    });
    expect(res.status).toBe('CANCELLED');

    // Unknown status -> FAILED
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'UnknownStatus',
          statusCode: '999',
        }),
        { status: 200 }
      )
    );

    const resFail = await adapter.verifyPayment({
      paymentId: 'pay_unknown',
      providerPaymentId: 'REF_UNKNOWN',
    });
    expect(resFail.status).toBe('FAILED');
    expect(resFail.amount.amountPaisa).toBe(0n);
  });

  it('throws REFUND_EXCEEDS_AMOUNT and REFUND_NOT_ALLOWED in refundPayment', async () => {
    await expect(
      adapter.refundPayment({
        paymentId: 'pay_1',
        providerTrxId: 'TRX_1',
        refundAmount: Paisa.fromBDT('600.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Refund',
        refundId: 'ref_1',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_EXCEEDS_AMOUNT',
    });

    await expect(
      adapter.refundPayment({
        paymentId: 'pay_1',
        providerTrxId: 'TRX_1',
        refundAmount: Paisa.fromBDT('200.00'),
        totalCapturedAmount: Paisa.fromBDT('500.00'),
        refundReason: 'Refund',
        refundId: 'ref_1',
      })
    ).rejects.toMatchObject({
      code: 'REFUND_NOT_ALLOWED',
    });
  });

  it('throws GATEWAY_UNAVAILABLE when verify response is missing status field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'Empty response' }), { status: 200 })
    );

    await expect(
      adapter.verifyPayment({
        paymentId: 'pay_missing_status',
        providerTrxId: 'trx_missing_status',
      })
    ).rejects.toMatchObject({
      code: 'GATEWAY_UNAVAILABLE',
      httpStatus: 502,
      isRetryable: true,
    });
  });

  it('uses production baseUrl when isSandbox is false', async () => {
    const liveAdapter = new NagadAdapter({ ...config, isSandbox: false });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Init failed' }), { status: 200 })
    );
    await expect(
      liveAdapter.initiatePayment({
        paymentId: 'pay_live_1',
        merchantId: 'mer_nagad',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'Customer' },
        returnUrl: 'https://return',
        cancelUrl: 'https://cancel',
        ipnUrl: 'https://ipn',
      })
    ).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('https://api.mynagad.com/api/dfs'),
      expect.anything()
    );
  });

  it('verifies webhook signature with Nagad public key', async () => {
    const body = JSON.stringify({ event: 'PAYMENT_CONFIRMED', paymentRefId: 'NAGAD_PAY_REF_100' });
    const signature = rsaSign(body, nagadKeys.privateKey);

    const isValid = await adapter.verifyWebhookSignature({ signature }, body);
    expect(isValid).toBe(true);

    const isInvalid = await adapter.verifyWebhookSignature({ signature: 'bad_sig' }, body);
    expect(isInvalid).toBe(false);

    expect(await adapter.verifyWebhookSignature({}, body)).toBe(false);
  });

  it('queries payment details with queryPayment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'Success',
          statusCode: '000',
          amount: '450.00',
          issuerPaymentRefNo: 'NAGAD_QUERY_TRX',
          clientMobileNo: '01712345678',
        }),
        { status: 200 }
      )
    );

    const res = await adapter.queryPayment('NAGAD_QUERY_TRX');
    expect(res.status).toBe('COMPLETED');
    expect(res.amount.toBDT()).toBe('450.00');
    expect(res.providerTrxId).toBe('NAGAD_QUERY_TRX');
  });

  it('throws REFUND_NOT_ALLOWED on queryRefund', async () => {
    await expect(adapter.queryRefund('REF_NAGAD_1')).rejects.toMatchObject({
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
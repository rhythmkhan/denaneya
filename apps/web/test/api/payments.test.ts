import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createPaymentSchema, Paisa } from '@denaneya/payment-core';
import { FraudEvaluator } from '@denaneya/fraud-engine';
import { calculatePlatformFee } from '../../src/lib/api/fees';
import * as authModule from '../../src/lib/api/auth';
import { POST as paymentPost, GET as paymentGet } from '../../src/app/api/v1/payments/route';
import { PUT as invoicePut, DELETE as invoiceDelete } from '../../src/app/api/v1/invoices/[id]/route';

describe('Payment Engine & Paisa Precision Arithmetic', () => {
  it('validates payment creation schema with strict types', () => {
    const validPayload = {
      merchantId: 'mch_test_123',
      amountPaisa: 150000n, // 1,500.00 BDT
      currency: 'BDT',
      provider: 'BKASH',
      customer: {
        name: 'Rahim Uddin',
        phone: '+8801712345678',
        email: 'rahim@example.com',
      },
      metadata: { orderId: 'ord_123' },
    };

    const parsed = createPaymentSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid currencies and malformed customer phone numbers', () => {
    const invalidCurrencyPayload = {
      amountPaisa: 150000n,
      currency: 'USD', // Not BDT
      provider: 'BKASH',
      customer: { phone: '+8801712345678' },
    };

    const parsedCurrency = createPaymentSchema.safeParse(invalidCurrencyPayload);
    expect(parsedCurrency.success).toBe(false);

    const invalidPhonePayload = {
      amountPaisa: 150000n,
      currency: 'BDT',
      provider: 'BKASH',
      customer: { phone: 'invalid-phone-format' },
    };

    const parsedPhone = createPaymentSchema.safeParse(invalidPhonePayload);
    expect(parsedPhone.success).toBe(false);
  });

  it('computes transaction fees accurately with zero floating point representation via calculatePlatformFee', () => {
    // 1. Standard merchant: 1.50% MDR (150 bps) + 5.00 BDT fixed fee (500 paisa) on 1,000.00 BDT (100000 paisa)
    const standardResult = calculatePlatformFee({
      amountPaisa: 100000n,
      feeRateBps: 150,
      fixedFeePaisa: 500n,
    });

    expect(standardResult.amountPaisa).toBe(100000n);
    expect(standardResult.feeRateBps).toBe(150n);
    expect(standardResult.percentageFeePaisa).toBe(1500n); // 15.00 BDT
    expect(standardResult.fixedFeePaisa).toBe(500n);       // 5.00 BDT
    expect(standardResult.totalFeePaisa).toBe(2000n);      // 20.00 BDT
    expect(standardResult.netSettlementPaisa).toBe(98000n); // 980.00 BDT
    expect(standardResult.netSettlementPaisa + standardResult.totalFeePaisa).toBe(standardResult.amountPaisa);

    // 2. Zero-fixed-fee scenario (micro-merchant / flat MDR 1.85%)
    const microResult = calculatePlatformFee({
      amountPaisa: 50000n, // 500.00 BDT
      feeRateBps: 185,     // 1.85% (185 bps)
      fixedFeePaisa: 0n,
    });
    expect(microResult.percentageFeePaisa).toBe(925n); // (50000 * 185) / 10000 = 925 paisa = 9.25 BDT
    expect(microResult.totalFeePaisa).toBe(925n);
    expect(microResult.netSettlementPaisa).toBe(49075n); // 490.75 BDT
    expect(microResult.netSettlementPaisa + microResult.totalFeePaisa).toBe(50000n);

    // 3. Custom enterprise MDR (0.75% = 75 bps, 10 BDT fixed fee = 1000 paisa)
    const enterpriseResult = calculatePlatformFee({
      amountPaisa: 2500000n, // 25,000.00 BDT
      feeRateBps: 75,
      fixedFeePaisa: 1000n,
    });
    expect(enterpriseResult.percentageFeePaisa).toBe(18750n); // 187.50 BDT
    expect(enterpriseResult.totalFeePaisa).toBe(19750n);      // 197.50 BDT
    expect(enterpriseResult.netSettlementPaisa).toBe(2480250n); // 24,802.50 BDT

    const paisaAmount = new Paisa(standardResult.amountPaisa);
    expect(paisaAmount.toBDT()).toBe('1000.00');
  });

  it('evaluates fraud scoring decision bands using FraudEvaluator', async () => {
    // Test decision classification bands
    expect(FraudEvaluator.classifyScore(25)).toEqual({
      classification: 'LOW',
      action: 'ALLOW',
    });
    expect(FraudEvaluator.classifyScore(59)).toEqual({
      classification: 'MEDIUM',
      action: 'CHALLENGE',
    });
    expect(FraudEvaluator.classifyScore(75)).toEqual({
      classification: 'HIGH',
      action: 'UNDER_REVIEW',
    });
    expect(FraudEvaluator.classifyScore(90)).toEqual({
      classification: 'CRITICAL',
      action: 'BLOCK',
    });

    // Test real evaluator instance evaluation
    const evaluator = new FraudEvaluator();
    const result = await evaluator.evaluate({
      payment: {
        id: 'pay_fraud_test_1',
        merchantId: 'mch_test',
        amountPaisa: 50000n,
        currency: 'BDT',
        provider: 'BKASH',
        customerPhone: '+8801712345678',
        customerIp: '203.112.200.1',
        metadata: { deviceFingerprint: 'fp_test_device' },
        createdAt: new Date(),
      },
      merchantHistory: {
        isDormant: false,
        recentTxCount1h: 5,
      },
    });

    expect(result).toBeDefined();
    expect(typeof result.riskScore).toBe('number');
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.classification);
    expect(['ALLOW', 'CHALLENGE', 'UNDER_REVIEW', 'BLOCK']).toContain(result.actionTaken);
  });

  it('rejects unauthenticated payment POST and GET requests with HTTP 401', async () => {
    const unauthPost = new NextRequest('http://localhost/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({ amountPaisa: 50000 }),
    });
    const postRes = await paymentPost(unauthPost);
    expect(postRes.status).toBe(401);
    const postBody = await postRes.json();
    expect(postBody.error.code).toBe('UNAUTHORIZED');

    const unauthGet = new NextRequest('http://localhost/api/v1/payments');
    const getRes = await paymentGet(unauthGet);
    expect(getRes.status).toBe(401);
    const getBody = await getRes.json();
    expect(getBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unauthenticated invoice PUT and DELETE requests with HTTP 401', async () => {
    const params = Promise.resolve({ id: 'inv_test_123' });
    const unauthPut = new NextRequest('http://localhost/api/v1/invoices/inv_test_123', {
      method: 'PUT',
      body: JSON.stringify({ status: 'SENT' }),
    });
    const putRes = await invoicePut(unauthPut, { params });
    expect(putRes.status).toBe(401);

    const unauthDelete = new NextRequest('http://localhost/api/v1/invoices/inv_test_123', {
      method: 'DELETE',
    });
    const deleteRes = await invoiceDelete(unauthDelete, { params });
    expect(deleteRes.status).toBe(401);
  });

  it('invoice PUT rejects invalid status or returns 404 for non-existent invoice', async () => {
    const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue({
      merchant: {
        id: 'mch_test',
        name: 'Test Merchant',
        businessName: 'Test Merchant Ltd',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
        fixedFeePaisa: 0n,
        defaultCurrency: 'BDT',
      },
      apiKey: {
        id: 'key_test_inv',
        name: 'Test Key Invoices',
        keyPrefix: 'dn_test_sec_',
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['invoices:write'],
      },
      requestId: 'req_inv_test',
    });

    try {
      const params = Promise.resolve({ id: 'inv_non_existent' });

      // Validation error for invalid status
      const invalidReq = new NextRequest('http://localhost/api/v1/invoices/inv_non_existent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVALID_STATUS' }),
      });
      const invalidRes = await invoicePut(invalidReq, { params });
      expect(invalidRes.status).toBe(422);

      // 404 when invoice doesn't exist
      const validReq = new NextRequest('http://localhost/api/v1/invoices/inv_non_existent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT', notes: 'Updated notes' }),
      });
      const res = await invoicePut(validReq, { params });
      expect(res.status).toBe(404);

      // DELETE 404 when invoice doesn't exist
      const delReq = new NextRequest('http://localhost/api/v1/invoices/inv_non_existent', {
        method: 'DELETE',
      });
      const delRes = await invoiceDelete(delReq, { params });
      expect(delRes.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
});

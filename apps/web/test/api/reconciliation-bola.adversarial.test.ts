import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as authModule from '../../src/lib/api/auth';
import * as rateLimitModule from '../../src/lib/api/rate-limit';
import * as reconPkg from '@denaneya/reconciliation';
import { POST } from '../../src/app/api/v1/reconciliation/run/route';

describe('Adversarial BOLA / IDOR Verification: POST /api/v1/reconciliation/run', () => {
  const merchantAlpha = {
    id: 'mch_merchant_alpha',
    name: 'Merchant Alpha Ltd',
    businessName: 'Alpha Corporation',
    status: 'ACTIVE' as const,
    environment: 'SANDBOX' as const,
    feeRateBps: 150,
    fixedFeePaisa: 0n,
    defaultCurrency: 'BDT' as const,
  };

  const apiKeyAlpha = {
    id: 'key_alpha_sec',
    name: 'Alpha Secret Key',
    keyPrefix: 'dn_test_sec_',
    type: 'SECRET' as const,
    environment: 'SANDBOX' as const,
    scopes: ['reconciliation:write'],
  };

  // Mock rate limiter
  vi.spyOn(rateLimitModule, 'checkRateLimit').mockResolvedValue({
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '99',
    'X-RateLimit-Reset': '1700000000',
  });

  // Spy on runReconciliation
  let interceptedReconOpts: any = null;
  vi.spyOn(reconPkg, 'runReconciliation').mockImplementation(async (opts: any) => {
    interceptedReconOpts = opts;
    return {
      runId: 'rec_test_run_123',
      batchId: opts.batchId ?? 'stl_test_123',
      status: 'MATCHED' as const,
      startDate: opts.startDate,
      endDate: opts.endDate,
      summary: {
        totalRecordsEvaluated: 1,
        matchedCount: 1,
        discrepancyCount: 0,
        autoHealedCount: 0,
        totalInternalAmountPaisa: 10000n,
        totalProviderAmountPaisa: 10000n,
        totalLedgerAmountPaisa: 10000n,
        netDiscrepancyAmountPaisa: 0n,
        breakdownByType: {
          MATCHED: 1,
          AMOUNT_MISMATCH: 0,
          STATUS_MISMATCH: 0,
          MISSING_IN_LEDGER: 0,
          MISSING_IN_GATEWAY: 0,
          UNEXPECTED_GATEWAY_TX: 0,
          FEE_DISCREPANCY: 0,
        },
      },
      discrepancies: [],
      completedAt: new Date(),
    };
  });

  const setupAuth = () => {
    return vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue({
      merchant: merchantAlpha,
      apiKey: apiKeyAlpha,
      requestId: 'req_bola_adversarial_test',
    });
  };

  it('strictly blocks cross-tenant BOLA attack when merchantId does not match caller tenant (HTTP 403)', async () => {
    const authSpy = setupAuth();
    try {
      const adversarialTargets = [
        'mch_victim_beta',
        'mch_target_gamma',
        'mch_platform_root',
        'admin',
        'mch_merchant_alpha ', // trailing space
        ' mch_merchant_alpha', // leading space
        'MCH_MERCHANT_ALPHA', // case alteration
        'mch_merchant_alpha\0', // null-byte injection
        '../mch_merchant_alpha', // directory traversal
        "' OR '1'='1", // SQL injection string
        'mch_merchant_beta; DROP TABLE merchants;--',
        '*', // wildcard
      ];

      for (const targetId of adversarialTargets) {
        interceptedReconOpts = null;
        const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: targetId,
            provider: 'BKASH',
          }),
        });

        const res = await POST(req);
        expect(res.status).toBe(403);

        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('FORBIDDEN');
        expect(body.error.message).toBe('Cannot execute reconciliation for another merchant');

        // Verify underlying engine was NEVER called with the foreign merchant ID
        expect(interceptedReconOpts).toBeNull();
      }
    } finally {
      authSpy.mockRestore();
    }
  });

  it('permits reconciliation when merchantId explicitly matches authenticated tenant (HTTP 200)', async () => {
    const authSpy = setupAuth();
    try {
      interceptedReconOpts = null;
      const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'mch_merchant_alpha',
          provider: 'BKASH',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.runId).toBe('rec_test_run_123');

      // Verify the target merchant passed to reconciler was strictly the caller
      expect(interceptedReconOpts).not.toBeNull();
      expect(interceptedReconOpts.merchantId).toBe('mch_merchant_alpha');
    } finally {
      authSpy.mockRestore();
    }
  });

  it('defaults targetMerchantId to authenticated tenant when merchantId is omitted from request (HTTP 200)', async () => {
    const authSpy = setupAuth();
    try {
      interceptedReconOpts = null;
      const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'SSLCOMMERZ',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(interceptedReconOpts.merchantId).toBe('mch_merchant_alpha');
    } finally {
      authSpy.mockRestore();
    }
  });

  it('defaults targetMerchantId to authenticated tenant when merchantId is empty string (HTTP 200)', async () => {
    const authSpy = setupAuth();
    try {
      interceptedReconOpts = null;
      const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: '',
          provider: 'NAGAD',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(interceptedReconOpts.merchantId).toBe('mch_merchant_alpha');
    } finally {
      authSpy.mockRestore();
    }
  });

  it('rejects unauthenticated requests before checking merchantId (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: 'mch_victim_beta',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects API keys lacking reconciliation:write scope before checking merchantId (HTTP 403)', async () => {
    const authSpy = vi.spyOn(authModule, 'authenticateApiKey').mockImplementation(async () => {
      const { ApiError } = await import('../../src/lib/api/errors');
      throw new ApiError('FORBIDDEN', "Missing required scope 'reconciliation:write'", 403);
    });

    try {
      const req = new NextRequest('http://localhost/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'mch_merchant_alpha',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain("Missing required scope 'reconciliation:write'");
    } finally {
      authSpy.mockRestore();
    }
  });
});

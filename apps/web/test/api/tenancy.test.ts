import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assertTenantAccess, TenantMismatchError, type UserAuthContext } from '@denaneya/security';
import * as authModule from '../../src/lib/api/auth';
import { authenticateApiKey } from '../../src/lib/api/auth';
import { POST as runReconciliationPost } from '../../src/app/api/v1/reconciliation/run/route';

describe('Multi-Tenant Isolation & Access Control', () => {
  const merchantA: UserAuthContext = {
    userId: 'usr_merchant_a',
    tenantId: 'mch_merchant_alpha',
    role: 'MERCHANT_ADMIN',
    isPlatformStaff: false,
  };

  const merchantB: UserAuthContext = {
    userId: 'usr_merchant_b',
    tenantId: 'mch_merchant_beta',
    role: 'MERCHANT_ADMIN',
    isPlatformStaff: false,
  };

  const platformAdmin: UserAuthContext = {
    userId: 'usr_super_admin',
    tenantId: '',
    role: 'PLATFORM_ADMIN',
    isPlatformStaff: true,
  };

  it('allows merchant to access their own resources', () => {
    expect(() => {
      assertTenantAccess(merchantA, 'mch_merchant_alpha');
      assertTenantAccess(merchantB, 'mch_merchant_beta');
    }).not.toThrow();
  });

  it('blocks merchant from accessing another merchant resources with TenantMismatchError', () => {
    expect(() => {
      assertTenantAccess(merchantA, 'mch_merchant_beta');
    }).toThrow(TenantMismatchError);
    expect(() => {
      assertTenantAccess(merchantB, 'mch_merchant_alpha');
    }).toThrow(TenantMismatchError);
  });

  it('allows platform staff with isPlatformStaff: true to perform cross-tenant operations', () => {
    expect(() => {
      assertTenantAccess(platformAdmin, 'mch_merchant_alpha');
      assertTenantAccess(platformAdmin, 'mch_merchant_beta');
    }).not.toThrow();
  });

  it('enforces multi-tenant authorization boundaries on API key authentication', async () => {
    // Missing Authorization header
    const noAuthReq = new NextRequest('http://localhost/api/v1/payments');
    await expect(authenticateApiKey(noAuthReq)).rejects.toThrow('Missing or invalid Authorization header');

    // Malformed API key format
    const malformedReq = new NextRequest('http://localhost/api/v1/payments', {
      headers: { authorization: 'Bearer invalid_key_format_123' },
    });
    await expect(authenticateApiKey(malformedReq)).rejects.toThrow('Malformed API key format');

    // Tenant boundary assertion for authenticated context
    const simulatedApiKeyContextA: UserAuthContext = {
      userId: 'key_simulated_a',
      tenantId: 'mch_merchant_alpha',
      role: 'MERCHANT_ADMIN',
      isPlatformStaff: false,
    };

    // Accessing Merchant Alpha's payment succeeds
    expect(() => assertTenantAccess(simulatedApiKeyContextA, 'mch_merchant_alpha')).not.toThrow();

    // Accessing Merchant Beta's payment throws TenantMismatchError
    expect(() => assertTenantAccess(simulatedApiKeyContextA, 'mch_merchant_beta')).toThrow(TenantMismatchError);
  });

  it('strictly blocks cross-tenant reconciliation execution (BOLA defense on POST /api/v1/reconciliation/run)', async () => {
    const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue({
      merchant: {
        id: 'mch_merchant_alpha',
        name: 'Merchant Alpha',
        businessName: 'Merchant Alpha Ltd',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
        fixedFeePaisa: 0n,
        defaultCurrency: 'BDT',
      },
      apiKey: {
        id: 'key_test_alpha',
        name: 'Test Key Alpha',
        keyPrefix: 'dn_test_sec_',
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['*'],
      },
      requestId: 'req_bola_test',
    });

    try {
      const crossTenantReq = new NextRequest('http://localhost/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'mch_merchant_beta', // Attempt to reconcile foreign merchant
        }),
      });

      const res = await runReconciliationPost(crossTenantReq);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('Cannot execute reconciliation for another merchant');
    } finally {
      spy.mockRestore();
    }
  });
});

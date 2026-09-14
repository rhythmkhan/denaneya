import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as authModule from '../../src/lib/api/auth';
import { GET as devicesGet } from '../../src/app/api/v1/devices/route';
import {
  PUT as invoicePut,
  DELETE as invoiceDelete,
} from '../../src/app/api/v1/invoices/[id]/route';
import {
  PUT as webhookPut,
} from '../../src/app/api/v1/webhooks/[id]/route';

// Global state for mocked db operations
let mockInvoicesDb: any[] = [];
let mockWebhooksDb: any[] = [];
let mockDevicesDb: any[] = [];

vi.mock('@/lib/db', () => {
  const getQueryResult = () => {
    if (mockInvoicesDb.length > 0) return mockInvoicesDb;
    if (mockWebhooksDb.length > 0) return mockWebhooksDb;
    return mockDevicesDb;
  };

  return {
    db: {
      select: () => ({
        from: (_table: any) => ({
          where: (_clause: any) => {
            const res = getQueryResult();
            return {
              orderBy: (_order: any) => Promise.resolve(res),
              then: (resolve: any, reject: any) => Promise.resolve(res).then(resolve, reject),
            };
          },
          orderBy: (_order: any) => Promise.resolve(getQueryResult()),
          then: (resolve: any, reject: any) => Promise.resolve(getQueryResult()).then(resolve, reject),
        }),
      }),
      update: () => ({
        set: (updates: any) => ({
          where: () => ({
            returning: () => {
              if (mockInvoicesDb.length > 0) {
                const updated = { ...mockInvoicesDb[0], ...updates };
                return Promise.resolve([updated]);
              }
              if (mockWebhooksDb.length > 0) {
                const updated = { ...mockWebhooksDb[0], ...updates };
                return Promise.resolve([updated]);
              }
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    },
    getDb: () => null,
  };
});

describe('Adversarial Challenge: Milestone 6 Route Parity & Security', () => {
  const mockMerchant = {
    id: 'mch_adversary_test',
    name: 'Adversary Test Merchant',
    businessName: 'Adversary Test Ltd',
    status: 'ACTIVE' as const,
    environment: 'SANDBOX' as const,
    feeRateBps: 150,
    fixedFeePaisa: 0n,
    defaultCurrency: 'BDT',
  };

  const createAuthContext = (scopes: string[]) => ({
    merchant: mockMerchant,
    apiKey: {
      id: 'key_adv_test',
      name: 'Adversary Test Key',
      keyPrefix: 'dn_test_sec_',
      type: 'SECRET' as const,
      environment: 'SANDBOX' as const,
      scopes,
    },
    requestId: 'req_adv_' + Math.random().toString(36).substring(7),
  });

  beforeEach(() => {
    mockInvoicesDb = [];
    mockWebhooksDb = [];
    mockDevicesDb = [];
  });

  describe('1. Route Parity: GET /api/v1/devices', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost/api/v1/devices');
      const res = await devicesGet(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests with missing devices:read scope with 403 FORBIDDEN', async () => {
      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockImplementation(async (_req, requiredScope) => {
        if (requiredScope === 'devices:read') {
          const { ApiError } = await import('../../src/lib/api/errors');
          throw new ApiError('FORBIDDEN', "Missing required scope 'devices:read'", 403);
        }
        return createAuthContext([]);
      });

      try {
        const req = new NextRequest('http://localhost/api/v1/devices', {
          headers: { authorization: 'Bearer invalid_scope_token' },
        });
        const res = await devicesGet(req);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error?.code).toBe('FORBIDDEN');
      } finally {
        spy.mockRestore();
      }
    });

    it('returns 200 and device records for authenticated merchant with devices:read', async () => {
      mockDevicesDb = [
        {
          id: 'cdev_1',
          deviceId: 'and_device_001',
          merchantId: mockMerchant.id,
          deviceName: 'Pixel 7 SMS Collector',
          model: 'Pixel 7',
          osVersion: 'Android 14',
          appVersion: '1.0.0',
          batteryLevel: 95,
          isCharging: true,
          networkType: 'WIFI',
          status: 'ONLINE',
          lastHeartbeatAt: new Date('2026-09-14T00:00:00.000Z'),
          createdAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      ];

      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['devices:read'])
      );

      try {
        const req = new NextRequest('http://localhost/api/v1/devices', {
          headers: { authorization: 'Bearer valid_key' },
        });
        const res = await devicesGet(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toBeDefined();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBe(1);
        expect(body.data[0].deviceName).toBe('Pixel 7 SMS Collector');
        expect(body.data[0].status).toBe('ONLINE');
        expect(res.headers.get('x-request-id')).toBeDefined();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('2. Route Parity & State Integrity: PUT & DELETE /api/v1/invoices/[id]', () => {
    it('rejects unauthenticated PUT and DELETE requests with 401', async () => {
      const params = Promise.resolve({ id: 'inv_123' });
      const putReq = new NextRequest('http://localhost/api/v1/invoices/inv_123', {
        method: 'PUT',
        body: JSON.stringify({ notes: 'test note' }),
      });
      const putRes = await invoicePut(putReq, { params });
      expect(putRes.status).toBe(401);

      const delReq = new NextRequest('http://localhost/api/v1/invoices/inv_123', {
        method: 'DELETE',
      });
      const delRes = await invoiceDelete(delReq, { params });
      expect(delRes.status).toBe(401);
    });

    it('rejects invalid body schema on PUT with 422 VALIDATION_ERROR', async () => {
      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_123' });
        const req = new NextRequest('http://localhost/api/v1/invoices/inv_123', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'NOT_A_VALID_STATUS' }),
        });
        const res = await invoicePut(req, { params });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error?.code).toBe('VALIDATION_ERROR');
      } finally {
        spy.mockRestore();
      }
    });

    it('returns 404 when invoice does not exist or belongs to another merchant', async () => {
      mockInvoicesDb = [];
      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_other_merchant' });
        const putReq = new NextRequest('http://localhost/api/v1/invoices/inv_other_merchant', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: 'unauthorized update' }),
        });
        const putRes = await invoicePut(putReq, { params });
        expect(putRes.status).toBe(404);

        const delReq = new NextRequest('http://localhost/api/v1/invoices/inv_other_merchant', {
          method: 'DELETE',
        });
        const delRes = await invoiceDelete(delReq, { params });
        expect(delRes.status).toBe(404);
      } finally {
        spy.mockRestore();
      }
    });

    it('financial state guard: strictly rejects modifying or voiding PAID invoices with 400', async () => {
      mockInvoicesDb = [
        {
          id: 'inv_paid_999',
          merchantId: mockMerchant.id,
          invoiceNumber: 'INV-2026-PAID',
          customerName: 'Paid Customer',
          status: 'PAID',
          subtotalPaisa: 50000n,
          taxPaisa: 0n,
          discountPaisa: 0n,
          totalAmountPaisa: 50000n,
          currency: 'BDT',
          dueDate: new Date(),
          createdAt: new Date(),
        },
      ];

      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_paid_999' });

        const putReq = new NextRequest('http://localhost/api/v1/invoices/inv_paid_999', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: 'Attempting to change paid invoice notes' }),
        });
        const putRes = await invoicePut(putReq, { params });
        expect(putRes.status).toBe(400);
        const putBody = await putRes.json();
        expect(putBody.error?.message).toBe('Cannot modify a paid invoice.');

        const delReq = new NextRequest('http://localhost/api/v1/invoices/inv_paid_999', {
          method: 'DELETE',
        });
        const delRes = await invoiceDelete(delReq, { params });
        expect(delRes.status).toBe(400);
        const delBody = await delRes.json();
        expect(delBody.error?.message).toBe('Cannot void a paid invoice.');
      } finally {
        spy.mockRestore();
      }
    });

    it('financial state guard: rejects modifying already VOID invoices with 400', async () => {
      mockInvoicesDb = [
        {
          id: 'inv_void_999',
          merchantId: mockMerchant.id,
          invoiceNumber: 'INV-2026-VOID',
          customerName: 'Void Customer',
          status: 'VOID',
          subtotalPaisa: 50000n,
          taxPaisa: 0n,
          discountPaisa: 0n,
          totalAmountPaisa: 50000n,
          currency: 'BDT',
          dueDate: new Date(),
          createdAt: new Date(),
        },
      ];

      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_void_999' });
        const putReq = new NextRequest('http://localhost/api/v1/invoices/inv_void_999', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'SENT' }),
        });
        const putRes = await invoicePut(putReq, { params });
        expect(putRes.status).toBe(400);
        const putBody = await putRes.json();
        expect(putBody.error?.message).toBe('Cannot modify a voided invoice.');
      } finally {
        spy.mockRestore();
      }
    });

    it('successfully updates a DRAFT invoice with valid fields', async () => {
      mockInvoicesDb = [
        {
          id: 'inv_draft_123',
          merchantId: mockMerchant.id,
          invoiceNumber: 'INV-2026-0042',
          customerName: 'Valid Customer',
          status: 'DRAFT',
          subtotalPaisa: 75000n,
          taxPaisa: 0n,
          discountPaisa: 0n,
          totalAmountPaisa: 75000n,
          currency: 'BDT',
          dueDate: new Date('2026-10-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ];

      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_draft_123' });
        const putReq = new NextRequest('http://localhost/api/v1/invoices/inv_draft_123', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'SENT', notes: 'Updated invoice notes' }),
        });
        const putRes = await invoicePut(putReq, { params });
        expect(putRes.status).toBe(200);
        const putBody = await putRes.json();
        expect(putBody.status).toBe('SENT');
        expect(putBody.id).toBe('inv_draft_123');
      } finally {
        spy.mockRestore();
      }
    });

    it('successfully voids an unpaid invoice via DELETE', async () => {
      mockInvoicesDb = [
        {
          id: 'inv_draft_del',
          merchantId: mockMerchant.id,
          invoiceNumber: 'INV-2026-0043',
          status: 'DRAFT',
          dueDate: new Date(),
          createdAt: new Date(),
        },
      ];

      const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['invoices:write'])
      );

      try {
        const params = Promise.resolve({ id: 'inv_draft_del' });
        const delReq = new NextRequest('http://localhost/api/v1/invoices/inv_draft_del', {
          method: 'DELETE',
        });
        const delRes = await invoiceDelete(delReq, { params });
        expect(delRes.status).toBe(200);
        const delBody = await delRes.json();
        expect(delBody.success).toBe(true);
        expect(delBody.message).toContain('marked as VOID');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('3. Adversarial SSRF Validation on PUT /api/v1/webhooks/[id]', () => {
    let authSpy: any;

    beforeEach(() => {
      mockWebhooksDb = [
        {
          id: 'wh_adv_victim_1',
          merchantId: mockMerchant.id,
          url: 'https://webhook.site/initial-valid',
          events: ['payment.completed'],
          status: 'ACTIVE',
          failureCount: 0,
          lastDeliveryAt: null,
          createdAt: new Date(),
        },
      ];
      authSpy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue(
        createAuthContext(['webhooks:write'])
      );
    });

    afterEach(() => {
      authSpy.mockRestore();
    });

    const adversarialVectors = [
      { name: 'Direct IPv4 loopback (127.0.0.1)', url: 'http://127.0.0.1/hook' },
      { name: 'Direct IPv4 loopback alternate (127.0.0.2)', url: 'http://127.0.0.2/hook' },
      { name: 'Localhost alias with port (localhost:8080)', url: 'http://localhost:8080/hook' },
      { name: 'AWS IMDS IPv4 Link-Local (169.254.169.254)', url: 'http://169.254.169.254/latest/meta-data' },
      { name: 'Alibaba/GCP Metadata IP (100.100.100.200)', url: 'http://100.100.100.200/latest/meta-data' },
      { name: 'RFC 1918 Class A private IP (10.0.0.1)', url: 'https://10.0.0.1/hook' },
      { name: 'RFC 1918 Class B private IP (172.16.0.1)', url: 'https://172.16.0.1/hook' },
      { name: 'RFC 1918 Class C private IP (192.168.1.1)', url: 'https://192.168.1.1/hook' },
      { name: 'Direct IPv6 loopback ([::1])', url: 'https://[::1]/hook' },
      { name: 'Direct IPv6 IPv4-mapped loopback ([::ffff:127.0.0.1])', url: 'https://[::ffff:127.0.0.1]/hook' },
      { name: 'Direct IPv6 IPv4-mapped AWS metadata ([::ffff:a9fe:a9fe])', url: 'https://[::ffff:a9fe:a9fe]/hook' },
      { name: 'IPv6 Unique Local Address ([fd00::1])', url: 'https://[fd00::1]/hook' },
      { name: 'IPv6 Link-Local Address ([fe80::1])', url: 'https://[fe80::1]/hook' },
      { name: 'Decimal encoded IP (http://2130706433/hook)', url: 'http://2130706433/hook' },
      { name: 'DNS Rebinding wildcard (https://127.0.0.1.nip.io/hook)', url: 'https://127.0.0.1.nip.io/hook' },
    ];

    for (const vector of adversarialVectors) {
      it(`blocks SSRF attack vector: ${vector.name}`, async () => {
        const params = Promise.resolve({ id: 'wh_adv_victim_1' });
        const req = new NextRequest('http://localhost/api/v1/webhooks/wh_adv_victim_1', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: vector.url }),
        });

        const res = await webhookPut(req, { params });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error?.code).toBe('SSRF_VALIDATION_FAILED');
        expect(body.error?.message).toContain('Webhook URL validation failed');
      });
    }

    it('enforces HTTPS in production mode and blocks plain HTTP URLs', async () => {
      const prevEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';

      try {
        const params = Promise.resolve({ id: 'wh_adv_victim_1' });
        const req = new NextRequest('http://localhost/api/v1/webhooks/wh_adv_victim_1', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: 'http://example.com/webhook' }),
        });

        const res = await webhookPut(req, { params });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error?.code).toBe('SSRF_VALIDATION_FAILED');
        expect(body.error?.message).toContain('Protocol');
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
      }
    });

    it('permits genuine public HTTPS webhooks with legitimate domain and port', async () => {
      const params = Promise.resolve({ id: 'wh_adv_victim_1' });
      const req = new NextRequest('http://localhost/api/v1/webhooks/wh_adv_victim_1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://dns.google/webhook',
          events: ['payment.completed', 'refund.created'],
        }),
      });

      const res = await webhookPut(req, { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('wh_adv_victim_1');
    });
  });
});

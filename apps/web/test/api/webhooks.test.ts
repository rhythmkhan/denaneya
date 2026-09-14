import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateUrlForSsrf } from '@denaneya/security';
import { signWebhookPayload, verifyWebhookSignature } from '@denaneya/webhooks';
import * as authModule from '../../src/lib/api/auth';
import { POST as webhookRoutePost, GET as webhookRouteGet } from '../../src/app/api/v1/webhooks/route';
import { PUT as webhookItemPut, DELETE as webhookItemDelete } from '../../src/app/api/v1/webhooks/[id]/route';

describe('Webhook Delivery & SSRF Security Guard', () => {
  it('blocks private network and cloud metadata addresses via validateUrlForSsrf', async () => {
    const loopback = await validateUrlForSsrf('http://127.0.0.1/notify', { allowHttp: true });
    expect(loopback.safe).toBe(false);

    const localhost = await validateUrlForSsrf('http://localhost:8080/hook', { allowHttp: true });
    expect(localhost.safe).toBe(false);

    const awsMetadata = await validateUrlForSsrf('http://169.254.169.254/latest/meta-data', { allowHttp: true });
    expect(awsMetadata.safe).toBe(false);

    const classA = await validateUrlForSsrf('https://10.0.4.15/webhook', { allowHttp: true });
    expect(classA.safe).toBe(false);

    const classB = await validateUrlForSsrf('https://172.20.1.5/webhook', { allowHttp: true });
    expect(classB.safe).toBe(false);

    const classC = await validateUrlForSsrf('https://192.168.1.100/webhook', { allowHttp: true });
    expect(classC.safe).toBe(false);
  });

  it('permits valid public HTTPS webhook endpoints', async () => {
    const pubA = await validateUrlForSsrf('https://dns.google/dns-query', { allowHttp: false });
    expect(pubA.safe).toBe(true);

    const pubB = await validateUrlForSsrf('https://cloudflare.com', { allowHttp: false });
    expect(pubB.safe).toBe(true);
  });

  it('signs and verifies webhook payload with timestamp drift protection via @denaneya/webhooks', () => {
    const secret = 'whsec_test_secret_key_849204810284';
    const payload = JSON.stringify({ event: 'payment.completed', id: 'pay_123' });
    const nowSec = Math.floor(Date.now() / 1000);

    const { signatureHeader, signature } = signWebhookPayload(payload, secret, nowSec);
    expect(signatureHeader).toContain(`t=${nowSec},v1=${signature}`);

    // Verify valid signature
    const verifyResult = verifyWebhookSignature({
      payload,
      signatureHeader,
      secret,
      toleranceSeconds: 300,
    });
    expect(verifyResult.valid).toBe(true);

    // Verify tampered payload fails
    const tampered = verifyWebhookSignature({
      payload: JSON.stringify({ event: 'payment.completed', id: 'pay_tampered' }),
      signatureHeader,
      secret,
      toleranceSeconds: 300,
    });
    expect(tampered.valid).toBe(false);

    // Verify expired signature fails (outside tolerance window)
    const expiredHeader = `t=${nowSec - 400},v1=${signature}`;
    const expiredResult = verifyWebhookSignature({
      payload,
      signatureHeader: expiredHeader,
      secret,
      toleranceSeconds: 300,
    });
    expect(expiredResult.valid).toBe(false);
  });

  it('webhook route handlers reject unauthenticated requests', async () => {
    const unauthPostReq = new NextRequest('http://localhost/api/v1/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    });
    const postRes = await webhookRoutePost(unauthPostReq);
    expect(postRes.status).toBe(401);

    const unauthGetReq = new NextRequest('http://localhost/api/v1/webhooks', {
      method: 'GET',
    });
    const getRes = await webhookRouteGet(unauthGetReq);
    expect(getRes.status).toBe(401);
  });

  it('PUT /api/v1/webhooks/[id] rejects unauthenticated requests with HTTP 401', async () => {
    const params = Promise.resolve({ id: 'wh_test_123' });
    const unauthPut = new NextRequest('http://localhost/api/v1/webhooks/wh_test_123', {
      method: 'PUT',
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    const putRes = await webhookItemPut(unauthPut, { params });
    expect(putRes.status).toBe(401);

    const unauthDelete = new NextRequest('http://localhost/api/v1/webhooks/wh_test_123', {
      method: 'DELETE',
    });
    const delRes = await webhookItemDelete(unauthDelete, { params });
    expect(delRes.status).toBe(401);
  });

  it('PUT /api/v1/webhooks/[id] validates parameters and enforces SSRF guard on update', async () => {
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
        id: 'key_test_wh',
        name: 'Test Key Webhooks',
        keyPrefix: 'dn_test_sec_',
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['webhooks:write'],
      },
      requestId: 'req_wh_test',
    });

    try {
      const params = Promise.resolve({ id: 'wh_test_123' });

      // Malformed body validation error
      const invalidReq = new NextRequest('http://localhost/api/v1/webhooks/wh_test_123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      });
      const invalidRes = await webhookItemPut(invalidReq, { params });
      expect(invalidRes.status).toBe(422);

      // Non-existent subscription 404
      const notFoundReq = new NextRequest('http://localhost/api/v1/webhooks/wh_non_existent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DISABLED' }),
      });
      const notFoundRes = await webhookItemPut(notFoundReq, { params: Promise.resolve({ id: 'wh_non_existent' }) });
      expect(notFoundRes.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
});

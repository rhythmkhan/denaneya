import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookSubscriptions } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { validateUrlForSsrf, EncryptionService } from '@denaneya/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'webhooks:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const body = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    const targetUrl = String(body.url || '').trim();
    if (!targetUrl) {
      throw new ApiError('VALIDATION_ERROR', 'Field "url" is required.', 422, requestId);
    }

    // SSRF Guard Check
    const ssrfCheck = await validateUrlForSsrf(targetUrl, {
      allowHttp: process.env.NODE_ENV !== 'production',
    });

    if (!ssrfCheck.safe) {
      throw new ApiError('SSRF_VALIDATION_FAILED', `Webhook URL validation failed: ${ssrfCheck.error}`, 422, requestId, {
        url: targetUrl,
        resolvedIps: ssrfCheck.resolvedIps,
      });
    }

    // Generate Plaintext Secret & Encrypt under KEK
    const rawSecret = 'whsec_' + crypto.randomBytes(24).toString('hex');
    const encryptionService = new EncryptionService();
    const encryptedSecretEnvelope = encryptionService.encrypt(rawSecret, {
      aad: authCtx.merchant.id,
    });
    const serializedEncryptedSecret = JSON.stringify(encryptedSecretEnvelope);

    const subscriptionId = 'whs_' + crypto.randomBytes(12).toString('hex');
    const events = Array.isArray(body.events) && body.events.length > 0 ? body.events : ['payment.completed', 'refund.created'];

    if (db) {
      await db.insert(webhookSubscriptions).values({
        id: subscriptionId,
        merchantId: authCtx.merchant.id,
        url: targetUrl,
        secret: serializedEncryptedSecret,
        events,
        status: 'ACTIVE',
        description: body.description || null,
      });
    }

    return jsonResponse(
      {
        id: subscriptionId,
        merchantId: authCtx.merchant.id,
        url: targetUrl,
        events,
        secret: rawSecret, // Disclosed ONLY on creation!
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
      {
        status: 201,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

export async function GET(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'webhooks:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let rows: any[] = [];
    if (db) {
      rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.merchantId, authCtx.merchant.id))
        .orderBy(desc(webhookSubscriptions.createdAt));
    }

    return jsonResponse(
      {
        data: rows.map((s) => ({
          id: s.id,
          url: s.url,
          events: s.events,
          status: s.status,
          failureCount: s.failureCount,
          lastDeliveryAt: s.lastDeliveryAt ? s.lastDeliveryAt.toISOString() : null,
          createdAt: s.createdAt.toISOString(),
        })),
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

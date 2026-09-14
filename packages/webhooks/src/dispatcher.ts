import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { webhookDeliveries, webhookSubscriptions } from '@denaneya/database';
import { validateUrlForSsrf, createSsrfSafeLookup, encryptionService } from '@denaneya/security';
import { Logger } from '@denaneya/observability';
import { signWebhookPayload } from './signature.js';
import { calculateNextRetryDelay, MAX_DELIVERY_ATTEMPTS } from './retry.js';
import { SsrfBlockedError, WebhookDeliveryTimeoutError } from './errors.js';
import type {
  DbExecutor,
  WebhookSubscriptionRecord,
  WebhookDispatchResult,
  WebhookEnvelope,
  WebhookEventType,
} from './types.js';

const logger = new Logger({ service: 'webhook-dispatcher' });

export interface DispatchWebhookParams {
  subscription: WebhookSubscriptionRecord;
  eventId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  attempt: number;
}

export async function dispatchWebhook(
  db: DbExecutor,
  params: DispatchWebhookParams
): Promise<WebhookDispatchResult> {
  const { subscription, eventId, eventType, payload, attempt } = params;
  const startTime = performance.now();
  const deliveryId = `whd_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;

  // 1. SSRF Pre-flight URL validation
  const allowHttp = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const ssrfCheck = await validateUrlForSsrf(subscription.url, { allowHttp });

  if (!ssrfCheck.safe) {
    const errorMsg = ssrfCheck.error ?? 'Destination IP address is forbidden';
    const durationMs = Math.round(performance.now() - startTime);

    // Record SSRF block in delivery audit log
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      subscriptionId: subscription.id,
      merchantId: subscription.merchantId,
      eventId,
      eventType,
      payload,
      requestHeaders: {},
      responseStatus: null,
      responseBody: null,
      responseHeaders: {},
      durationMs,
      attempt,
      status: 'DEAD_LETTER',
      nextRetryAt: null,
      errorMessage: `SSRF Blocked: ${errorMsg}`,
      createdAt: new Date(),
    });

    // Mark subscription as FAILED due to hostile URL
    await db
      .update(webhookSubscriptions)
      .set({
        status: 'FAILED',
        failureCount: subscription.failureCount + 1,
        lastDeliveryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookSubscriptions.id, subscription.id));

    throw new SsrfBlockedError(subscription.url, errorMsg);
  }

  // 2. Build Envelope & Generate HMAC-SHA256 Signature
  const envelope: WebhookEnvelope = {
    id: `evt_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`,
    event: eventType,
    apiVersion: 'v1',
    createdAt: new Date().toISOString(),
    merchantId: subscription.merchantId,
    data: payload,
  };

  const rawJsonBody = JSON.stringify(envelope);

  // Decrypt secret if encrypted
  let signingSecret = subscription.secret;
  if (signingSecret && (signingSecret.startsWith('v1.aes256gcm') || signingSecret.startsWith('enc:'))) {
    try {
      signingSecret = encryptionService.decryptField(signingSecret);
    } catch {
      // Fall back to raw secret if not encrypted with master key
    }
  }

  const { signatureHeader } = signWebhookPayload(rawJsonBody, signingSecret);

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'DenaNeya-Webhook-Dispatcher/1.0',
    'X-DenaNeya-Signature': signatureHeader,
    'X-DenaNeya-Delivery': deliveryId,
    'X-DenaNeya-Event': eventType,
  };

  // 3. Execute HTTP Dispatch with Anti-DNS-Rebinding Agent
  let dispatchResult: WebhookDispatchResult;
  try {
    dispatchResult = await executeHttpRequest(subscription.url, rawJsonBody, requestHeaders, 10000);
  } catch (err: any) {
    dispatchResult = {
      statusCode: null,
      responseBody: null,
      responseHeaders: null,
      durationMs: Math.round(performance.now() - startTime),
      success: false,
      error: err.message,
    };
  }

  const durationMs = dispatchResult.durationMs;
  const isSuccess = dispatchResult.success;

  // 4. Determine Retry & Audit Status
  let deliveryStatus: 'SUCCESS' | 'RETRYING' | 'DEAD_LETTER' = isSuccess ? 'SUCCESS' : 'RETRYING';
  let nextRetryAt: Date | null = null;

  if (!isSuccess) {
    if (attempt >= MAX_DELIVERY_ATTEMPTS) {
      deliveryStatus = 'DEAD_LETTER';
      nextRetryAt = null;
    } else {
      deliveryStatus = 'RETRYING';
      const delayMs = calculateNextRetryDelay(attempt);
      nextRetryAt = new Date(Date.now() + delayMs);
    }
  }

  // 5. Insert Delivery Audit Log
  await db.insert(webhookDeliveries).values({
    id: deliveryId,
    subscriptionId: subscription.id,
    merchantId: subscription.merchantId,
    eventId,
    eventType,
    payload: envelope,
    requestHeaders,
    responseStatus: dispatchResult.statusCode,
    responseBody: dispatchResult.responseBody ? dispatchResult.responseBody.slice(0, 2048) : null,
    responseHeaders: dispatchResult.responseHeaders,
    durationMs,
    attempt,
    status: deliveryStatus,
    nextRetryAt,
    errorMessage: dispatchResult.error ?? null,
    createdAt: new Date(),
  });

  // 6. Update Webhook Subscription Stats
  await db
    .update(webhookSubscriptions)
    .set({
      failureCount: isSuccess ? 0 : subscription.failureCount + 1,
      lastDeliveryAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(webhookSubscriptions.id, subscription.id));

  return dispatchResult;
}

/**
 * Socket-level HTTP/S requester with DNS-rebinding prevention.
 */
export function executeHttpRequest(
  targetUrl: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs = 10000
): Promise<WebhookDispatchResult> {
  return new Promise((resolve) => {
    const urlObj = new URL(targetUrl);
    const isHttps = urlObj.protocol === 'https:';
    const transport = isHttps ? https : http;
    const startTime = performance.now();

    const agentOptions = {
      lookup: createSsrfSafeLookup(),
      keepAlive: false,
    };

    const agent = isHttps
      ? new https.Agent(agentOptions)
      : new http.Agent(agentOptions);

    const reqOptions: https.RequestOptions = {
      method: 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      agent,
      timeout: timeoutMs,
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const MAX_RESPONSE_BYTES = 64 * 1024; // 64KB max buffer

      res.on('data', (chunk: Buffer) => {
        if (totalBytes < MAX_RESPONSE_BYTES) {
          chunks.push(chunk);
          totalBytes += chunk.length;
        }
      });

      res.on('end', () => {
        const durationMs = Math.round(performance.now() - startTime);
        const statusCode = res.statusCode ?? 500;
        const responseBody = Buffer.concat(chunks).toString('utf8');
        const responseHeaders: Record<string, string> = {};

        for (const [key, val] of Object.entries(res.headers)) {
          if (typeof val === 'string') responseHeaders[key] = val;
          else if (Array.isArray(val)) responseHeaders[key] = val.join(', ');
        }

        const success = statusCode >= 200 && statusCode <= 299;

        resolve({
          statusCode,
          responseBody: responseBody.slice(0, 2048),
          responseHeaders,
          durationMs,
          success,
          error: success ? undefined : `HTTP status ${statusCode}`,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new WebhookDeliveryTimeoutError(timeoutMs));
    });

    req.on('error', (err: any) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({
        statusCode: null,
        responseBody: null,
        responseHeaders: null,
        durationMs,
        success: false,
        error: err.message,
      });
    });

    req.write(body);
    req.end();
  });
}
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { webhookSubscriptions } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { validateUrlForSsrf } from '@denaneya/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateWebhookBodySchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  description: z.string().max(255).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'webhooks:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let sub: any = null;
    if (db) {
      const [s] = await db
        .select()
        .from(webhookSubscriptions)
        .where(
          and(
            eq(webhookSubscriptions.id, id),
            eq(webhookSubscriptions.merchantId, authCtx.merchant.id)
          )
        );
      sub = s;
    }

    if (!sub) {
      throw new ApiError('NOT_FOUND', `Webhook subscription '${id}' not found.`, 404, requestId);
    }

    return jsonResponse(
      {
        id: sub.id,
        merchantId: sub.merchantId,
        url: sub.url,
        events: sub.events,
        status: sub.status,
        failureCount: sub.failureCount,
        lastDeliveryAt: sub.lastDeliveryAt ? sub.lastDeliveryAt.toISOString() : null,
        createdAt: sub.createdAt.toISOString(),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'webhooks:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = updateWebhookBodySchema.safeParse(rawBody);

    if (!parseResult.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Invalid webhook update parameters.',
        422,
        requestId,
        { errors: parseResult.error.errors }
      );
    }

    const { url, events, status, description } = parseResult.data;

    let existing: any = null;
    if (db) {
      const [s] = await db
        .select()
        .from(webhookSubscriptions)
        .where(
          and(
            eq(webhookSubscriptions.id, id),
            eq(webhookSubscriptions.merchantId, authCtx.merchant.id)
          )
        );
      existing = s;
    }

    if (!existing) {
      throw new ApiError('NOT_FOUND', `Webhook subscription '${id}' not found.`, 404, requestId);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (url) {
      const ssrfCheck = await validateUrlForSsrf(url, {
        allowHttp: process.env.NODE_ENV !== 'production',
      });
      if (!ssrfCheck.safe) {
        throw new ApiError(
          'SSRF_VALIDATION_FAILED',
          `Webhook URL validation failed: ${ssrfCheck.error}`,
          422,
          requestId,
          { url, resolvedIps: ssrfCheck.resolvedIps }
        );
      }
      updates.url = url;
    }

    if (events) {
      updates.events = events;
    }

    if (status) {
      updates.status = status;
    }

    if (description !== undefined) {
      updates.description = description;
    }

    let updatedSub: any = existing;
    if (db) {
      const [updated] = await db
        .update(webhookSubscriptions)
        .set(updates)
        .where(
          and(
            eq(webhookSubscriptions.id, id),
            eq(webhookSubscriptions.merchantId, authCtx.merchant.id)
          )
        )
        .returning();
      updatedSub = updated;
    }

    return jsonResponse(
      {
        id: updatedSub.id,
        merchantId: updatedSub.merchantId,
        url: updatedSub.url,
        events: updatedSub.events,
        status: updatedSub.status,
        failureCount: updatedSub.failureCount,
        lastDeliveryAt: updatedSub.lastDeliveryAt ? updatedSub.lastDeliveryAt.toISOString() : null,
        createdAt: updatedSub.createdAt.toISOString(),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'webhooks:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    if (db) {
      const [s] = await db
        .select()
        .from(webhookSubscriptions)
        .where(
          and(
            eq(webhookSubscriptions.id, id),
            eq(webhookSubscriptions.merchantId, authCtx.merchant.id)
          )
        );

      if (!s) {
        throw new ApiError('NOT_FOUND', `Webhook subscription '${id}' not found.`, 404, requestId);
      }

      await db
        .delete(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id));
    }

    return jsonResponse(
      { success: true, message: `Webhook subscription '${id}' deleted.` },
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

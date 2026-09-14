import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentLinks } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'payment_links:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let link: any = null;
    if (db) {
      const [l] = await db
        .select()
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.id, id),
            eq(paymentLinks.merchantId, authCtx.merchant.id)
          )
        );
      link = l;
    }

    if (!link) {
      throw new ApiError('NOT_FOUND', `Payment link '${id}' not found.`, 404, requestId);
    }

    return jsonResponse(
      {
        id: link.id,
        merchantId: link.merchantId,
        title: link.title,
        description: link.description,
        slug: link.slug,
        url: `https://checkout.denaneya.com/l/${link.slug}`,
        amountPaisa: link.amountPaisa ? link.amountPaisa.toString() : null,
        currency: link.currency,
        type: link.type,
        status: link.status,
        allowedProviders: link.allowedProviders,
        redirectUrl: link.redirectUrl,
        usedCount: link.usedCount,
        maxUses: link.maxUses,
        expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
        createdAt: link.createdAt.toISOString(),
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
    const authCtx = await authenticateApiKey(request, 'payment_links:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    if (db) {
      const [l] = await db
        .select()
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.id, id),
            eq(paymentLinks.merchantId, authCtx.merchant.id)
          )
        );

      if (!l) {
        throw new ApiError('NOT_FOUND', `Payment link '${id}' not found.`, 404, requestId);
      }

      await db
        .update(paymentLinks)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(eq(paymentLinks.id, id));
    }

    return jsonResponse(
      { success: true, message: `Payment link '${id}' deactivated.` },
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

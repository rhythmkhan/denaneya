import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentLinks } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { handleRouteError } from '@/lib/api/errors';
import { createPaymentLinkSchema } from '@denaneya/payment-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'payment_links:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const rawBody = await request.json();
    const validated = createPaymentLinkSchema.parse({
      ...rawBody,
      merchantId: authCtx.merchant.id,
      currency: 'BDT',
    });

    const linkId = 'plk_' + crypto.randomBytes(12).toString('hex');
    const slug = validated.slug || crypto.randomBytes(6).toString('hex');

    if (db) {
      await db.insert(paymentLinks).values({
        id: linkId,
        merchantId: authCtx.merchant.id,
        title: validated.title,
        description: validated.description || null,
        slug,
        amountPaisa: validated.amountPaisa || null,
        currency: 'BDT',
        type: validated.type,
        status: 'ACTIVE',
        allowedProviders: validated.allowedProviders,
        redirectUrl: validated.redirectUrl || null,
        maxUses: validated.maxUses || 1,
        expiresAt: validated.expiresAt || null,
        metadata: validated.metadata || null,
      });
    }

    const publicUrl = `https://checkout.denaneya.com/l/${slug}`;

    return jsonResponse(
      {
        id: linkId,
        merchantId: authCtx.merchant.id,
        title: validated.title,
        slug,
        url: publicUrl,
        amountPaisa: validated.amountPaisa ? validated.amountPaisa.toString() : null,
        currency: 'BDT',
        type: validated.type,
        status: 'ACTIVE',
        allowedProviders: validated.allowedProviders,
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
    const authCtx = await authenticateApiKey(request, 'payment_links:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let rows: any[] = [];
    if (db) {
      rows = await db
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.merchantId, authCtx.merchant.id))
        .orderBy(desc(paymentLinks.createdAt));
    }

    return jsonResponse(
      {
        data: rows.map((l) => ({
          id: l.id,
          title: l.title,
          slug: l.slug,
          url: `https://checkout.denaneya.com/l/${l.slug}`,
          amountPaisa: l.amountPaisa ? l.amountPaisa.toString() : null,
          currency: l.currency,
          type: l.type,
          status: l.status,
          usedCount: l.usedCount,
          maxUses: l.maxUses,
          createdAt: l.createdAt.toISOString(),
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

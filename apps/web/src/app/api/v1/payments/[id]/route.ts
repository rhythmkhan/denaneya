import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, refunds } from '@denaneya/database';
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
    const authCtx = await authenticateApiKey(request, 'payments:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let payment: any = null;
    let paymentRefunds: any[] = [];

    if (db) {
      const [p] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, id),
            eq(payments.merchantId, authCtx.merchant.id)
          )
        );
      payment = p;

      if (payment) {
        paymentRefunds = await db
          .select()
          .from(refunds)
          .where(
            and(
              eq(refunds.paymentId, payment.id),
              eq(refunds.merchantId, authCtx.merchant.id)
            )
          );
      }
    }

    if (!payment) {
      throw new ApiError('PAYMENT_NOT_FOUND', `Payment with ID '${id}' was not found.`, 404, requestId);
    }

    const netPaisa = payment.amountPaisa - payment.feePaisa - payment.refundedAmountPaisa;

    return jsonResponse(
      {
        id: payment.id,
        merchantId: payment.merchantId,
        amountPaisa: payment.amountPaisa.toString(),
        feePaisa: payment.feePaisa.toString(),
        refundedAmountPaisa: payment.refundedAmountPaisa.toString(),
        netPaisa: netPaisa.toString(),
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        providerTrxId: payment.providerTrxId,
        providerSessionId: payment.providerSessionId,
        verifiedTier: payment.verifiedTier,
        riskScore: payment.riskScore,
        customer: {
          name: payment.customerName,
          email: payment.customerEmail,
          phone: payment.customerPhone,
          billingAddress: payment.billingAddress,
        },
        refunds: paymentRefunds.map((r) => ({
          id: r.id,
          amountPaisa: r.amountPaisa.toString(),
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
        timeline: {
          createdAt: payment.createdAt.toISOString(),
          settledAt: payment.settledAt ? payment.settledAt.toISOString() : null,
          updatedAt: payment.updatedAt.toISOString(),
        },
        metadata: payment.metadata,
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

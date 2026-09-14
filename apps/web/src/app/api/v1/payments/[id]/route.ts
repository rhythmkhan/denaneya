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
      if (id.startsWith('pay_') && authCtx.merchant.id === 'mch_sandbox_demo') {
        payment = {
          id,
          merchantId: 'mch_sandbox_demo',
          amountPaisa: 350000n,
          feePaisa: 5250n,
          refundedAmountPaisa: 0n,
          currency: 'BDT',
          status: 'COMPLETED',
          provider: 'SANDBOX',
          providerTrxId: 'SIM_' + id.slice(-8).toUpperCase(),
          description: 'Demo E-commerce Checkout Order',
          customerName: 'Demo Customer',
          customerEmail: 'customer@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      } else {
        throw new ApiError('PAYMENT_NOT_FOUND', `Payment with ID '${id}' was not found.`, 404, requestId);
      }
    }

    const amountPaisa = BigInt(payment.amountPaisa || 0);
    const feePaisa = BigInt(payment.feePaisa || 0);
    const refundedPaisa = BigInt(payment.refundedAmountPaisa || 0);
    const netPaisa = amountPaisa - feePaisa - refundedPaisa;

    const toIsoDate = (d: any) => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString();
      try {
        return new Date(d).toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    return jsonResponse(
      {
        id: payment.id,
        merchantId: payment.merchantId,
        amountPaisa: amountPaisa.toString(),
        feePaisa: feePaisa.toString(),
        refundedAmountPaisa: refundedPaisa.toString(),
        netPaisa: netPaisa.toString(),
        currency: payment.currency || 'BDT',
        status: payment.status || 'CREATED',
        provider: payment.provider || 'SANDBOX',
        providerTrxId: payment.providerTrxId || null,
        providerSessionId: payment.providerSessionId || null,
        verifiedTier: payment.verifiedTier || null,
        riskScore: payment.riskScore ?? null,
        customer: {
          name: payment.customerName,
          email: payment.customerEmail,
          phone: payment.customerPhone,
          billingAddress: payment.billingAddress,
        },
        refunds: paymentRefunds.map((r) => ({
          id: r.id,
          amountPaisa: String(r.amountPaisa || '0'),
          status: r.status,
          reason: r.reason,
          createdAt: toIsoDate(r.createdAt),
        })),
        timeline: {
          createdAt: toIsoDate(payment.createdAt) || new Date().toISOString(),
          settledAt: toIsoDate(payment.settledAt),
          updatedAt: toIsoDate(payment.updatedAt) || new Date().toISOString(),
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

import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, refunds } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { createRefundSchema, Paisa } from '@denaneya/payment-core';
import { GatewayFactory } from '@denaneya/gateway-adapters';
import { buildRefundTransaction, postTransaction } from '@denaneya/ledger';
import { enqueueOutboxEvent } from '@denaneya/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'payments:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    const rawBody = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    // Check existing refund for idempotency
    if (idempotencyKey && db) {
      const [existingRefund] = await db
        .select()
        .from(refunds)
        .where(
          and(
            eq(refunds.merchantId, authCtx.merchant.id),
            eq(refunds.idempotencyKey, idempotencyKey)
          )
        );

      if (existingRefund) {
        return jsonResponse(
          {
            id: existingRefund.id,
            paymentId: existingRefund.paymentId,
            merchantId: existingRefund.merchantId,
            amountPaisa: existingRefund.amountPaisa.toString(),
            currency: existingRefund.currency,
            status: existingRefund.status,
            reason: existingRefund.reason,
            createdAt: existingRefund.createdAt.toISOString(),
          },
          {
            status: 200,
            headers: {
              ...rateHeaders,
              'Idempotent-Replayed': 'true',
              'X-Request-Id': requestId,
            },
          }
        );
      }
    }

    let payment: any = null;
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
    }

    if (!payment) {
      throw new ApiError('PAYMENT_NOT_FOUND', `Payment with ID '${id}' was not found.`, 404, requestId);
    }

    if (payment.status !== 'COMPLETED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new ApiError('INVALID_PAYMENT_STATE', `Cannot refund payment in '${payment.status}' state. Only COMPLETED payments may be refunded.`, 422, requestId);
    }

    const validated = createRefundSchema.parse({
      ...rawBody,
      paymentId: payment.id,
      merchantId: authCtx.merchant.id,
      currency: 'BDT',
      idempotencyKey,
    });

    const refundAmountPaisa = validated.amountPaisa;
    const currentRefundedPaisa = payment.refundedAmountPaisa || 0n;
    const totalPaymentPaisa = payment.amountPaisa;

    if (currentRefundedPaisa + refundAmountPaisa > totalPaymentPaisa) {
      throw new ApiError('REFUND_EXCEEDS_CAPTURED', `Refund amount (${refundAmountPaisa} paisa) exceeds remaining refundable amount (${totalPaymentPaisa - currentRefundedPaisa} paisa).`, 422, requestId, {
        capturedAmountPaisa: totalPaymentPaisa.toString(),
        alreadyRefundedPaisa: currentRefundedPaisa.toString(),
        requestedRefundPaisa: refundAmountPaisa.toString(),
      });
    }

    // Upstream Gateway Refund
    const refundId = 'ref_' + crypto.randomBytes(12).toString('hex');
    const providerName = (payment.provider || 'SANDBOX').toUpperCase();
    const adapter = GatewayFactory.getAdapter(providerName as any, {
      sandbox: authCtx.merchant.environment === 'SANDBOX',
    } as any);

    const gatewayRefundResult = await adapter.refundPayment({
      refundId,
      paymentId: payment.id,
      providerTrxId: payment.providerTrxId || 'TRX_MOCK',
      refundAmount: Paisa.fromPaisa(refundAmountPaisa),
      totalCapturedAmount: Paisa.fromPaisa(totalPaymentPaisa),
      refundReason: validated.reason,
    });

    const newRefundedTotal = currentRefundedPaisa + refundAmountPaisa;
    const newPaymentStatus = newRefundedTotal === totalPaymentPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    // Atomic DB Settlement & Ledger Update
    if (db) {
      await db.transaction(async (tx) => {
        // 1. Insert Refund Record
        await tx.insert(refunds).values({
          id: refundId,
          paymentId: payment.id,
          merchantId: authCtx.merchant.id,
          amountPaisa: refundAmountPaisa,
          currency: 'BDT',
          status: gatewayRefundResult.status,
          reason: validated.reason,
          providerRefundId: gatewayRefundResult.providerRefundId,
          idempotencyKey: idempotencyKey || null,
        });

        // 2. Update Payment Record
        await tx
          .update(payments)
          .set({
            refundedAmountPaisa: newRefundedTotal,
            status: newPaymentStatus,
            version: payment.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        // 3. Post Balanced Double-Entry Ledger Transaction
        const ledgerTxRequest = buildRefundTransaction({
          refundId,
          paymentId: payment.id,
          merchantId: authCtx.merchant.id,
          refundAmountPaisa,
          platformFeeRefundPaisa: 0n,
        });
        await postTransaction(tx, ledgerTxRequest);

        // 4. Enqueue Transactional Outbox Event
        await enqueueOutboxEvent(tx, {
          merchantId: authCtx.merchant.id,
          eventType: 'refund.created',
          payload: {
            refundId,
            paymentId: payment.id,
            merchantId: authCtx.merchant.id,
            amountPaisa: refundAmountPaisa.toString(),
            totalRefundedPaisa: newRefundedTotal.toString(),
            paymentStatus: newPaymentStatus,
            status: gatewayRefundResult.status,
            createdAt: new Date().toISOString(),
          },
        });
      });
    }

    return jsonResponse(
      {
        id: refundId,
        paymentId: payment.id,
        merchantId: authCtx.merchant.id,
        amountPaisa: refundAmountPaisa.toString(),
        currency: 'BDT',
        status: gatewayRefundResult.status,
        paymentStatus: newPaymentStatus,
        reason: validated.reason,
        idempotencyKey: idempotencyKey || null,
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

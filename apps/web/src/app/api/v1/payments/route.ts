import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, fraudEvaluations, reviewCases } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { createPaymentSchema, Paisa } from '@denaneya/payment-core';
import { FraudEvaluator } from '@denaneya/fraud-engine';
import { GatewayFactory } from '@denaneya/gateway-adapters';
import { enqueueOutboxEvent } from '@denaneya/webhooks';
import { calculatePlatformFee } from '@/lib/api/fees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  let authCtx: any = null;
  let rateHeaders: any = {};
  let idempotencyKey: string | undefined = undefined;
  try {
    authCtx = await authenticateApiKey(request, 'payments:write');
    requestId = authCtx.requestId;
    rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (idempotencyKey && (idempotencyKey.length < 1 || idempotencyKey.length > 128)) {
      throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key header must be between 1 and 128 characters.', 422, requestId);
    }

    const rawBody = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    // Check existing payment for idempotency
    if (idempotencyKey && db) {
      const [existing] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.merchantId, authCtx.merchant.id),
            eq(payments.idempotencyKey, idempotencyKey)
          )
        );

      if (existing) {
        return jsonResponse(
          {
            id: existing.id,
            merchantId: existing.merchantId,
            amountPaisa: String(existing.amountPaisa || '0'),
            feePaisa: String(existing.feePaisa || '0'),
            refundedAmountPaisa: String(existing.refundedAmountPaisa || '0'),
            currency: existing.currency || 'BDT',
            status: existing.status || 'CREATED',
            provider: existing.provider || 'SANDBOX',
            providerTrxId: existing.providerTrxId || null,
            idempotencyKey: existing.idempotencyKey,
            createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : new Date().toISOString(),
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

    // Validate body
    const validated = createPaymentSchema.parse({
      ...rawBody,
      merchantId: authCtx.merchant.id,
      currency: 'BDT',
      idempotencyKey: idempotencyKey || rawBody.idempotencyKey,
    });

    // Calculate Platform Fee
    const amountPaisa = validated.amountPaisa;
    const feeCalculation = calculatePlatformFee({
      amountPaisa,
      feeRateBps: authCtx.merchant.feeRateBps || 150,
      fixedFeePaisa: authCtx.merchant.fixedFeePaisa || 0n,
    });
    const calculatedFeePaisa = feeCalculation.totalFeePaisa;

    // Run Anti-Fraud Evaluation
    const paymentId = 'pay_' + crypto.randomBytes(12).toString('hex');
    const evaluator = new FraudEvaluator();
    const fraudResult = await evaluator.evaluate({
      payment: {
        id: paymentId,
        merchantId: authCtx.merchant.id,
        amountPaisa,
        currency: 'BDT',
        customerPhone: validated.customer?.phone,
        provider: validated.provider || 'SANDBOX',
        createdAt: new Date(),
      },
    });

    if (fraudResult.actionTaken === 'BLOCK') {
      throw new ApiError('FRAUD_REJECTED', 'Payment transaction blocked by anti-fraud risk rules.', 403, requestId, {
        riskScore: fraudResult.riskScore,
        triggeredRules: fraudResult.triggeredRules.map((r) => r.ruleName),
      });
    }

    const isUnderReview = fraudResult.actionTaken === 'UNDER_REVIEW';
    const initialStatus = isUnderReview ? 'UNDER_REVIEW' : 'REQUIRES_ACTION';

    // Call Gateway Adapter
    const providerName = (validated.provider || 'SANDBOX').toUpperCase();
    const adapter = GatewayFactory.getAdapter(providerName as any, {
      sandbox: authCtx.merchant.environment === 'SANDBOX',
    } as any);

    const gatewayResult = await adapter.initiatePayment({
      paymentId,
      merchantId: authCtx.merchant.id,
      amount: Paisa.fromPaisa(amountPaisa),
      currency: 'BDT',
      customer: {
        name: validated.customer?.name || 'Customer',
        email: validated.customer?.email || 'customer@example.com',
        phone: validated.customer?.phone,
        address: validated.customer?.billingAddress
          ? {
              street: validated.customer.billingAddress.street,
              city: validated.customer.billingAddress.city,
              state: validated.customer.billingAddress.state,
              postalCode: validated.customer.billingAddress.postalCode,
              country: validated.customer.billingAddress.country,
            }
          : undefined,
      },
      returnUrl: validated.redirectUrl || `https://checkout.denaneya.com/pay/${paymentId}/return`,
      cancelUrl: validated.redirectUrl || `https://checkout.denaneya.com/pay/${paymentId}/cancel`,
      ipnUrl: `https://api.denaneya.com/api/v1/gateways/ipn`,
    });

    // Atomic DB Insert
    if (db) {
      await db.transaction(async (tx) => {
        await tx.insert(payments).values({
          id: paymentId,
          merchantId: authCtx.merchant.id,
          amountPaisa,
          feePaisa: calculatedFeePaisa,
          currency: 'BDT',
          status: initialStatus,
          provider: providerName,
          providerSessionId: gatewayResult.providerPaymentId,
          idempotencyKey: idempotencyKey || null,
          customerName: validated.customer?.name,
          customerEmail: validated.customer?.email,
          customerPhone: validated.customer?.phone,
          billingAddress: validated.customer?.billingAddress,
          description: validated.description,
          metadata: {
            ...(validated.metadata || {}),
            ...(validated.redirectUrl ? { redirectUrl: validated.redirectUrl } : {}),
          },
          riskScore: fraudResult.riskScore,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Insert Fraud Evaluation Snapshot
        await tx.insert(fraudEvaluations).values({
          id: 'frd_' + crypto.randomBytes(12).toString('hex'),
          paymentId,
          merchantId: authCtx.merchant.id,
          riskScore: fraudResult.riskScore,
          classification: fraudResult.classification,
          actionTaken: fraudResult.actionTaken,
          triggeredRules: fraudResult.triggeredRules.map((r) => ({
            ruleId: r.ruleId,
            weight: r.weight,
            description: r.ruleName,
            metadata: r.metadata,
          })),
        });

        // If under review, enqueue maker-checker review case
        if (isUnderReview) {
          await tx.insert(reviewCases).values({
            id: 'rcs_' + crypto.randomBytes(12).toString('hex'),
            paymentId,
            merchantId: authCtx.merchant.id,
            status: 'OPEN',
            reason: `High risk score (${fraudResult.riskScore}) triggered maker-checker review queue`,
          });
        }

        // Enqueue Outbox Webhook Event
        await enqueueOutboxEvent(tx, {
          merchantId: authCtx.merchant.id,
          eventType: 'payment.created',
          payload: {
            paymentId,
            merchantId: authCtx.merchant.id,
            amountPaisa: amountPaisa.toString(),
            feePaisa: calculatedFeePaisa.toString(),
            currency: 'BDT',
            status: initialStatus,
            provider: providerName,
            riskScore: fraudResult.riskScore,
            createdAt: new Date().toISOString(),
          },
        });
      });
    }

    return jsonResponse(
      {
        id: paymentId,
        merchantId: authCtx.merchant.id,
        amountPaisa: amountPaisa.toString(),
        feePaisa: calculatedFeePaisa.toString(),
        refundedAmountPaisa: '0',
        currency: 'BDT',
        status: initialStatus,
        provider: providerName,
        redirectUrl: gatewayResult.redirectUrl,
        checkoutUrl: `/checkout/${paymentId}`,
        riskScore: fraudResult.riskScore,
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
  } catch (err: any) {
    const isIdempotencyConflict =
      err?.code === '23505' ||
      String(err?.message || '').includes('23505') ||
      String(err?.message || '').includes('idx_payments_merchant_idempotency') ||
      String(err?.message || '').includes('duplicate key value violates unique constraint');

    if (isIdempotencyConflict && idempotencyKey && db && authCtx?.merchant?.id) {
      // Winning thread committed. Fetch committed record with short retry loop
      for (let attempt = 0; attempt < 5; attempt++) {
        const [existing] = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.merchantId, authCtx.merchant.id),
              eq(payments.idempotencyKey, idempotencyKey)
            )
          );

        if (existing) {
          return jsonResponse(
            {
              id: existing.id,
              merchantId: existing.merchantId,
              amountPaisa: String(existing.amountPaisa || '0'),
              feePaisa: String(existing.feePaisa || '0'),
              refundedAmountPaisa: String(existing.refundedAmountPaisa || '0'),
              currency: existing.currency || 'BDT',
              status: existing.status || 'CREATED',
              provider: existing.provider || 'SANDBOX',
              providerTrxId: existing.providerTrxId || null,
              idempotencyKey: existing.idempotencyKey,
              createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : new Date().toISOString(),
            },
            {
              status: 200,
              headers: {
                ...(rateHeaders || {}),
                'Idempotent-Replayed': 'true',
                'X-Request-Id': requestId,
              },
            }
          );
        }
        // Brief backoff wait for the winning thread's transaction to commit
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }

    return handleRouteError(err, requestId);
  }
}

export async function GET(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'payments:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = Math.max(Number.parseInt(searchParams.get('offset') || '0', 10), 0);
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const conditions = [eq(payments.merchantId, authCtx.merchant.id)];
    if (status) conditions.push(eq(payments.status, status as any));
    if (from) conditions.push(gte(payments.createdAt, new Date(from)));
    if (to) conditions.push(lte(payments.createdAt, new Date(to)));

    let rows: any[] = [];
    let count = 0;

    if (db) {
      rows = await db
        .select()
        .from(payments)
        .where(and(...conditions))
        .orderBy(desc(payments.createdAt))
        .limit(limit)
        .offset(offset);

      const [c] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(and(...conditions));
      count = c?.count || 0;
    }

    return jsonResponse(
      {
        data: rows.map((p) => ({
          id: p.id,
          merchantId: p.merchantId,
          amountPaisa: p.amountPaisa.toString(),
          feePaisa: p.feePaisa.toString(),
          refundedAmountPaisa: p.refundedAmountPaisa.toString(),
          currency: p.currency,
          status: p.status,
          provider: p.provider,
          providerTrxId: p.providerTrxId,
          customerName: p.customerName,
          customerEmail: p.customerEmail,
          customerPhone: p.customerPhone,
          riskScore: p.riskScore,
          settledAt: p.settledAt ? p.settledAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        })),
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + rows.length < count,
        },
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

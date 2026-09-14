'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, refunds } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { RefundExceedsCapturedAmountError, Paisa } from '@denaneya/payment-core';
import { GatewayFactory } from '@denaneya/gateway-adapters';
import { buildRefundTransaction, postTransaction } from '@denaneya/ledger';
import { enqueueOutboxEvent } from '@denaneya/webhooks';
import { revalidatePath } from 'next/cache';

export async function createRefundAction(
  paymentId: string,
  amountPaisaInput: string | bigint | number,
  reason: string,
  idempotencyKey?: string
) {
  const { merchantId } = await requireMerchant('payments:refund');
  const amountPaisa = typeof amountPaisaInput === 'bigint' ? amountPaisaInput : BigInt(amountPaisaInput);

  if (amountPaisa <= 0n) {
    throw new Error('Refund amount must be positive.');
  }

  if (!db) {
    return { success: true, refundId: 'ref_mock_01' };
  }

  // Idempotency check
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.merchantId, merchantId),
          eq(refunds.idempotencyKey, idempotencyKey)
        )
      );
    if (existing) {
      return { success: true, refundId: existing.id, replayed: true };
    }
  }

  // Find payment
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.merchantId, merchantId)
      )
    );

  if (!payment) {
    throw new Error('Payment not found.');
  }

  if (payment.status !== 'COMPLETED' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new Error(`Cannot refund payment in '${payment.status}' state.`);
  }

  const currentRefunded = payment.refundedAmountPaisa;
  const totalCaptured = payment.amountPaisa;

  if (currentRefunded + amountPaisa > totalCaptured) {
    throw new RefundExceedsCapturedAmountError(
      amountPaisa,
      totalCaptured - currentRefunded,
      totalCaptured
    );
  }

  const refundId = 'ref_' + crypto.randomBytes(12).toString('hex');
  const newRefundedTotal = currentRefunded + amountPaisa;
  const newStatus = newRefundedTotal === totalCaptured ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  // Upstream Gateway Adapter
  const provider = (payment.provider || 'SANDBOX').toUpperCase();
  const adapter = GatewayFactory.getAdapter(provider as any, { sandbox: true } as any);
  const gatewayRefundResult = await adapter.refundPayment({
    refundId,
    paymentId: payment.id,
    providerTrxId: payment.providerTrxId || 'TRX_MOCK',
    refundAmount: Paisa.fromPaisa(amountPaisa),
    totalCapturedAmount: Paisa.fromPaisa(totalCaptured),
    refundReason: reason,
  });

  // DB Atomic Mutation
  await db.transaction(async (tx) => {
    await tx.insert(refunds).values({
      id: refundId,
      paymentId: payment.id,
      merchantId,
      amountPaisa,
      currency: 'BDT',
      status: gatewayRefundResult.status,
      reason,
      providerRefundId: gatewayRefundResult.providerRefundId,
      idempotencyKey: idempotencyKey || null,
    });

    await tx
      .update(payments)
      .set({
        refundedAmountPaisa: newRefundedTotal,
        status: newStatus,
        version: payment.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    // Post double-entry balanced ledger entry
    const ledgerTx = buildRefundTransaction({
      refundId,
      paymentId: payment.id,
      merchantId,
      refundAmountPaisa: amountPaisa,
      platformFeeRefundPaisa: 0n,
    });
    await postTransaction(tx, ledgerTx);

    // Outbox Webhook
    await enqueueOutboxEvent(tx, {
      merchantId,
      eventType: 'refund.created',
      payload: {
        refundId,
        paymentId: payment.id,
        merchantId,
        amountPaisa: amountPaisa.toString(),
        totalRefundedPaisa: newRefundedTotal.toString(),
        status: newStatus,
      },
    });
  });

  revalidatePath('/dashboard/payments');
  revalidatePath(`/dashboard/payments/${paymentId}`);
  return { success: true, refundId };
}

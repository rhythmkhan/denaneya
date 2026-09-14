'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments } from '@denaneya/database';
import { settlePaymentAtomic } from '@denaneya/ledger';
import { revalidatePath } from 'next/cache';

export async function simulateSuccessAction(paymentId: string) {
  if (!db) {
    return { success: true, redirectUrl: `/checkout/${paymentId}/status?status=COMPLETED` };
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));

  if (!payment) {
    throw new Error('Payment not found');
  }

  const providerTrxId = 'SIM_' + Date.now().toString(36).toUpperCase();

  await settlePaymentAtomic(db, {
    paymentId: payment.id,
    provider: 'SANDBOX',
    providerTrxId,
    amountPaisa: payment.amountPaisa,
    feePaisa: payment.feePaisa,
  });

  revalidatePath(`/checkout/${paymentId}`);
  return { success: true, redirectUrl: `/checkout/${paymentId}/status?status=COMPLETED&trxId=${providerTrxId}` };
}

export async function simulateFailureAction(paymentId: string) {
  if (db) {
    await db
      .update(payments)
      .set({
        status: 'FAILED',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));
  }

  revalidatePath(`/checkout/${paymentId}`);
  return { success: true, redirectUrl: `/checkout/${paymentId}/status?status=FAILED` };
}

export async function submitTrxIdAction(paymentId: string, provider: string, trxId: string) {
  if (!trxId || trxId.length < 4) {
    throw new Error('Please enter a valid TrxID');
  }

  if (db) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));

    if (payment) {
      await db
        .update(payments)
        .set({
          provider: provider.toUpperCase(),
          providerTrxId: trxId.toUpperCase(),
          status: 'PROCESSING',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));
    }
  }

  revalidatePath(`/checkout/${paymentId}`);
  return { success: true };
}

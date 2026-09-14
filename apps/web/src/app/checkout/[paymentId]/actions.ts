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

  let [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));

  if (!payment) {
    if (paymentId.startsWith('pay_')) {
      payment = {
        id: paymentId,
        merchantId: 'mch_sandbox_demo',
        amountPaisa: 350000n,
        feePaisa: 5250n,
        currency: 'BDT',
        status: 'PENDING',
        customerName: 'Demo Customer',
      } as any;
      try {
        await db.insert(payments).values({
          id: paymentId,
          merchantId: 'mch_sandbox_demo',
          amountPaisa: 350000n,
          feePaisa: 5250n,
          currency: 'BDT',
          status: 'PENDING',
          description: 'DenaNeya Hosted Checkout Order',
          customerName: 'Demo Customer',
          customerEmail: 'customer@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch {
        // ignore duplicate
      }
    } else {
      throw new Error('Payment not found');
    }
  }

  const providerTrxId = 'SIM_' + Date.now().toString(36).toUpperCase();

  await settlePaymentAtomic(db, {
    paymentId: payment.id,
    provider: 'SANDBOX',
    providerTrxId,
    amountPaisa: payment.amountPaisa,
    feePaisa: payment.feePaisa,
  });

  // Automatically dispatch queued outbox webhooks to merchant webhook endpoints
  try {
    const { processOutboxEvents } = await import('@denaneya/webhooks');
    await processOutboxEvents(db);
  } catch (err) {
    console.warn('[WEBHOOKS] Non-fatal outbox dispatch error in checkout simulation:', err);
  }

  try {
    revalidatePath(`/checkout/${paymentId}`);
  } catch {
    // Non-fatal when executed outside Next.js request context (e.g. tests)
  }
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

  try {
    revalidatePath(`/checkout/${paymentId}`);
  } catch {
    // Non-fatal when executed outside Next.js request context (e.g. tests)
  }
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

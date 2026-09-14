import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { payments, smsMessages, outboxEvents } from '@denaneya/database';
import { ensureSystemAccounts, ensureMerchantAccounts } from './accounts.js';
import { postTransaction } from './posting.js';
import { buildPaymentCaptureTransaction } from './templates.js';
import {
  PaymentAlreadySettledConflictError,
  InvalidPaymentStateTransitionError,
  ProviderTransactionAlreadyConsumedError,
  PaymentNotFoundError,
} from './errors.js';
import type { DbExecutor, SettlePaymentParams, SettlementResult } from './types.js';

export async function settlePaymentAtomic(
  db: DbExecutor,
  params: SettlePaymentParams
): Promise<SettlementResult> {
  const executeInTx = async (tx: DbExecutor): Promise<SettlementResult> => {
    // 1. Lock payment row
    const paymentQuery = tx
      .select()
      .from(payments)
      .where(eq(payments.id, params.paymentId));

    // Support FOR UPDATE if available
    const paymentRows = typeof paymentQuery.for === 'function'
      ? await paymentQuery.for('update')
      : await paymentQuery;

    if (!paymentRows || paymentRows.length === 0 || !paymentRows[0]) {
      throw new PaymentNotFoundError(`Payment ${params.paymentId} not found`);
    }

    const payment = paymentRows[0];

    // 2. Idempotency check: handle already completed payments gracefully
    if (payment.status === 'COMPLETED') {
      if (params.providerTrxId && payment.providerTrxId === params.providerTrxId) {
        return {
          paymentId: payment.id,
          status: 'COMPLETED',
          settledAt: payment.settledAt ?? new Date(),
          alreadySettled: true,
        };
      }
      throw new PaymentAlreadySettledConflictError(
        `Payment ${payment.id} is already settled with TrxID ${payment.providerTrxId}`
      );
    }

    // Verify valid pre-settlement states
    const validStates = ['PENDING', 'PROCESSING', 'UNDER_REVIEW', 'REQUIRES_ACTION', 'CREATED'];
    if (!validStates.includes(payment.status)) {
      throw new InvalidPaymentStateTransitionError(
        `Cannot settle payment ${payment.id} from invalid state '${payment.status}'`
      );
    }

    // 3. Mark Provider Transaction / SMS Consumed
    if (params.smsMessageId) {
      const result = await tx
        .update(smsMessages)
        .set({
          isConsumed: true,
          consumedByPaymentId: payment.id,
          consumedAt: new Date(),
          status: 'MATCHED',
        })
        .where(
          sql`${smsMessages.id} = ${params.smsMessageId} AND ${smsMessages.isConsumed} = false`
        );

      // Verify single consumption
      const rowsUpdated =
        typeof result?.rowCount === 'number'
          ? result.rowCount
          : Array.isArray(result)
            ? result.length
            : (result as any)?.affectedRows ?? 1;

      if (rowsUpdated === 0) {
        throw new ProviderTransactionAlreadyConsumedError(
          `SMS message ${params.smsMessageId} has already been consumed by another payment`
        );
      }
    }

    // 4. Ensure System & Merchant Accounts Exist
    await ensureSystemAccounts(tx);
    await ensureMerchantAccounts(tx, payment.merchantId);

    // 5. Post Double-Entry Ledger Capture Transaction
    const grossPaisa = BigInt(params.amountPaisa ?? payment.amountPaisa);
    const feePaisa = BigInt(params.feePaisa ?? payment.feePaisa);
    const reservePaisa = BigInt(params.reservePaisa ?? 0n);

    const captureTx = buildPaymentCaptureTransaction({
      paymentId: payment.id,
      merchantId: payment.merchantId,
      provider: params.provider ?? payment.provider ?? 'SANDBOX',
      grossAmountPaisa: grossPaisa,
      platformFeePaisa: feePaisa,
      reservePaisa,
      idempotencyKey: `ltx_settle_${payment.id}`,
    });

    const ledgerResult = await postTransaction(tx, captureTx);

    // 6. Transition Payment to COMPLETED
    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: 'COMPLETED',
        settledAt: now,
        provider: params.provider ?? payment.provider,
        providerTrxId: params.providerTrxId ?? payment.providerTrxId,
        feePaisa,
        version: payment.version + 1,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    // 7. Enqueue Transactional Outbox Webhook Event
    const outboxId = `obx_${now.getTime().toString(36)}_${randomBytes(6).toString('hex')}`;
    await tx.insert(outboxEvents).values({
      id: outboxId,
      merchantId: payment.merchantId,
      eventType: 'payment.completed',
      payload: {
        paymentId: payment.id,
        merchantId: payment.merchantId,
        amountPaisa: grossPaisa.toString(),
        feePaisa: feePaisa.toString(),
        netPaisa: (grossPaisa - feePaisa - reservePaisa).toString(),
        currency: 'BDT',
        provider: params.provider ?? payment.provider,
        providerTrxId: params.providerTrxId ?? payment.providerTrxId,
        settledAt: now.toISOString(),
        ledgerTransactionId: ledgerResult.transactionId,
      },
      status: 'PENDING',
      scheduledAt: now,
      createdAt: now,
    });

    return {
      paymentId: payment.id,
      status: 'COMPLETED',
      settledAt: now,
      ledgerTransactionId: ledgerResult.transactionId,
      outboxEventId: outboxId,
      alreadySettled: false,
    };
  };

  // If the db client has a transaction runner, invoke it; otherwise run directly
  if (typeof db?.transaction === 'function') {
    return db.transaction(executeInTx);
  }
  return executeInTx(db);
}

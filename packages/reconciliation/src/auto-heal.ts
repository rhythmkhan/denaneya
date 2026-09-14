import { settlePaymentAtomic, type DbExecutor, type SettlementResult } from '@denaneya/ledger';
import type { DiscrepancyReport, ReconciliationTriplet } from './types.js';
import { AutoHealError } from './errors.js';

export interface AutoHealResult {
  healed: boolean;
  paymentId: string;
  settlementResult?: SettlementResult;
  error?: string;
}

/**
 * Attempts to auto-heal a dropped IPN discrepancy using settlePaymentAtomic from @denaneya/ledger.
 */
export async function autoHealDiscrepancy(
  db: DbExecutor,
  discrepancy: DiscrepancyReport,
  triplet: ReconciliationTriplet
): Promise<AutoHealResult> {
  const payment = triplet.payment;
  const providerItem = triplet.providerItem;

  if (!payment) {
    throw new AutoHealError('Cannot auto-heal discrepancy without internal payment record');
  }

  if (!providerItem) {
    throw new AutoHealError(`Cannot auto-heal payment ${payment.id} without provider settlement item`, payment.id);
  }

  if (!discrepancy.canAutoHeal) {
    return {
      healed: false,
      paymentId: payment.id,
      error: `Discrepancy ${discrepancy.discrepancyType} is not eligible for auto-healing`,
    };
  }

  try {
    const settlementResult = await settlePaymentAtomic(db, {
      paymentId: payment.id,
      provider: providerItem.provider || payment.provider,
      providerTrxId: providerItem.providerTrxId,
      amountPaisa: providerItem.amountPaisa,
      feePaisa: payment.feePaisa,
    });

    discrepancy.resolutionStatus = 'AUTO_RESOLVED';
    discrepancy.resolutionNotes = `Auto-healed dropped IPN: State transitioned to COMPLETED. Ledger TX: ${settlementResult.ledgerTransactionId}, Outbox Event: ${settlementResult.outboxEventId}`;
    discrepancy.resolvedAt = new Date();
    discrepancy.resolvedBy = 'RECONCILIATION_AUTO_HEALER';

    return {
      healed: true,
      paymentId: payment.id,
      settlementResult,
    };
  } catch (err) {
    const errorMsg = (err as Error).message;
    discrepancy.resolutionNotes = `Auto-heal attempt failed: ${errorMsg}`;
    return {
      healed: false,
      paymentId: payment.id,
      error: errorMsg,
    };
  }
}

/**
 * Executes batch auto-healing on all eligible discrepancies in a reconciliation run.
 */
export async function autoHealDiscrepancies(
  db: DbExecutor,
  discrepancies: DiscrepancyReport[],
  tripletsMap: Map<string, ReconciliationTriplet>
): Promise<{ autoHealedCount: number; results: AutoHealResult[] }> {
  let autoHealedCount = 0;
  const results: AutoHealResult[] = [];

  for (const discrepancy of discrepancies) {
    if (discrepancy.canAutoHeal && discrepancy.paymentId) {
      const triplet = tripletsMap.get(discrepancy.paymentId);
      if (triplet) {
        const res = await autoHealDiscrepancy(db, discrepancy, triplet);
        results.push(res);
        if (res.healed) {
          autoHealedCount++;
        }
      }
    }
  }

  return {
    autoHealedCount,
    results,
  };
}

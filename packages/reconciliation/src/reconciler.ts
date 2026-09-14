import { Paisa } from '@denaneya/payment-core';
import type {
  DiscrepancyReport,
  DiscrepancyType,
  LedgerRecord,
  PaymentRecord,
  ReconciliationConfig,
  ReconciliationSummary,
  ReconciliationTriplet,
  StatementItem,
} from './types.js';

/**
 * Evaluates the expected provider interchange / MDR fee in paisa using zero float math.
 */
export function evaluateExpectedFeePaisa(
  payment: PaymentRecord,
  providerItem: StatementItem,
  config?: ReconciliationConfig
): bigint {
  const provider = (providerItem.provider || payment.provider || '').toUpperCase();
  const mdrBps =
    config?.expectedMdrBpsByProvider?.[provider] ??
    config?.expectedMdrBps;

  if (mdrBps !== undefined && mdrBps !== null) {
    return Paisa.fromPaisa(payment.amountPaisa).percentage(mdrBps).toPaisa();
  }

  // Fallback to internal payment fee recorded at checkout
  return payment.feePaisa;
}

/**
 * Classifies a single 3-way transaction triplet into one of the 7 discrepancy categories.
 * Returns null only if an uncompleted payment is naturally absent from settlement feed.
 */
export function classifyTriplet(
  triplet: ReconciliationTriplet,
  config?: ReconciliationConfig
): DiscrepancyReport | null {
  const { payment, providerItem, ledgerTx } = triplet;
  const tolerance = config?.feeTolerancePaisa ?? 0n;

  // 1. Unknown to DenaNeya -> UNEXPECTED_GATEWAY_TX
  if (!payment && providerItem) {
    return {
      discrepancyType: 'UNEXPECTED_GATEWAY_TX',
      providerTrxId: providerItem.providerTrxId,
      provider: providerItem.provider,
      providerAmountPaisa: providerItem.amountPaisa,
      discrepancyAmountPaisa: providerItem.amountPaisa,
      providerStatus: providerItem.providerStatus,
      actualFeePaisa: providerItem.feePaisa,
      resolutionStatus: 'UNRESOLVED',
      resolutionNotes: `Provider transaction ${providerItem.providerTrxId} not recognized in DenaNeya internal database`,
      createdAt: new Date(),
    };
  }

  // 2. Missing from Gateway Report -> MISSING_IN_GATEWAY
  if (payment && !providerItem) {
    if (payment.status === 'COMPLETED') {
      return {
        discrepancyType: 'MISSING_IN_GATEWAY',
        paymentId: payment.id,
        providerTrxId: payment.providerTrxId ?? undefined,
        provider: payment.provider,
        merchantId: payment.merchantId,
        internalAmountPaisa: payment.amountPaisa,
        discrepancyAmountPaisa: -payment.amountPaisa,
        internalStatus: payment.status,
        resolutionStatus: 'UNRESOLVED',
        resolutionNotes: `Payment ${payment.id} is marked COMPLETED in DenaNeya but missing in provider settlement feed`,
        createdAt: new Date(),
      };
    }
    // Normal: Uncompleted/abandoned payments are omitted from settlement statements
    return null;
  }

  // From here, both payment and providerItem are guaranteed to exist
  const safePayment = payment!;
  const safeProviderItem = providerItem!;
  const providerCode = safeProviderItem.provider || safePayment.provider;

  const isInternalSuccess = safePayment.status === 'COMPLETED';
  const isProviderSuccess = safeProviderItem.providerStatus === 'COMPLETED';

  // 3. Status Mismatch -> STATUS_MISMATCH
  if (isInternalSuccess !== isProviderSuccess) {
    const delta = safeProviderItem.amountPaisa - safePayment.amountPaisa;
    // Auto-healable if provider confirmed success, internal is pending/processing, and amounts agree
    const canAutoHeal =
      !isInternalSuccess &&
      isProviderSuccess &&
      safePayment.amountPaisa === safeProviderItem.amountPaisa &&
      ['PENDING', 'PROCESSING', 'REQUIRES_ACTION', 'UNDER_REVIEW', 'CREATED'].includes(safePayment.status);

    return {
      discrepancyType: 'STATUS_MISMATCH',
      paymentId: safePayment.id,
      providerTrxId: safeProviderItem.providerTrxId,
      provider: providerCode,
      merchantId: safePayment.merchantId,
      internalAmountPaisa: safePayment.amountPaisa,
      providerAmountPaisa: safeProviderItem.amountPaisa,
      discrepancyAmountPaisa: delta,
      internalStatus: safePayment.status,
      providerStatus: safeProviderItem.providerStatus,
      canAutoHeal,
      resolutionStatus: 'UNRESOLVED',
      resolutionNotes: canAutoHeal
        ? `Dropped IPN detected: Provider settled successfully, payment is ${safePayment.status}. Eligible for auto-healing.`
        : `Critical status divergence: DenaNeya ${safePayment.status} vs Provider ${safeProviderItem.providerStatus}.`,
      createdAt: new Date(),
    };
  }

  // 4. Missing in Ledger -> MISSING_IN_LEDGER
  // Internal and provider both succeeded, but double-entry ledger entry is absent or unbalanced
  if (isInternalSuccess && (!ledgerTx || !ledgerTx.isBalanced)) {
    return {
      discrepancyType: 'MISSING_IN_LEDGER',
      paymentId: safePayment.id,
      providerTrxId: safeProviderItem.providerTrxId,
      provider: providerCode,
      merchantId: safePayment.merchantId,
      internalAmountPaisa: safePayment.amountPaisa,
      providerAmountPaisa: safeProviderItem.amountPaisa,
      ledgerAmountPaisa: ledgerTx?.grossDebitPaisa,
      discrepancyAmountPaisa: safePayment.amountPaisa,
      internalStatus: safePayment.status,
      providerStatus: safeProviderItem.providerStatus,
      resolutionStatus: 'UNRESOLVED',
      resolutionNotes: !ledgerTx
        ? `Payment ${safePayment.id} settled without corresponding double-entry ledger capture journal`
        : `Ledger journal for payment ${safePayment.id} violates debit == credit balanced invariant`,
      createdAt: new Date(),
    };
  }

  // 5. Amount Mismatch -> AMOUNT_MISMATCH
  if (
    safePayment.amountPaisa !== safeProviderItem.amountPaisa ||
    (ledgerTx && ledgerTx.grossDebitPaisa !== safePayment.amountPaisa)
  ) {
    const delta = safeProviderItem.amountPaisa - safePayment.amountPaisa;
    return {
      discrepancyType: 'AMOUNT_MISMATCH',
      paymentId: safePayment.id,
      providerTrxId: safeProviderItem.providerTrxId,
      provider: providerCode,
      merchantId: safePayment.merchantId,
      internalAmountPaisa: safePayment.amountPaisa,
      providerAmountPaisa: safeProviderItem.amountPaisa,
      ledgerAmountPaisa: ledgerTx?.grossDebitPaisa,
      discrepancyAmountPaisa: delta,
      internalStatus: safePayment.status,
      providerStatus: safeProviderItem.providerStatus,
      resolutionStatus: 'UNRESOLVED',
      resolutionNotes: `Amount mismatch: Internal ${safePayment.amountPaisa} paisa vs Provider ${safeProviderItem.amountPaisa} paisa (diff: ${delta} paisa)`,
      createdAt: new Date(),
    };
  }

  // 6. Fee Discrepancy -> FEE_DISCREPANCY
  const expectedFeePaisa = evaluateExpectedFeePaisa(safePayment, safeProviderItem, config);
  const actualFeePaisa = safeProviderItem.feePaisa;
  const feeDelta = actualFeePaisa - expectedFeePaisa;
  const absFeeDelta = feeDelta < 0n ? -feeDelta : feeDelta;

  if (absFeeDelta > tolerance) {
    return {
      discrepancyType: 'FEE_DISCREPANCY',
      paymentId: safePayment.id,
      providerTrxId: safeProviderItem.providerTrxId,
      provider: providerCode,
      merchantId: safePayment.merchantId,
      internalAmountPaisa: safePayment.amountPaisa,
      providerAmountPaisa: safeProviderItem.amountPaisa,
      ledgerAmountPaisa: ledgerTx?.grossDebitPaisa,
      expectedFeePaisa,
      actualFeePaisa,
      discrepancyAmountPaisa: feeDelta,
      internalStatus: safePayment.status,
      providerStatus: safeProviderItem.providerStatus,
      resolutionStatus: 'UNRESOLVED',
      resolutionNotes: `Gateway fee discrepancy: Expected ${expectedFeePaisa} paisa, Actual charged ${actualFeePaisa} paisa (delta: ${feeDelta} paisa)`,
      createdAt: new Date(),
    };
  }

  // 7. Perfect Match -> MATCHED
  return {
    discrepancyType: 'MATCHED',
    paymentId: safePayment.id,
    providerTrxId: safeProviderItem.providerTrxId,
    provider: providerCode,
    merchantId: safePayment.merchantId,
    internalAmountPaisa: safePayment.amountPaisa,
    providerAmountPaisa: safeProviderItem.amountPaisa,
    ledgerAmountPaisa: ledgerTx?.grossDebitPaisa,
    discrepancyAmountPaisa: 0n,
    internalStatus: safePayment.status,
    providerStatus: safeProviderItem.providerStatus,
    expectedFeePaisa,
    actualFeePaisa,
    resolutionStatus: 'AUTO_RESOLVED',
    resolutionNotes: 'Matched perfectly across payment state, provider settlement, and balanced ledger.',
    createdAt: new Date(),
  };
}

/**
 * Builds composite index and joins Payments, Provider Items, and Ledger records into Triplets.
 */
export function indexAndTriangulate(
  payments: PaymentRecord[],
  providerItems: StatementItem[],
  ledgerTxs: LedgerRecord[]
): ReconciliationTriplet[] {
  const paymentsById = new Map<string, PaymentRecord>();
  const paymentsByTrxId = new Map<string, PaymentRecord>();

  for (const p of payments) {
    paymentsById.set(p.id, p);
    if (p.providerTrxId) {
      paymentsByTrxId.set(p.providerTrxId, p);
    }
  }

  const ledgerByPaymentId = new Map<string, LedgerRecord>();
  for (const l of ledgerTxs) {
    ledgerByPaymentId.set(l.referenceId, l);
  }

  const providerByTrxId = new Map<string, StatementItem>();
  const providerByMerchantTxId = new Map<string, StatementItem>();
  for (const item of providerItems) {
    if (item.providerTrxId) {
      providerByTrxId.set(item.providerTrxId, item);
    }
    if (item.merchantTxId) {
      providerByMerchantTxId.set(item.merchantTxId, item);
    }
  }

  const allKeys = new Set<string>();
  for (const p of payments) {
    allKeys.add(p.id);
  }
  for (const item of providerItems) {
    if (item.merchantTxId && paymentsById.has(item.merchantTxId)) {
      allKeys.add(item.merchantTxId);
    } else if (item.providerTrxId && paymentsByTrxId.has(item.providerTrxId)) {
      const matchedPayment = paymentsByTrxId.get(item.providerTrxId);
      if (matchedPayment) {
        allKeys.add(matchedPayment.id);
      }
    } else {
      // Unmatched gateway transaction
      allKeys.add(`gw_${item.providerTrxId}`);
    }
  }

  const triplets: ReconciliationTriplet[] = [];

  for (const key of allKeys) {
    let payment: PaymentRecord | undefined;
    let providerItem: StatementItem | undefined;
    let ledgerTx: LedgerRecord | undefined;

    if (key.startsWith('gw_')) {
      const trxId = key.replace('gw_', '');
      providerItem = providerByTrxId.get(trxId);
    } else {
      payment = paymentsById.get(key);
      if (payment) {
        ledgerTx = ledgerByPaymentId.get(payment.id);
        providerItem =
          providerByMerchantTxId.get(payment.id) ??
          (payment.providerTrxId ? providerByTrxId.get(payment.providerTrxId) : undefined);
      }
    }

    triplets.push({
      key,
      payment,
      providerItem,
      ledgerTx,
    });
  }

  return triplets;
}

/**
 * Executes 3-way reconciliation on an array of triplets and compiles running totals and summaries.
 */
export function reconcileTriplets(
  triplets: ReconciliationTriplet[],
  config?: ReconciliationConfig
): {
  summary: ReconciliationSummary;
  discrepancies: DiscrepancyReport[];
  matchedTriplets: DiscrepancyReport[];
} {
  let matchedCount = 0;
  let discrepancyCount = 0;
  let autoHealedCount = 0;
  let totalInternalAmountPaisa = 0n;
  let totalProviderAmountPaisa = 0n;
  let totalLedgerAmountPaisa = 0n;
  let netDiscrepancyAmountPaisa = 0n;

  const breakdownByType: Record<DiscrepancyType, number> = {
    MATCHED: 0,
    AMOUNT_MISMATCH: 0,
    STATUS_MISMATCH: 0,
    MISSING_IN_LEDGER: 0,
    MISSING_IN_GATEWAY: 0,
    UNEXPECTED_GATEWAY_TX: 0,
    FEE_DISCREPANCY: 0,
  };

  const discrepancies: DiscrepancyReport[] = [];
  const matchedTriplets: DiscrepancyReport[] = [];

  for (const triplet of triplets) {
    const report = classifyTriplet(triplet, config);
    if (!report) {
      continue;
    }

    if (triplet.payment?.amountPaisa) {
      totalInternalAmountPaisa += triplet.payment.amountPaisa;
    }
    if (triplet.providerItem?.amountPaisa) {
      totalProviderAmountPaisa += triplet.providerItem.amountPaisa;
    }
    if (triplet.ledgerTx?.grossDebitPaisa) {
      totalLedgerAmountPaisa += triplet.ledgerTx.grossDebitPaisa;
    }

    breakdownByType[report.discrepancyType]++;

    if (report.discrepancyType === 'MATCHED') {
      matchedCount++;
      matchedTriplets.push(report);
    } else {
      discrepancyCount++;
      netDiscrepancyAmountPaisa += report.discrepancyAmountPaisa;
      discrepancies.push(report);
    }
  }

  const summary: ReconciliationSummary = {
    totalRecordsEvaluated: matchedCount + discrepancyCount,
    matchedCount,
    discrepancyCount,
    autoHealedCount,
    totalInternalAmountPaisa,
    totalProviderAmountPaisa,
    totalLedgerAmountPaisa,
    netDiscrepancyAmountPaisa,
    breakdownByType,
  };

  return {
    summary,
    discrepancies,
    matchedTriplets,
  };
}

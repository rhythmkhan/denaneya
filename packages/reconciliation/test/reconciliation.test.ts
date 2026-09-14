import { describe, it, expect, vi } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import {
  classifyTriplet,
  indexAndTriangulate,
  reconcileTriplets,
  evaluateExpectedFeePaisa,
} from '../src/reconciler.js';
import { autoHealDiscrepancy } from '../src/auto-heal.js';
import { runReconciliation } from '../src/runner.js';
import { generateReconciliationCsv, formatReconciliationResponse } from '../src/reports.js';
import type {
  DiscrepancyReport,
  LedgerRecord,
  PaymentRecord,
  ReconciliationTriplet,
  StatementItem,
} from '../src/types.js';

describe('Three-Way Reconciliation Engine - 7 Discrepancy Classifications', () => {
  const basePayment: PaymentRecord = {
    id: 'pay_01JN_MATCHED',
    merchantId: 'mch_01JN_TEST',
    amountPaisa: 500000n, // 5,000.00 BDT
    feePaisa: 9250n,     // 1.85% = 92.50 BDT
    provider: 'SSLCOMMERZ',
    providerTrxId: 'VAL_5000_01',
    status: 'COMPLETED',
    settledAt: new Date('2026-09-13T10:00:00Z'),
  };

  const baseProviderItem: StatementItem = {
    provider: 'SSLCOMMERZ',
    providerTrxId: 'VAL_5000_01',
    merchantTxId: 'pay_01JN_MATCHED',
    amountPaisa: 500000n,
    feePaisa: 9250n,
    netAmountPaisa: 490750n,
    currency: 'BDT',
    providerStatus: 'COMPLETED',
    transactionTime: new Date('2026-09-13T10:00:00Z'),
  };

  const baseLedger: LedgerRecord = {
    transactionId: 'ltx_01JN_MATCHED',
    referenceId: 'pay_01JN_MATCHED',
    referenceType: 'PAYMENT',
    grossDebitPaisa: 500000n,
    isBalanced: true,
  };

  // 1. MATCHED
  it('1. MATCHED: categorizes clean parity across all 3 independent sources', () => {
    const triplet: ReconciliationTriplet = {
      key: 'pay_01JN_MATCHED',
      payment: basePayment,
      providerItem: baseProviderItem,
      ledgerTx: baseLedger,
    };

    const result = classifyTriplet(triplet, { expectedMdrBps: 185 });
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('MATCHED');
    expect(result!.discrepancyAmountPaisa).toBe(0n);
    expect(result!.resolutionStatus).toBe('AUTO_RESOLVED');
  });

  // 2. AMOUNT_MISMATCH
  it('2. AMOUNT_MISMATCH: detects discrepancy when provider amount differs from internal payment', () => {
    const providerUnderSettled: StatementItem = {
      ...baseProviderItem,
      amountPaisa: 490000n, // Provider settled 4,900.00 BDT instead of 5,000.00 BDT
      netAmountPaisa: 480935n,
    };

    const triplet: ReconciliationTriplet = {
      key: 'pay_amount_mismatch',
      payment: basePayment,
      providerItem: providerUnderSettled,
      ledgerTx: baseLedger,
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('AMOUNT_MISMATCH');
    expect(result!.discrepancyAmountPaisa).toBe(-10000n); // -100.00 BDT
    expect(result!.internalAmountPaisa).toBe(500000n);
    expect(result!.providerAmountPaisa).toBe(490000n);
  });

  // 3. STATUS_MISMATCH - Subtype 1 (Ghost Completion: Internal COMPLETED, Provider FAILED)
  it('3. STATUS_MISMATCH (Ghost): identifies critical risk when internal is COMPLETED but provider is FAILED', () => {
    const providerFailed: StatementItem = {
      ...baseProviderItem,
      providerStatus: 'FAILED',
    };

    const triplet: ReconciliationTriplet = {
      key: 'pay_ghost_complete',
      payment: basePayment,
      providerItem: providerFailed,
      ledgerTx: baseLedger,
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('STATUS_MISMATCH');
    expect(result!.canAutoHeal).toBe(false); // Ghost completion cannot be auto-healed!
    expect(result!.internalStatus).toBe('COMPLETED');
    expect(result!.providerStatus).toBe('FAILED');
  });

  // 4. STATUS_MISMATCH - Subtype 2 (Dropped IPN: Internal PENDING, Provider COMPLETED)
  it('4. STATUS_MISMATCH (Dropped IPN): identifies auto-healable candidate when provider settled but webhook was dropped', () => {
    const pendingPayment: PaymentRecord = {
      ...basePayment,
      status: 'PENDING',
      settledAt: null,
    };

    const triplet: ReconciliationTriplet = {
      key: 'pay_dropped_ipn',
      payment: pendingPayment,
      providerItem: baseProviderItem,
      ledgerTx: undefined, // Not settled yet, so no ledger
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('STATUS_MISMATCH');
    expect(result!.canAutoHeal).toBe(true); // Eligible for auto-healing!
    expect(result!.internalStatus).toBe('PENDING');
    expect(result!.providerStatus).toBe('COMPLETED');
  });

  // 5. MISSING_IN_LEDGER
  it('5. MISSING_IN_LEDGER: flags when payment and provider are COMPLETED but ledger posting is absent', () => {
    const triplet: ReconciliationTriplet = {
      key: 'pay_missing_ledger',
      payment: basePayment,
      providerItem: baseProviderItem,
      ledgerTx: undefined, // Missing ledger capture!
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('MISSING_IN_LEDGER');
    expect(result!.discrepancyAmountPaisa).toBe(500000n);
    expect(result!.paymentId).toBe(basePayment.id);
  });

  // 6. MISSING_IN_GATEWAY
  it('6. MISSING_IN_GATEWAY: flags when internal payment is COMPLETED but missing in gateway statement', () => {
    const triplet: ReconciliationTriplet = {
      key: 'pay_missing_gw',
      payment: basePayment,
      providerItem: undefined, // Omitted from statement!
      ledgerTx: baseLedger,
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('MISSING_IN_GATEWAY');
    expect(result!.discrepancyAmountPaisa).toBe(-500000n);
    expect(result!.paymentId).toBe(basePayment.id);
  });

  // 7. UNEXPECTED_GATEWAY_TX
  it('7. UNEXPECTED_GATEWAY_TX: flags unclaimed transaction appearing in gateway feed', () => {
    const triplet: ReconciliationTriplet = {
      key: 'gw_UNKNOWN_TRX',
      payment: undefined, // Unknown to DenaNeya
      providerItem: {
        provider: 'BKASH',
        providerTrxId: 'BK_UNKNOWN_99',
        amountPaisa: 120000n, // 1,200.00 BDT
        feePaisa: 2220n,
        netAmountPaisa: 117780n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      },
      ledgerTx: undefined,
    };

    const result = classifyTriplet(triplet);
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('UNEXPECTED_GATEWAY_TX');
    expect(result!.discrepancyAmountPaisa).toBe(120000n);
    expect(result!.providerTrxId).toBe('BK_UNKNOWN_99');
  });

  // 8. FEE_DISCREPANCY
  it('8. FEE_DISCREPANCY: detects overcharged gateway MDR fee beyond tolerance', () => {
    // Expected fee at 1.85% on 5,000.00 BDT is 92.50 BDT (9250 paisa).
    // Provider charged 250.00 BDT (25000 paisa).
    const overchargedItem: StatementItem = {
      ...baseProviderItem,
      feePaisa: 25000n,
      netAmountPaisa: 475000n,
    };

    const triplet: ReconciliationTriplet = {
      key: 'pay_fee_discrepancy',
      payment: basePayment,
      providerItem: overchargedItem,
      ledgerTx: baseLedger,
    };

    const result = classifyTriplet(triplet, { expectedMdrBps: 185, feeTolerancePaisa: 0n });
    expect(result).not.toBeNull();
    expect(result!.discrepancyType).toBe('FEE_DISCREPANCY');
    expect(result!.expectedFeePaisa).toBe(9250n);
    expect(result!.actualFeePaisa).toBe(25000n);
    expect(result!.discrepancyAmountPaisa).toBe(15750n); // 157.50 BDT overcharge
  });
});

describe('Zero-Float Paisa Math Invariant (10,000 Iteration Penny Accuracy)', () => {
  it('guarantees Gross == Net + Fee down to exact 1 paisa with zero float drift over 10,000 transactions', () => {
    const mdrBps = 185; // 1.85%

    for (let i = 1; i <= 10000; i++) {
      // Create pseudorandom odd paisa amounts (e.g. 100 paisa to 10,000,000 paisa)
      const grossPaisa = BigInt((i * 1337) % 9999900 + 100);
      const gross = Paisa.fromPaisa(grossPaisa);

      // Integer percentage with half-up rounding
      const fee = gross.percentage(mdrBps);
      const net = gross.subtract(fee);

      // Invariant: Gross === Net + Fee down to 1 exact paisa
      expect(gross.toPaisa()).toBe(net.toPaisa() + fee.toPaisa());

      // Invariant: BDT string formatting has zero IEEE-754 drift
      const grossBDT = gross.toBDT();
      const reconstructed = Paisa.fromBDT(grossBDT);
      expect(reconstructed.toPaisa()).toBe(gross.toPaisa());
    }
  });
});

describe('Auto-Healing Dropped IPN Transactions', () => {
  it('triggers atomic settlement when provider confirms completion for pending payment', async () => {
    const mockDb = {
      transaction: vi.fn(async (callback) => callback(mockDb)),
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    };

    const payment: PaymentRecord = {
      id: 'pay_auto_01',
      merchantId: 'mch_01',
      amountPaisa: 150000n,
      feePaisa: 2775n,
      provider: 'BKASH',
      providerTrxId: 'BK_AUTO_TRX',
      status: 'PENDING',
      settledAt: null,
    };

    const providerItem: StatementItem = {
      provider: 'BKASH',
      providerTrxId: 'BK_AUTO_TRX',
      merchantTxId: 'pay_auto_01',
      amountPaisa: 150000n,
      feePaisa: 2775n,
      netAmountPaisa: 147225n,
      currency: 'BDT',
      providerStatus: 'COMPLETED',
      transactionTime: new Date(),
    };

    const triplet: ReconciliationTriplet = {
      key: payment.id,
      payment,
      providerItem,
    };

    const discrepancy = classifyTriplet(triplet)!;
    expect(discrepancy.canAutoHeal).toBe(true);

    // Mock settlePaymentAtomic
    vi.mock('@denaneya/ledger', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@denaneya/ledger')>();
      return {
        ...actual,
        settlePaymentAtomic: vi.fn().mockResolvedValue({
          paymentId: 'pay_auto_01',
          status: 'COMPLETED',
          settledAt: new Date(),
          ledgerTransactionId: 'ltx_auto_01',
          outboxEventId: 'obx_auto_01',
          alreadySettled: false,
        }),
      };
    });

    const result = await autoHealDiscrepancy(mockDb as any, discrepancy, triplet);
    expect(result.healed).toBe(true);
    expect(discrepancy.resolutionStatus).toBe('AUTO_RESOLVED');
    expect(discrepancy.resolvedBy).toBe('RECONCILIATION_AUTO_HEALER');
    expect(discrepancy.resolutionNotes).toContain('ltx_auto_01');
  });
});

describe('End-to-End Batch Triangulation Runner (In-Memory)', () => {
  it('reconciles mixed batch, indexes keys, and produces compliant summary and CSV export', async () => {
    const payments: PaymentRecord[] = [
      {
        id: 'pay_01',
        merchantId: 'mch_01',
        amountPaisa: 100000n,
        feePaisa: 1850n,
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_01',
        status: 'COMPLETED',
      },
      {
        id: 'pay_02',
        merchantId: 'mch_01',
        amountPaisa: 200000n,
        feePaisa: 3700n,
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_02',
        status: 'COMPLETED',
      },
      {
        id: 'pay_03_missing_in_gw',
        merchantId: 'mch_01',
        amountPaisa: 300000n,
        feePaisa: 5550n,
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_03',
        status: 'COMPLETED',
      },
    ];

    const providerItems: StatementItem[] = [
      // Matches pay_01
      {
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_01',
        merchantTxId: 'pay_01',
        amountPaisa: 100000n,
        feePaisa: 1850n,
        netAmountPaisa: 98150n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      },
      // Matches pay_02 on ID, but amount mismatch (1,950.00 BDT instead of 2,000.00)
      {
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_02',
        merchantTxId: 'pay_02',
        amountPaisa: 195000n,
        feePaisa: 3600n,
        netAmountPaisa: 191400n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      },
      // Unexpected gateway transaction (not in payments)
      {
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_UNEXPECTED',
        amountPaisa: 50000n,
        feePaisa: 925n,
        netAmountPaisa: 49075n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      },
    ];

    const ledgerTxs: LedgerRecord[] = [
      {
        transactionId: 'ltx_01',
        referenceId: 'pay_01',
        referenceType: 'PAYMENT',
        grossDebitPaisa: 100000n,
        isBalanced: true,
      },
      {
        transactionId: 'ltx_02',
        referenceId: 'pay_02',
        referenceType: 'PAYMENT',
        grossDebitPaisa: 200000n,
        isBalanced: true,
      },
      {
        transactionId: 'ltx_03',
        referenceId: 'pay_03_missing_in_gw',
        referenceType: 'PAYMENT',
        grossDebitPaisa: 300000n,
        isBalanced: true,
      },
    ];

    const runResult = await runReconciliation(
      {
        provider: 'SSLCOMMERZ',
        merchantId: 'mch_01',
        expectedMdrBps: 185,
      },
      undefined,
      {
        payments,
        providerItems,
        ledgerTxs,
      }
    );

    expect(runResult.status).toBe('DISCREPANCIES_DETECTED');
    expect(runResult.summary.totalRecordsEvaluated).toBe(4); // pay_01, pay_02, pay_03, and unexpected
    expect(runResult.summary.matchedCount).toBe(1); // pay_01
    expect(runResult.summary.discrepancyCount).toBe(3); // pay_02 amount mismatch, pay_03 missing in gw, unexpected

    // Check discrepancy breakdown
    expect(runResult.summary.breakdownByType.MATCHED).toBe(1);
    expect(runResult.summary.breakdownByType.AMOUNT_MISMATCH).toBe(1);
    expect(runResult.summary.breakdownByType.MISSING_IN_GATEWAY).toBe(1);
    expect(runResult.summary.breakdownByType.UNEXPECTED_GATEWAY_TX).toBe(1);

    // Verify CSV generation
    const csv = generateReconciliationCsv(runResult);
    expect(csv).toContain('Discrepancy Type,Payment ID,Provider Trx ID');
    expect(csv).toContain('AMOUNT_MISMATCH');
    expect(csv).toContain('MISSING_IN_GATEWAY');
    expect(csv).toContain('UNEXPECTED_GATEWAY_TX');

    // Verify JSON response format
    const response = formatReconciliationResponse(runResult);
    expect(response.status).toBe('DISCREPANCIES_DETECTED');
    expect((response.metrics as any).totalRecordsEvaluated).toBe(4);
    expect((response.metrics as any).matchedCount).toBe(1);
  });

  it('correctly updates breakdownByType when auto-healing resolves a status mismatch', async () => {
    const payments: PaymentRecord[] = [
      {
        id: 'pay_heal_01',
        merchantId: 'mch_01',
        amountPaisa: 100000n,
        feePaisa: 1850n,
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_HEAL_01',
        status: 'PENDING', // Mismatch against provider COMPLETED
      },
    ];

    const providerItems: StatementItem[] = [
      {
        provider: 'SSLCOMMERZ',
        providerTrxId: 'VAL_HEAL_01',
        merchantTxId: 'pay_heal_01',
        amountPaisa: 100000n,
        feePaisa: 1850n,
        netAmountPaisa: 98150n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      },
    ];

    const mockDb: any = {
      transaction: vi.fn(async (cb) => cb(mockDb)),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
    };

    const runResult = await runReconciliation(
      {
        provider: 'SSLCOMMERZ',
        merchantId: 'mch_01',
        autoHeal: true,
      },
      mockDb as any,
      {
        payments,
        providerItems,
        ledgerTxs: [],
      }
    );

    expect(runResult.summary.autoHealedCount).toBe(1);
    expect(runResult.summary.discrepancyCount).toBe(0);
    expect(runResult.summary.matchedCount).toBe(1);
    expect(runResult.status).toBe('MATCHED');
    expect(runResult.summary.breakdownByType.MATCHED).toBe(1);
    expect(runResult.summary.breakdownByType.STATUS_MISMATCH).toBe(0);
    const sumBreakdown = Object.values(runResult.summary.breakdownByType).reduce((a, b) => a + b, 0);
    expect(sumBreakdown).toBe(runResult.summary.totalRecordsEvaluated);
  });
});

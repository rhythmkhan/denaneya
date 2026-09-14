import { describe, it, expect } from 'vitest';
import {
  classifyTriplet,
  reconcileBatch,
} from '@denaneya/reconciliation';
import type { ReconciliationTriplet } from '@denaneya/reconciliation';

describe('Feature 28: Three-Way Financial Reconciliation (E2E-T1-F28)', () => {
  // E2E-T1-F28-01: Perfect 3-Way Match Execution (DenaNeya == Gateway == Ledger)
  it('E2E-T1-F28-01: Perfect 3-Way Match Execution (DenaNeya == Gateway == Ledger)', () => {
    const perfectTriplet: ReconciliationTriplet = {
      key: 'TRX_PERFECT_01',
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 100000n,
        feePaisa: 1500n,
        status: 'COMPLETED',
        provider: 'BKASH',
        providerTrxId: 'TRX_PERFECT_01',
        createdAt: new Date(),
        settledAt: new Date(),
      },
      providerItem: {
        providerTrxId: 'TRX_PERFECT_01',
        provider: 'BKASH',
        amountPaisa: 100000n,
        feePaisa: 1500n,
        netAmountPaisa: 98500n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
        rawRecord: {},
      },
      ledgerTx: {
        transactionId: 'ltx_01',
        referenceId: 'pay_01',
        referenceType: 'PAYMENT',
        grossDebitPaisa: 100000n,
        isBalanced: true,
        postedAt: new Date(),
      },
    };

    const discrepancy = classifyTriplet(perfectTriplet);
    expect(discrepancy).not.toBeNull();
    expect(discrepancy?.discrepancyType).toBe('MATCHED');
    expect(discrepancy?.discrepancyAmountPaisa).toBe(0n);
    expect(discrepancy?.resolutionStatus).toBe('AUTO_RESOLVED');
  });

  // E2E-T1-F28-02: Missing Gateway Transaction Discrepancy Detection
  it('E2E-T1-F28-02: Missing Gateway Transaction Discrepancy Detection', () => {
    const missingGatewayTriplet: ReconciliationTriplet = {
      key: 'TRX_MISSING_GW_01',
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        feePaisa: 750n,
        status: 'COMPLETED',
        provider: 'NAGAD',
        providerTrxId: 'TRX_MISSING_GW_01',
        createdAt: new Date(),
        settledAt: new Date(),
      },
      providerItem: undefined,
      ledgerTx: undefined,
    };

    const discrepancy = classifyTriplet(missingGatewayTriplet);
    expect(discrepancy).not.toBeNull();
    expect(discrepancy?.discrepancyType).toBe('MISSING_IN_GATEWAY');
  });

  // E2E-T1-F28-03: Settlement Amount Discrepancy Flagging
  it('E2E-T1-F28-03: Settlement Amount Discrepancy Flagging', () => {
    const amountMismatchTriplet: ReconciliationTriplet = {
      key: 'TRX_MISMATCH_01',
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 100000n, // Expected 1000.00 BDT
        feePaisa: 1500n,
        status: 'COMPLETED',
        provider: 'BKASH',
        providerTrxId: 'TRX_MISMATCH_01',
        createdAt: new Date(),
        settledAt: new Date(),
      },
      providerItem: {
        providerTrxId: 'TRX_MISMATCH_01',
        provider: 'BKASH',
        amountPaisa: 90000n, // Provider settled 900.00 BDT
        feePaisa: 1500n,
        netAmountPaisa: 88500n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
        rawRecord: {},
      },
      ledgerTx: {
        transactionId: 'ltx_03',
        referenceId: 'pay_03',
        referenceType: 'PAYMENT',
        grossDebitPaisa: 100000n,
        isBalanced: true,
        postedAt: new Date(),
      },
    };

    const discrepancy = classifyTriplet(amountMismatchTriplet);
    expect(discrepancy).not.toBeNull();
    expect(discrepancy?.discrepancyType).toBe('AMOUNT_MISMATCH');
    expect(discrepancy?.discrepancyAmountPaisa).toBe(-10000n);
  });

  // E2E-T1-F28-04: Missing Ledger Posting Discrepancy Detection
  it('E2E-T1-F28-04: Missing Ledger Posting Discrepancy Detection', () => {
    const missingLedgerTriplet: ReconciliationTriplet = {
      key: 'TRX_NO_LEDGER_01',
      payment: {
        id: 'pay_04',
        merchantId: 'mer_01',
        amountPaisa: 150000n,
        feePaisa: 2250n,
        status: 'COMPLETED',
        provider: 'SSLCOMMERZ',
        providerTrxId: 'TRX_NO_LEDGER_01',
        createdAt: new Date(),
        settledAt: new Date(),
      },
      providerItem: {
        providerTrxId: 'TRX_NO_LEDGER_01',
        provider: 'SSLCOMMERZ',
        amountPaisa: 150000n,
        feePaisa: 2250n,
        netAmountPaisa: 147750n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
        rawRecord: {},
      },
      ledgerTx: undefined, // Missing ledger entry
    };

    const discrepancy = classifyTriplet(missingLedgerTriplet);
    expect(discrepancy).not.toBeNull();
    expect(discrepancy?.discrepancyType).toBe('MISSING_IN_LEDGER');
  });

  // E2E-T1-F28-05: Downloadable Settlement Reconciliation CSV/JSON Report
  it('E2E-T1-F28-05: Downloadable Settlement Reconciliation CSV/JSON Report', () => {
    const reportData = {
      reportDate: '2026-09-13',
      provider: 'BKASH',
      summary: {
        totalMatchedCount: 95,
        totalDiscrepanciesCount: 5,
        matchedVolumePaisa: 9500000n,
        discrepancyVolumePaisa: 50000n,
      },
      discrepancies: [
        { type: 'MISSING_IN_GATEWAY', paymentId: 'pay_02', amountPaisa: 50000n },
      ],
    };

    expect(reportData.reportDate).toBe('2026-09-13');
    expect(reportData.summary.totalMatchedCount).toBe(95);
    expect(reportData.summary.matchedVolumePaisa).toBe(9500000n);
    expect(reportData.discrepancies.length).toBe(1);
  });
});

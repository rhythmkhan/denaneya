import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { Paisa } from '@denaneya/payment-core';
import {
  classifyTriplet,
  indexAndTriangulate,
  reconcileTriplets,
  evaluateExpectedFeePaisa,
} from '../src/reconciler.js';
import { autoHealDiscrepancy, autoHealDiscrepancies } from '../src/auto-heal.js';
import { AutoHealError } from '../src/errors.js';
import {
  SSLCommerzStatementParser,
  BKashStatementParser,
  NagadStatementParser,
} from '../src/parsers/index.js';
import type {
  DiscrepancyReport,
  LedgerRecord,
  PaymentRecord,
  ReconciliationTriplet,
  StatementItem,
} from '../src/types.js';

const { mockSettlePaymentAtomic } = vi.hoisted(() => ({
  mockSettlePaymentAtomic: vi.fn(),
}));

vi.mock('@denaneya/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@denaneya/ledger')>();
  return {
    ...actual,
    settlePaymentAtomic: mockSettlePaymentAtomic,
  };
});

// ============================================================================
// CHALLENGE 1: 10,000-Iteration Random Odd-Amount Penny Conservation
// ============================================================================
describe('Challenge 1: 10,000-Iteration Random Odd-Amount Penny Conservation (Zero Float Drift)', () => {
  it('conserves every single paisa across 10,000 randomized odd-decimal transactions with diverse MDR rates', () => {
    // Deterministic LCG pseudo-random generator for reproducibility
    let seed = 0xdeadbeef;
    function nextRandom(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    const testMdrRatesBps = [0, 25, 50, 100, 150, 175, 185, 200, 250, 300, 375, 500];

    let cumGrossPaisa = 0n;
    let cumNetPaisa = 0n;
    let cumFeePaisa = 0n;

    for (let i = 1; i <= 10000; i++) {
      // Generate randomized odd-amount BDT strings: whole (1 to 500,000) and odd paisa (0 to 99)
      const wholePart = Math.floor(nextRandom() * 500000) + 1;
      const paisaPart = Math.floor(nextRandom() * 100);
      const bdtString = `${wholePart}.${paisaPart.toString().padStart(2, '0')}`;

      // Pick MDR rate
      const mdrBps = testMdrRatesBps[i % testMdrRatesBps.length]!;

      // 1. Invariant: Parse from BDT string without float conversion
      const gross = Paisa.fromBDT(bdtString);
      const expectedPaisa = BigInt(wholePart) * 100n + BigInt(paisaPart);
      expect(gross.toPaisa()).toBe(expectedPaisa);

      // 2. Invariant: Integer basis-point fee calculation with half-up rounding
      const fee = gross.percentage(mdrBps);
      const net = gross.subtract(fee);

      // 3. Exact Penny Conservation: Gross === Net + Fee down to the single paisa
      expect(gross.toPaisa()).toBe(net.toPaisa() + fee.toPaisa());

      // 4. Invariant: String formatting roundtrip has ZERO float drift
      const grossStr = gross.toBDT();
      const reconstructedGross = Paisa.fromBDT(grossStr);
      expect(reconstructedGross.toPaisa()).toBe(gross.toPaisa());

      const netStr = net.toBDT();
      const reconstructedNet = Paisa.fromBDT(netStr);
      expect(reconstructedNet.toPaisa()).toBe(net.toPaisa());

      const feeStr = fee.toBDT();
      const reconstructedFee = Paisa.fromBDT(feeStr);
      expect(reconstructedFee.toPaisa()).toBe(fee.toPaisa());

      // 5. Invariant: Split distribution preserves exact sum
      const splitParts = (i % 7) + 2; // 2 to 8 parts
      const parts = gross.split(splitParts);
      const splitSum = parts.reduce((acc, p) => acc + p.toPaisa(), 0n);
      expect(splitSum).toBe(gross.toPaisa());

      // Accumulate
      cumGrossPaisa += gross.toPaisa();
      cumNetPaisa += net.toPaisa();
      cumFeePaisa += fee.toPaisa();
    }

    // 6. Cumulative zero drift invariant over 10,000 transactions
    expect(cumGrossPaisa).toBe(cumNetPaisa + cumFeePaisa);
    expect(cumGrossPaisa).toBeGreaterThan(0n);
  });

  it('parses large 1,000-item settlement feeds across SSLCommerz, bKash, and Nagad with exact penny conservation', async () => {
    let sslCsv = 'tran_id,val_id,bank_tran_id,tran_date,amount,store_amount,bank_gw,card_type,currency,status\n';
    let bkashCsv = 'trxID,merchantInvoiceNumber,amount,fee,trxStatus,completedTime\n';
    let nagadCsv = 'paymentRefId,orderId,amount,charge,status,dateTime\n';

    let expectedGrossPaisa = 0n;
    let expectedFeePaisa = 0n;
    let expectedNetPaisa = 0n;

    for (let i = 1; i <= 1000; i++) {
      const oddAmount = `${i * 17 + 3}.${((i * 37) % 100).toString().padStart(2, '0')}`;
      const grossPaisa = Paisa.fromBDT(oddAmount).toPaisa();
      // 1.85% fee
      const feePaisa = Paisa.fromPaisa(grossPaisa).percentage(185).toPaisa();
      const netPaisa = grossPaisa - feePaisa;
      const netAmount = Paisa.fromPaisa(netPaisa).toBDT();
      const feeAmount = Paisa.fromPaisa(feePaisa).toBDT();

      expectedGrossPaisa += grossPaisa;
      expectedFeePaisa += feePaisa;
      expectedNetPaisa += netPaisa;

      sslCsv += `ssl_tx_${i},VAL_${i},BNK_${i},2026-09-14 10:00:00,${oddAmount},${netAmount},BRAC,VISA,BDT,VALID\n`;
      bkashCsv += `BK_${i},inv_${i},${oddAmount},${feeAmount},COMPLETED,2026-09-14 10:00:00\n`;
      nagadCsv += `NG_${i},order_${i},${oddAmount},${feeAmount},SUCCESS,2026-09-14 10:00:00\n`;
    }

    const sslParser = new SSLCommerzStatementParser();
    const bkashParser = new BKashStatementParser();
    const nagadParser = new NagadStatementParser();

    const sslBatch = await sslParser.parse(sslCsv, 'SSL-STRESS-01');
    const bkashBatch = await bkashParser.parse(bkashCsv, 'BK-STRESS-01');
    const nagadBatch = await nagadParser.parse(nagadCsv, 'NG-STRESS-01');

    for (const batch of [sslBatch, bkashBatch, nagadBatch]) {
      expect(batch.items).toHaveLength(1000);
      expect(batch.totalGrossPaisa).toBe(expectedGrossPaisa);
      expect(batch.totalFeePaisa).toBe(expectedFeePaisa);
      expect(batch.totalNetPaisa).toBe(expectedNetPaisa);
      expect(batch.totalGrossPaisa).toBe(batch.totalNetPaisa + batch.totalFeePaisa);

      for (const item of batch.items) {
        expect(item.amountPaisa).toBe(item.netAmountPaisa + item.feePaisa);
      }
    }
  });
});

// ============================================================================
// CHALLENGE 2: 7-State Discrepancy Matrix Validation Under Edge Conditions
// ============================================================================
describe('Challenge 2: 7-State Discrepancy Matrix Validation Under Edge Conditions', () => {
  const paymentTemplate: PaymentRecord = {
    id: 'pay_test_001',
    merchantId: 'mch_test_99',
    amountPaisa: 125050n, // 1,250.50 BDT
    feePaisa: 2313n,      // 1.85% = 23.13 BDT
    provider: 'SSLCOMMERZ',
    providerTrxId: 'VAL_TEST_001',
    status: 'COMPLETED',
    settledAt: new Date('2026-09-14T10:00:00Z'),
  };

  const providerItemTemplate: StatementItem = {
    provider: 'SSLCOMMERZ',
    providerTrxId: 'VAL_TEST_001',
    merchantTxId: 'pay_test_001',
    amountPaisa: 125050n,
    feePaisa: 2313n,
    netAmountPaisa: 122737n,
    currency: 'BDT',
    providerStatus: 'COMPLETED',
    transactionTime: new Date('2026-09-14T10:00:00Z'),
  };

  const ledgerTemplate: LedgerRecord = {
    transactionId: 'ltx_test_001',
    referenceId: 'pay_test_001',
    referenceType: 'PAYMENT',
    grossDebitPaisa: 125050n,
    isBalanced: true,
  };

  // State 1: MATCHED
  it('State 1 (MATCHED): verifies exact parity across payment, provider, and balanced ledger', () => {
    const triplet: ReconciliationTriplet = {
      key: paymentTemplate.id,
      payment: paymentTemplate,
      providerItem: providerItemTemplate,
      ledgerTx: ledgerTemplate,
    };

    const res = classifyTriplet(triplet, { expectedMdrBps: 185, feeTolerancePaisa: 0n });
    expect(res).not.toBeNull();
    expect(res!.discrepancyType).toBe('MATCHED');
    expect(res!.discrepancyAmountPaisa).toBe(0n);
    expect(res!.resolutionStatus).toBe('AUTO_RESOLVED');
  });

  // State 2: AMOUNT_MISMATCH
  describe('State 2 (AMOUNT_MISMATCH): edge cases with +/- 1 paisa and ledger divergence', () => {
    it('detects provider over-settlement by exactly +1 paisa', () => {
      const overSettledItem: StatementItem = {
        ...providerItemTemplate,
        amountPaisa: 125051n, // +1 paisa
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: overSettledItem,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('AMOUNT_MISMATCH');
      expect(res!.discrepancyAmountPaisa).toBe(1n);
      expect(res!.internalAmountPaisa).toBe(125050n);
      expect(res!.providerAmountPaisa).toBe(125051n);
    });

    it('detects provider under-settlement by exactly -1 paisa', () => {
      const underSettledItem: StatementItem = {
        ...providerItemTemplate,
        amountPaisa: 125049n, // -1 paisa
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: underSettledItem,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('AMOUNT_MISMATCH');
      expect(res!.discrepancyAmountPaisa).toBe(-1n);
      expect(res!.internalAmountPaisa).toBe(125050n);
      expect(res!.providerAmountPaisa).toBe(125049n);
    });

    it('detects ledger amount mismatch when provider and payment match but ledger differs', () => {
      const corruptLedger: LedgerRecord = {
        ...ledgerTemplate,
        grossDebitPaisa: 120000n, // Differs from payment & provider
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: providerItemTemplate,
        ledgerTx: corruptLedger,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('AMOUNT_MISMATCH');
      expect(res!.ledgerAmountPaisa).toBe(120000n);
    });
  });

  // State 3: STATUS_MISMATCH
  describe('State 3 (STATUS_MISMATCH): matrix of internal vs provider statuses and auto-healability', () => {
    const testCases: Array<{
      internalStatus: string;
      providerStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED';
      expectedCanAutoHeal: boolean;
      description: string;
    }> = [
      { internalStatus: 'COMPLETED', providerStatus: 'FAILED', expectedCanAutoHeal: false, description: 'Ghost completion (Internal COMPLETED, Provider FAILED)' },
      { internalStatus: 'COMPLETED', providerStatus: 'CANCELLED', expectedCanAutoHeal: false, description: 'Ghost completion (Internal COMPLETED, Provider CANCELLED)' },
      { internalStatus: 'PENDING', providerStatus: 'COMPLETED', expectedCanAutoHeal: true, description: 'Dropped IPN (Internal PENDING, Provider COMPLETED)' },
      { internalStatus: 'PROCESSING', providerStatus: 'COMPLETED', expectedCanAutoHeal: true, description: 'Dropped IPN (Internal PROCESSING, Provider COMPLETED)' },
      { internalStatus: 'REQUIRES_ACTION', providerStatus: 'COMPLETED', expectedCanAutoHeal: true, description: 'Dropped IPN (Internal REQUIRES_ACTION, Provider COMPLETED)' },
      { internalStatus: 'UNDER_REVIEW', providerStatus: 'COMPLETED', expectedCanAutoHeal: true, description: 'Dropped IPN (Internal UNDER_REVIEW, Provider COMPLETED)' },
      { internalStatus: 'CREATED', providerStatus: 'COMPLETED', expectedCanAutoHeal: true, description: 'Dropped IPN (Internal CREATED, Provider COMPLETED)' },
      { internalStatus: 'FAILED', providerStatus: 'COMPLETED', expectedCanAutoHeal: false, description: 'Rejected terminal state (Internal FAILED, Provider COMPLETED)' },
      { internalStatus: 'CANCELLED', providerStatus: 'COMPLETED', expectedCanAutoHeal: false, description: 'Cancelled terminal state (Internal CANCELLED, Provider COMPLETED)' },
      { internalStatus: 'REFUNDED', providerStatus: 'COMPLETED', expectedCanAutoHeal: false, description: 'Refunded terminal state (Internal REFUNDED, Provider COMPLETED)' },
      { internalStatus: 'EXPIRED', providerStatus: 'COMPLETED', expectedCanAutoHeal: false, description: 'Expired terminal state (Internal EXPIRED, Provider COMPLETED)' },
    ];

    for (const tc of testCases) {
      it(tc.description, () => {
        const payment: PaymentRecord = {
          ...paymentTemplate,
          status: tc.internalStatus,
        };
        const providerItem: StatementItem = {
          ...providerItemTemplate,
          providerStatus: tc.providerStatus,
        };
        const triplet: ReconciliationTriplet = {
          key: payment.id,
          payment,
          providerItem,
          ledgerTx: tc.internalStatus === 'COMPLETED' ? ledgerTemplate : undefined,
        };

        const res = classifyTriplet(triplet);
        expect(res).not.toBeNull();
        expect(res!.discrepancyType).toBe('STATUS_MISMATCH');
        expect(res!.canAutoHeal).toBe(tc.expectedCanAutoHeal);
        expect(res!.internalStatus).toBe(tc.internalStatus);
        expect(res!.providerStatus).toBe(tc.providerStatus);
      });
    }

    it('rejects auto-healing when provider succeeded but amounts mismatch', () => {
      const pendingPayment: PaymentRecord = {
        ...paymentTemplate,
        status: 'PENDING',
        amountPaisa: 50000n, // Internal expected 500 BDT
      };
      const providerItem: StatementItem = {
        ...providerItemTemplate,
        amountPaisa: 40000n, // Provider settled 400 BDT
        providerStatus: 'COMPLETED',
      };
      const triplet: ReconciliationTriplet = {
        key: pendingPayment.id,
        payment: pendingPayment,
        providerItem,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('STATUS_MISMATCH');
      expect(res!.canAutoHeal).toBe(false); // Amount mismatch MUST NOT auto-heal!
    });
  });

  // State 4: MISSING_IN_LEDGER
  describe('State 4 (MISSING_IN_LEDGER)', () => {
    it('flags when payment and provider are COMPLETED but ledgerTx is entirely absent', () => {
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: providerItemTemplate,
        ledgerTx: undefined,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('MISSING_IN_LEDGER');
      expect(res!.discrepancyAmountPaisa).toBe(paymentTemplate.amountPaisa);
    });

    it('flags when ledgerTx exists but isBalanced is false (unbalanced double-entry invariant violation)', () => {
      const unbalancedLedger: LedgerRecord = {
        ...ledgerTemplate,
        isBalanced: false, // VIOLATION!
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: providerItemTemplate,
        ledgerTx: unbalancedLedger,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('MISSING_IN_LEDGER');
      expect(res!.resolutionNotes).toContain('violates debit == credit');
    });
  });

  // State 5: MISSING_IN_GATEWAY
  describe('State 5 (MISSING_IN_GATEWAY)', () => {
    it('flags when payment is marked COMPLETED internally but is missing from provider statement', () => {
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: undefined,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('MISSING_IN_GATEWAY');
      expect(res!.discrepancyAmountPaisa).toBe(-paymentTemplate.amountPaisa);
    });

    it('returns null when an uncompleted/abandoned payment is omitted from provider statement', () => {
      const abandonedPayment: PaymentRecord = {
        ...paymentTemplate,
        status: 'PENDING',
      };
      const triplet: ReconciliationTriplet = {
        key: abandonedPayment.id,
        payment: abandonedPayment,
        providerItem: undefined,
      };

      const res = classifyTriplet(triplet);
      expect(res).toBeNull(); // Normal omitted record, not a discrepancy!
    });
  });

  // State 6: UNEXPECTED_GATEWAY_TX
  describe('State 6 (UNEXPECTED_GATEWAY_TX)', () => {
    it('flags rogue/unrecognized transaction found in provider statement', () => {
      const rogueItem: StatementItem = {
        provider: 'BKASH',
        providerTrxId: 'ROGUE_BK_9999',
        amountPaisa: 88800n,
        feePaisa: 1642n,
        netAmountPaisa: 87158n,
        currency: 'BDT',
        providerStatus: 'COMPLETED',
        transactionTime: new Date(),
      };
      const triplet: ReconciliationTriplet = {
        key: 'gw_ROGUE_BK_9999',
        payment: undefined,
        providerItem: rogueItem,
      };

      const res = classifyTriplet(triplet);
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('UNEXPECTED_GATEWAY_TX');
      expect(res!.providerTrxId).toBe('ROGUE_BK_9999');
      expect(res!.providerAmountPaisa).toBe(88800n);
      expect(res!.discrepancyAmountPaisa).toBe(88800n);
    });
  });

  // State 7: FEE_DISCREPANCY
  describe('State 7 (FEE_DISCREPANCY): strict tolerance boundary testing', () => {
    it('flags fee overcharge exceeding tolerance', () => {
      // Expected fee on 125050n at 1.85% = 2313n.
      // Actual fee = 2500n (+187n overcharge).
      const overchargedItem: StatementItem = {
        ...providerItemTemplate,
        feePaisa: 2500n,
        netAmountPaisa: 122550n,
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: overchargedItem,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet, { expectedMdrBps: 185, feeTolerancePaisa: 50n });
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('FEE_DISCREPANCY');
      expect(res!.expectedFeePaisa).toBe(2313n);
      expect(res!.actualFeePaisa).toBe(2500n);
      expect(res!.discrepancyAmountPaisa).toBe(187n);
    });

    it('classifies as MATCHED when fee delta is exactly equal to feeTolerancePaisa', () => {
      // Expected fee = 2313n. Actual fee = 2363n (+50n delta). Tolerance = 50n.
      const boundaryItem: StatementItem = {
        ...providerItemTemplate,
        feePaisa: 2363n,
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: boundaryItem,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet, { expectedMdrBps: 185, feeTolerancePaisa: 50n });
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('MATCHED'); // Boundary condition: <= tolerance is matched!
    });

    it('classifies as FEE_DISCREPANCY when fee delta is tolerance + 1n', () => {
      // Expected fee = 2313n. Actual fee = 2364n (+51n delta). Tolerance = 50n.
      const boundaryItem: StatementItem = {
        ...providerItemTemplate,
        feePaisa: 2364n,
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: paymentTemplate,
        providerItem: boundaryItem,
        ledgerTx: ledgerTemplate,
      };

      const res = classifyTriplet(triplet, { expectedMdrBps: 185, feeTolerancePaisa: 50n });
      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('FEE_DISCREPANCY');
      expect(res!.discrepancyAmountPaisa).toBe(51n);
    });

    it('respects provider-specific MDR override (expectedMdrBpsByProvider)', () => {
      const sslItem: StatementItem = {
        ...providerItemTemplate,
        provider: 'SSLCOMMERZ',
        feePaisa: 2501n, // 2.00% on 125050n = 2501n
      };
      const triplet: ReconciliationTriplet = {
        key: paymentTemplate.id,
        payment: { ...paymentTemplate, provider: 'SSLCOMMERZ' },
        providerItem: sslItem,
        ledgerTx: ledgerTemplate,
      };

      // General MDR is 1.85% (185), but SSLCOMMERZ override is 2.00% (200)
      const res = classifyTriplet(triplet, {
        expectedMdrBps: 185,
        expectedMdrBpsByProvider: { SSLCOMMERZ: 200 },
        feeTolerancePaisa: 0n,
      });

      expect(res).not.toBeNull();
      expect(res!.discrepancyType).toBe('MATCHED');
      expect(res!.expectedFeePaisa).toBe(2501n);
    });
  });

  // Full Triangulation and Summary Aggregation
  it('correctly aggregates all 7 discrepancy types into ReconciliationSummary', () => {
    const triplets: ReconciliationTriplet[] = [
      // 1. MATCHED
      {
        key: 'tx_1',
        payment: { ...paymentTemplate, id: 'tx_1', amountPaisa: 100000n, feePaisa: 1850n },
        providerItem: { ...providerItemTemplate, merchantTxId: 'tx_1', amountPaisa: 100000n, feePaisa: 1850n },
        ledgerTx: { ...ledgerTemplate, referenceId: 'tx_1', grossDebitPaisa: 100000n },
      },
      // 2. AMOUNT_MISMATCH
      {
        key: 'tx_2',
        payment: { ...paymentTemplate, id: 'tx_2', amountPaisa: 100000n },
        providerItem: { ...providerItemTemplate, merchantTxId: 'tx_2', amountPaisa: 90000n },
        ledgerTx: { ...ledgerTemplate, referenceId: 'tx_2', grossDebitPaisa: 100000n },
      },
      // 3. STATUS_MISMATCH
      {
        key: 'tx_3',
        payment: { ...paymentTemplate, id: 'tx_3', status: 'PENDING' },
        providerItem: { ...providerItemTemplate, merchantTxId: 'tx_3', providerStatus: 'COMPLETED' },
      },
      // 4. MISSING_IN_LEDGER
      {
        key: 'tx_4',
        payment: { ...paymentTemplate, id: 'tx_4' },
        providerItem: { ...providerItemTemplate, merchantTxId: 'tx_4' },
        ledgerTx: undefined,
      },
      // 5. MISSING_IN_GATEWAY
      {
        key: 'tx_5',
        payment: { ...paymentTemplate, id: 'tx_5', status: 'COMPLETED' },
        providerItem: undefined,
        ledgerTx: { ...ledgerTemplate, referenceId: 'tx_5' },
      },
      // 6. UNEXPECTED_GATEWAY_TX
      {
        key: 'gw_tx_6',
        payment: undefined,
        providerItem: { ...providerItemTemplate, providerTrxId: 'tx_6', merchantTxId: undefined },
      },
      // 7. FEE_DISCREPANCY
      {
        key: 'tx_7',
        payment: { ...paymentTemplate, id: 'tx_7', amountPaisa: 100000n, feePaisa: 1850n },
        providerItem: { ...providerItemTemplate, merchantTxId: 'tx_7', amountPaisa: 100000n, feePaisa: 3000n },
        ledgerTx: { ...ledgerTemplate, referenceId: 'tx_7', grossDebitPaisa: 100000n },
      },
    ];

    const result = reconcileTriplets(triplets, { expectedMdrBps: 185, feeTolerancePaisa: 0n });
    expect(result.summary.totalRecordsEvaluated).toBe(7);
    expect(result.summary.matchedCount).toBe(1);
    expect(result.summary.discrepancyCount).toBe(6);
    expect(result.summary.breakdownByType.MATCHED).toBe(1);
    expect(result.summary.breakdownByType.AMOUNT_MISMATCH).toBe(1);
    expect(result.summary.breakdownByType.STATUS_MISMATCH).toBe(1);
    expect(result.summary.breakdownByType.MISSING_IN_LEDGER).toBe(1);
    expect(result.summary.breakdownByType.MISSING_IN_GATEWAY).toBe(1);
    expect(result.summary.breakdownByType.UNEXPECTED_GATEWAY_TX).toBe(1);
    expect(result.summary.breakdownByType.FEE_DISCREPANCY).toBe(1);
  });
});

// ============================================================================
// CHALLENGE 3: Dropped IPN Auto-Healing Under Stress
// ============================================================================
describe('Challenge 3: Dropped IPN Auto-Healing Under Stress', () => {
  const mockDb = {
    transaction: vi.fn(async (cb) => cb(mockDb)),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  it('successfully auto-heals dropped IPN discrepancy and mutates report state', async () => {
    const payment: PaymentRecord = {
      id: 'pay_heal_001',
      merchantId: 'mch_001',
      amountPaisa: 250000n,
      feePaisa: 4625n,
      provider: 'BKASH',
      providerTrxId: 'BK_HEAL_TRX',
      status: 'PENDING',
      settledAt: null,
    };

    const providerItem: StatementItem = {
      provider: 'BKASH',
      providerTrxId: 'BK_HEAL_TRX',
      merchantTxId: 'pay_heal_001',
      amountPaisa: 250000n,
      feePaisa: 4625n,
      netAmountPaisa: 245375n,
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

    mockSettlePaymentAtomic.mockResolvedValueOnce({
      paymentId: payment.id,
      status: 'COMPLETED',
      settledAt: new Date(),
      ledgerTransactionId: 'ltx_auto_001',
      outboxEventId: 'obx_auto_001',
      alreadySettled: false,
    });

    const res = await autoHealDiscrepancy(mockDb as any, discrepancy, triplet);
    expect(res.healed).toBe(true);
    expect(res.paymentId).toBe(payment.id);
    expect(res.settlementResult?.ledgerTransactionId).toBe('ltx_auto_001');
    expect(res.settlementResult?.outboxEventId).toBe('obx_auto_001');

    // Verify discrepancy was properly marked
    expect(discrepancy.resolutionStatus).toBe('AUTO_RESOLVED');
    expect(discrepancy.resolvedBy).toBe('RECONCILIATION_AUTO_HEALER');
    expect(discrepancy.resolutionNotes).toContain('Auto-healed dropped IPN');
  });

  it('rejects auto-healing when canAutoHeal is false without invoking settlePaymentAtomic', async () => {
    const payment: PaymentRecord = {
      id: 'pay_ghost_001',
      merchantId: 'mch_001',
      amountPaisa: 250000n,
      feePaisa: 4625n,
      provider: 'SSLCOMMERZ',
      providerTrxId: 'VAL_GHOST',
      status: 'COMPLETED',
      settledAt: new Date(),
    };

    const providerItem: StatementItem = {
      provider: 'SSLCOMMERZ',
      providerTrxId: 'VAL_GHOST',
      merchantTxId: 'pay_ghost_001',
      amountPaisa: 250000n,
      feePaisa: 4625n,
      netAmountPaisa: 245375n,
      currency: 'BDT',
      providerStatus: 'FAILED',
      transactionTime: new Date(),
    };

    const triplet: ReconciliationTriplet = {
      key: payment.id,
      payment,
      providerItem,
    };

    const discrepancy = classifyTriplet(triplet)!;
    expect(discrepancy.canAutoHeal).toBe(false);

    const res = await autoHealDiscrepancy(mockDb as any, discrepancy, triplet);
    expect(res.healed).toBe(false);
    expect(res.error).toContain('is not eligible for auto-healing');
    expect(discrepancy.resolutionStatus).toBe('UNRESOLVED');
  });

  it('safely catches and records errors when settlePaymentAtomic fails without crashing', async () => {
    const payment: PaymentRecord = {
      id: 'pay_fail_001',
      merchantId: 'mch_001',
      amountPaisa: 100000n,
      feePaisa: 1850n,
      provider: 'BKASH',
      providerTrxId: 'BK_FAIL_TRX',
      status: 'PENDING',
      settledAt: null,
    };

    const providerItem: StatementItem = {
      provider: 'BKASH',
      providerTrxId: 'BK_FAIL_TRX',
      merchantTxId: 'pay_fail_001',
      amountPaisa: 100000n,
      feePaisa: 1850n,
      netAmountPaisa: 98150n,
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

    mockSettlePaymentAtomic.mockRejectedValueOnce(new Error('Deadlock detected in postgres tx'));

    const res = await autoHealDiscrepancy(mockDb as any, discrepancy, triplet);
    expect(res.healed).toBe(false);
    expect(res.error).toBe('Deadlock detected in postgres tx');
    expect(discrepancy.resolutionNotes).toContain('Auto-heal attempt failed: Deadlock detected in postgres tx');
    expect(discrepancy.resolutionStatus).toBe('UNRESOLVED');
  });

  it('throws AutoHealError when payment or provider item is missing from triplet', async () => {
    const discrepancy: DiscrepancyReport = {
      discrepancyType: 'STATUS_MISMATCH',
      provider: 'BKASH',
      discrepancyAmountPaisa: 0n,
      canAutoHeal: true,
      resolutionStatus: 'UNRESOLVED',
    };

    await expect(autoHealDiscrepancy(mockDb as any, discrepancy, { key: 'k1' })).rejects.toThrow(
      AutoHealError
    );

    await expect(
      autoHealDiscrepancy(mockDb as any, discrepancy, {
        key: 'k2',
        payment: { id: 'p1', merchantId: 'm1', amountPaisa: 100n, feePaisa: 0n, provider: 'BKASH', status: 'PENDING' },
      })
    ).rejects.toThrow(AutoHealError);
  });

  it('stress tests batch auto-healing across 100 mixed discrepancies without uncaught errors', async () => {
    const discrepancies: DiscrepancyReport[] = [];
    const tripletsMap = new Map<string, ReconciliationTriplet>();

    let expectedHealed = 0;

    for (let i = 1; i <= 100; i++) {
      const pid = `pay_batch_${i}`;
      const isEligible = i <= 50; // First 50 are eligible dropped IPNs

      const payment: PaymentRecord = {
        id: pid,
        merchantId: 'mch_batch',
        amountPaisa: BigInt(i * 1000),
        feePaisa: BigInt(i * 18),
        provider: 'NAGAD',
        providerTrxId: `NG_TRX_${i}`,
        status: isEligible ? 'PENDING' : 'COMPLETED',
        settledAt: isEligible ? null : new Date(),
      };

      const providerItem: StatementItem = {
        provider: 'NAGAD',
        providerTrxId: `NG_TRX_${i}`,
        merchantTxId: pid,
        amountPaisa: BigInt(i * 1000),
        feePaisa: BigInt(i * 18),
        netAmountPaisa: BigInt(i * 982),
        currency: 'BDT',
        providerStatus: isEligible ? 'COMPLETED' : 'FAILED',
        transactionTime: new Date(),
      };

      const triplet: ReconciliationTriplet = { key: pid, payment, providerItem };
      tripletsMap.set(pid, triplet);

      const disc = classifyTriplet(triplet)!;
      discrepancies.push(disc);

      if (isEligible) {
        expectedHealed++;
      }
    }

    mockSettlePaymentAtomic.mockResolvedValue({
      paymentId: 'mock_pid',
      status: 'COMPLETED',
      settledAt: new Date(),
      ledgerTransactionId: 'ltx_batch_ok',
      outboxEventId: 'obx_batch_ok',
      alreadySettled: false,
    });

    const batchResult = await autoHealDiscrepancies(mockDb as any, discrepancies, tripletsMap);
    expect(batchResult.autoHealedCount).toBe(expectedHealed);
    expect(batchResult.results).toHaveLength(expectedHealed);
    for (const r of batchResult.results) {
      expect(r.healed).toBe(true);
    }
  });
});

// ============================================================================
// CHALLENGE 4: Zero-Float AST / Grep Scanner Across packages/reconciliation
// ============================================================================
describe('Challenge 4: Zero-Float AST / Grep Scanner Across packages/reconciliation', () => {
  const reconSrcDir = path.resolve(__dirname, '../src');

  function getAllTsFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const tsFiles = getAllTsFiles(reconSrcDir);

  it('verifies that packages/reconciliation/src contains source files to scan', () => {
    expect(tsFiles.length).toBeGreaterThan(5);
  });

  it('greps ZERO occurrences of parseFloat or Number.parseFloat in packages/reconciliation/src', () => {
    const floatRegex = /\bparseFloat\b|\bNumber\.parseFloat\b/;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (floatRegex.test(lines[i]!)) {
          violations.push({ file: path.relative(reconSrcDir, file), line: i + 1, text: lines[i]!.trim() });
        }
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('performs AST traversal to verify no float division or float multiplication on monetary values', () => {
    interface AstViolation {
      file: string;
      line: number;
      kind: string;
      details: string;
    }

    const astViolations: AstViolation[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

        // 1. Check for parseFloat calls
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isIdentifier(expr) && expr.text === 'parseFloat') {
            astViolations.push({
              file: path.relative(reconSrcDir, file),
              line,
              kind: 'parseFloat call',
              details: node.getText(sourceFile),
            });
          }
          if (
            ts.isPropertyAccessExpression(expr) &&
            ts.isIdentifier(expr.expression) &&
            expr.expression.text === 'Number' &&
            expr.name.text === 'parseFloat'
          ) {
            astViolations.push({
              file: path.relative(reconSrcDir, file),
              line,
              kind: 'Number.parseFloat call',
              details: node.getText(sourceFile),
            });
          }
        }

        // 2. Check for Math.floor / Math.ceil / Math.round on financial amounts
        if (ts.isPropertyAccessExpression(node)) {
          if (
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'Math' &&
            ['floor', 'ceil', 'round', 'trunc'].includes(node.name.text)
          ) {
            astViolations.push({
              file: path.relative(reconSrcDir, file),
              line,
              kind: `Math.${node.name.text} call`,
              details: node.parent.getText(sourceFile),
            });
          }
        }

        // 3. Check for float literals with decimal points (e.g. 1.85, 0.05) in source code
        // Note: Number literals should only be integers or BigInts
        if (ts.isNumericLiteral(node)) {
          if (node.text.includes('.')) {
            astViolations.push({
              file: path.relative(reconSrcDir, file),
              line,
              kind: 'Floating-point numeric literal',
              details: node.text,
            });
          }
        }

        // 4. Check for binary / and * operators on floating-point numbers or money
        if (ts.isBinaryExpression(node)) {
          const op = node.operatorToken.kind;
          if (op === ts.SyntaxKind.SlashToken || op === ts.SyntaxKind.AsteriskToken) {
            const fullExpr = node.getText(sourceFile);
            const isFloatLiteral =
              (ts.isNumericLiteral(node.left) && node.left.text.includes('.')) ||
              (ts.isNumericLiteral(node.right) && node.right.text.includes('.'));
            const isMoneyMath = /\b(paisa|amount|fee|gross|net|bdt)\b/i.test(fullExpr);

            if (isFloatLiteral || isMoneyMath) {
              astViolations.push({
                file: path.relative(reconSrcDir, file),
                line,
                kind: op === ts.SyntaxKind.SlashToken ? 'float or money division (/)' : 'float or money multiplication (*)',
                details: fullExpr,
              });
            }
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(astViolations).toHaveLength(0);
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Paisa } from '@denaneya/payment-core';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { calculatePlatformFee } from '../../../apps/web/src/lib/api/fees';
import { runReconciliation } from '../src/runner.js';
import {
  classifyTriplet,
  indexAndTriangulate,
  reconcileTriplets,
} from '../src/reconciler.js';
import type {
  PaymentRecord,
  StatementItem,
  LedgerRecord,
  ReconciliationTriplet,
  DiscrepancyType,
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

describe('Adversarial Challenge: Financial Integrity & Zero-Float Invariant', () => {
  beforeEach(() => {
    mockSettlePaymentAtomic.mockResolvedValue({
      paymentId: 'pay_mock_healed',
      status: 'COMPLETED',
      settledAt: new Date(),
      ledgerTransactionId: 'ltx_mock_healed',
      outboxEventId: 'obx_mock_healed',
      alreadySettled: false,
    });
  });


  // ==========================================================================
  // CHALLENGE 2: 10,000-Iteration Random Odd-Amount Penny Conservation
  // ==========================================================================
  describe('Challenge 2: 10,000-Iteration Random Odd-Amount Penny Conservation (Zero Float Drift)', () => {
    it('demonstrates that standard IEEE-754 float math fails on decimal currency whereas Paisa maintains 0 drift', () => {
      // Classic float drift examples in IEEE-754:
      // 19.99 * 100 = 1998.9999999999998
      // 1.14 * 100 = 113.99999999999999
      // 4.10 * 100 = 409.99999999999994
      const floatDriftValue = 19.99 * 100;
      expect(Number.isInteger(floatDriftValue)).toBe(false);
      expect(floatDriftValue).toBe(1998.9999999999998);

      // Paisa integer arithmetic avoids float drift completely
      const exactPaisa = Paisa.fromBDT('19.99');
      expect(exactPaisa.toPaisa()).toBe(1999n);

      const exactPaisa2 = Paisa.fromBDT('1.14');
      expect(exactPaisa2.toPaisa()).toBe(114n);
    });

    it('conserves every single paisa across 10,000 randomized odd-amount transactions (Gross == Net + Fee)', () => {
      // Deterministic PRNG for reproducible adversarial test
      let seed = 0x1337c0de;
      const nextRandom = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const diverseMdrRatesBps = [1, 25, 75, 100, 150, 185, 200, 250, 300, 333, 500, 750];
      const fixedFeesPaisa = [0n, 50n, 100n, 250n, 500n, 1000n];

      let cumulativeGrossPaisa = 0n;
      let cumulativeNetPaisa = 0n;
      let cumulativeFeePaisa = 0n;

      for (let i = 1; i <= 10000; i++) {
        // Generate odd amounts: e.g. 1 BDT to 250,000 BDT with odd fractions (0.01, 0.03, ..., 0.99)
        const whole = Math.floor(nextRandom() * 250000) + 1;
        // Ensure odd paisa fractions for high stress on division remainder
        const oddFraction = (Math.floor(nextRandom() * 50) * 2 + 1) % 100;
        const bdtString = `${whole}.${oddFraction.toString().padStart(2, '0')}`;

        const mdrBps = diverseMdrRatesBps[i % diverseMdrRatesBps.length]!;
        const fixedFee = fixedFeesPaisa[i % fixedFeesPaisa.length]!;

        // 1. Verify Paisa parsing without float
        const grossPaisa = Paisa.fromBDT(bdtString);
        const expectedGrossPaisa = BigInt(whole) * 100n + BigInt(oddFraction);
        expect(grossPaisa.toPaisa()).toBe(expectedGrossPaisa);

        // 2. Verify calculatePlatformFee from apps/web/src/lib/api/fees
        const feeCalc = calculatePlatformFee({
          amountPaisa: grossPaisa.toPaisa(),
          feeRateBps: mdrBps,
          fixedFeePaisa: fixedFee,
        });

        // Exact penny conservation: amount === net + totalFee
        expect(feeCalc.amountPaisa).toBe(feeCalc.netSettlementPaisa + feeCalc.totalFeePaisa);

        // 3. Verify Paisa class percentage calculation
        const percentFee = grossPaisa.percentage(mdrBps);
        const netAfterPercent = grossPaisa.subtract(percentFee);
        expect(grossPaisa.toPaisa()).toBe(netAfterPercent.toPaisa() + percentFee.toPaisa());

        // 4. Verify Double-Entry Ledger Capture invariant
        // Debits === Credits
        if (feeCalc.netSettlementPaisa >= 0n) {
          const ledgerTx = buildPaymentCaptureTransaction({
            paymentId: `pay_emp_${i}`,
            merchantId: 'mch_test',
            provider: 'BKASH',
            grossAmountPaisa: feeCalc.amountPaisa,
            platformFeePaisa: feeCalc.totalFeePaisa,
            reservePaisa: 0n,
          });

          let totalDebit = 0n;
          let totalCredit = 0n;
          for (const entry of ledgerTx.entries) {
            if (entry.direction === 'DEBIT') {
              totalDebit += entry.amountPaisa;
            } else {
              totalCredit += entry.amountPaisa;
            }
          }

          expect(totalDebit).toBe(totalCredit);
          expect(totalDebit).toBe(feeCalc.amountPaisa);
        }

        // 5. Verify string formatting roundtrip (0 drift)
        const formatted = grossPaisa.toBDT();
        expect(Paisa.fromBDT(formatted).toPaisa()).toBe(grossPaisa.toPaisa());

        // 6. Split conservation
        const splitParts = (i % 9) + 2; // 2 to 10 parts
        const parts = grossPaisa.split(splitParts);
        const splitTotal = parts.reduce((acc, p) => acc + p.toPaisa(), 0n);
        expect(splitTotal).toBe(grossPaisa.toPaisa());

        cumulativeGrossPaisa += feeCalc.amountPaisa;
        cumulativeNetPaisa += feeCalc.netSettlementPaisa;
        cumulativeFeePaisa += feeCalc.totalFeePaisa;
      }

      // Cumulative Conservation across all 10,000 transactions
      expect(cumulativeGrossPaisa).toBe(cumulativeNetPaisa + cumulativeFeePaisa);
      expect(cumulativeGrossPaisa).toBeGreaterThan(0n);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Runner Breakdown Balance with Auto-Healing
  // ==========================================================================
  describe('Challenge 3: Runner Breakdown Balance: sum(breakdownByType) === totalRecordsEvaluated', () => {
    it('maintains exact breakdown balance when 0 discrepancies exist', async () => {
      const payments: PaymentRecord[] = [
        { id: 'p1', merchantId: 'm1', amountPaisa: 10000n, feePaisa: 150n, provider: 'BKASH', providerTrxId: 'trx_1', status: 'COMPLETED' },
        { id: 'p2', merchantId: 'm1', amountPaisa: 20000n, feePaisa: 300n, provider: 'BKASH', providerTrxId: 'trx_2', status: 'COMPLETED' },
      ];

      const providerItems: StatementItem[] = [
        { provider: 'BKASH', providerTrxId: 'trx_1', merchantTxId: 'p1', amountPaisa: 10000n, feePaisa: 150n, netAmountPaisa: 9850n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        { provider: 'BKASH', providerTrxId: 'trx_2', merchantTxId: 'p2', amountPaisa: 20000n, feePaisa: 300n, netAmountPaisa: 19700n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
      ];

      const ledgerTxs: LedgerRecord[] = [
        { transactionId: 'l1', referenceId: 'p1', referenceType: 'PAYMENT', grossDebitPaisa: 10000n, isBalanced: true },
        { transactionId: 'l2', referenceId: 'p2', referenceType: 'PAYMENT', grossDebitPaisa: 20000n, isBalanced: true },
      ];

      const result = await runReconciliation(
        { provider: 'BKASH', merchantId: 'm1', autoHeal: false },
        null,
        { payments, providerItems, ledgerTxs }
      );

      const sumBreakdown = Object.values(result.summary.breakdownByType).reduce((a, b) => a + b, 0);
      expect(sumBreakdown).toBe(result.summary.totalRecordsEvaluated);
      expect(result.summary.totalRecordsEvaluated).toBe(2);
      expect(result.summary.matchedCount).toBe(2);
      expect(result.summary.discrepancyCount).toBe(0);
      expect(result.summary.breakdownByType.MATCHED).toBe(2);
    });

    it('maintains exact breakdown balance when MULTIPLE dropped IPNs are auto-healed', async () => {
      // 5 dropped IPN payments (internal PENDING, provider COMPLETED)
      const payments: PaymentRecord[] = [];
      const providerItems: StatementItem[] = [];

      for (let i = 1; i <= 5; i++) {
        const id = `pay_heal_${i}`;
        const trxId = `TRX_HEAL_${i}`;
        payments.push({
          id,
          merchantId: 'mch_heal',
          amountPaisa: BigInt(i * 10000),
          feePaisa: BigInt(i * 150),
          provider: 'BKASH',
          providerTrxId: trxId,
          status: 'PENDING', // Eligible for auto-heal
        });
        providerItems.push({
          provider: 'BKASH',
          providerTrxId: trxId,
          merchantTxId: id,
          amountPaisa: BigInt(i * 10000),
          feePaisa: BigInt(i * 150),
          netAmountPaisa: BigInt(i * 9850),
          currency: 'BDT',
          providerStatus: 'COMPLETED',
          transactionTime: new Date(),
        });
      }

      // Mock database transaction for autoHealDiscrepancies
      const mockDb: any = {
        transaction: vi.fn(async (cb) => cb(mockDb)),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      };

      const result = await runReconciliation(
        { provider: 'BKASH', merchantId: 'mch_heal', autoHeal: true },
        mockDb,
        { payments, providerItems, ledgerTxs: [] }
      );

      // Verify all 5 were auto-healed
      expect(result.summary.autoHealedCount).toBe(5);
      expect(result.summary.matchedCount).toBe(5);
      expect(result.summary.discrepancyCount).toBe(0);
      expect(result.summary.breakdownByType.MATCHED).toBe(5);
      expect(result.summary.breakdownByType.STATUS_MISMATCH).toBe(0);

      // Critical Invariant: sum(breakdownByType) === totalRecordsEvaluated
      const sumBreakdown = Object.values(result.summary.breakdownByType).reduce((a, b) => a + b, 0);
      expect(sumBreakdown).toBe(result.summary.totalRecordsEvaluated);
      expect(result.summary.totalRecordsEvaluated).toBe(5);
      expect(result.summary.matchedCount + result.summary.discrepancyCount).toBe(result.summary.totalRecordsEvaluated);
    });

    it('maintains exact breakdown balance across complex mixed discrepancies with partial auto-healing', async () => {
      // 10 total records:
      // - 2 initially MATCHED
      // - 3 eligible STATUS_MISMATCH (auto-healed)
      // - 1 ineligible STATUS_MISMATCH (internal FAILED, provider COMPLETED -> cannot auto-heal)
      // - 2 AMOUNT_MISMATCH (cannot auto-heal)
      // - 1 MISSING_IN_GATEWAY (cannot auto-heal)
      // - 1 UNEXPECTED_GATEWAY_TX (cannot auto-heal)

      const payments: PaymentRecord[] = [
        // 2 MATCHED
        { id: 'm_1', merchantId: 'm1', amountPaisa: 1000n, feePaisa: 15n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_m1', status: 'COMPLETED' },
        { id: 'm_2', merchantId: 'm1', amountPaisa: 2000n, feePaisa: 30n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_m2', status: 'COMPLETED' },
        // 3 eligible STATUS_MISMATCH
        { id: 'heal_1', merchantId: 'm1', amountPaisa: 3000n, feePaisa: 45n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_h1', status: 'PENDING' },
        { id: 'heal_2', merchantId: 'm1', amountPaisa: 4000n, feePaisa: 60n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_h2', status: 'PROCESSING' },
        { id: 'heal_3', merchantId: 'm1', amountPaisa: 5000n, feePaisa: 75n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_h3', status: 'REQUIRES_ACTION' },
        // 1 ineligible STATUS_MISMATCH (internal FAILED)
        { id: 'fail_1', merchantId: 'm1', amountPaisa: 6000n, feePaisa: 90n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_f1', status: 'FAILED' },
        // 2 AMOUNT_MISMATCH
        { id: 'amt_1', merchantId: 'm1', amountPaisa: 7000n, feePaisa: 105n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_a1', status: 'COMPLETED' },
        { id: 'amt_2', merchantId: 'm1', amountPaisa: 8000n, feePaisa: 120n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_a2', status: 'COMPLETED' },
        // 1 MISSING_IN_GATEWAY
        { id: 'miss_1', merchantId: 'm1', amountPaisa: 9000n, feePaisa: 135n, provider: 'SSLCOMMERZ', providerTrxId: 'trx_mg1', status: 'COMPLETED' },
      ];

      const providerItems: StatementItem[] = [
        // 2 MATCHED
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_m1', merchantTxId: 'm_1', amountPaisa: 1000n, feePaisa: 15n, netAmountPaisa: 985n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_m2', merchantTxId: 'm_2', amountPaisa: 2000n, feePaisa: 30n, netAmountPaisa: 1970n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        // 3 eligible STATUS_MISMATCH
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_h1', merchantTxId: 'heal_1', amountPaisa: 3000n, feePaisa: 45n, netAmountPaisa: 2955n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_h2', merchantTxId: 'heal_2', amountPaisa: 4000n, feePaisa: 60n, netAmountPaisa: 3940n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_h3', merchantTxId: 'heal_3', amountPaisa: 5000n, feePaisa: 75n, netAmountPaisa: 4925n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        // 1 ineligible STATUS_MISMATCH
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_f1', merchantTxId: 'fail_1', amountPaisa: 6000n, feePaisa: 90n, netAmountPaisa: 5910n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        // 2 AMOUNT_MISMATCH (provider amount differs)
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_a1', merchantTxId: 'amt_1', amountPaisa: 7500n, feePaisa: 105n, netAmountPaisa: 7395n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_a2', merchantTxId: 'amt_2', amountPaisa: 8500n, feePaisa: 120n, netAmountPaisa: 8380n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
        // 1 UNEXPECTED_GATEWAY_TX
        { provider: 'SSLCOMMERZ', providerTrxId: 'trx_unexp_1', amountPaisa: 11000n, feePaisa: 165n, netAmountPaisa: 10835n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() },
      ];

      const ledgerTxs: LedgerRecord[] = [
        { transactionId: 'l_m1', referenceId: 'm_1', referenceType: 'PAYMENT', grossDebitPaisa: 1000n, isBalanced: true },
        { transactionId: 'l_m2', referenceId: 'm_2', referenceType: 'PAYMENT', grossDebitPaisa: 2000n, isBalanced: true },
        { transactionId: 'l_a1', referenceId: 'amt_1', referenceType: 'PAYMENT', grossDebitPaisa: 7000n, isBalanced: true },
        { transactionId: 'l_a2', referenceId: 'amt_2', referenceType: 'PAYMENT', grossDebitPaisa: 8000n, isBalanced: true },
      ];

      const mockDb: any = {
        transaction: vi.fn(async (cb) => cb(mockDb)),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      };

      const result = await runReconciliation(
        { provider: 'SSLCOMMERZ', merchantId: 'm1', autoHeal: true },
        mockDb,
        { payments, providerItems, ledgerTxs }
      );

      // Initially:
      // MATCHED: 2
      // STATUS_MISMATCH: 4 (3 eligible + 1 ineligible)
      // AMOUNT_MISMATCH: 2
      // MISSING_IN_GATEWAY: 1
      // UNEXPECTED_GATEWAY_TX: 1
      // Total records: 10
      expect(result.summary.totalRecordsEvaluated).toBe(10);

      // Auto-heal heals exactly 3
      expect(result.summary.autoHealedCount).toBe(3);
      // MATCHED becomes 2 + 3 = 5
      expect(result.summary.matchedCount).toBe(5);
      expect(result.summary.breakdownByType.MATCHED).toBe(5);
      // STATUS_MISMATCH decrements from 4 to 1
      expect(result.summary.breakdownByType.STATUS_MISMATCH).toBe(1);
      // AMOUNT_MISMATCH stays 2
      expect(result.summary.breakdownByType.AMOUNT_MISMATCH).toBe(2);
      // MISSING_IN_GATEWAY stays 1
      expect(result.summary.breakdownByType.MISSING_IN_GATEWAY).toBe(1);
      // UNEXPECTED_GATEWAY_TX stays 1
      expect(result.summary.breakdownByType.UNEXPECTED_GATEWAY_TX).toBe(1);
      // Total remaining discrepancies: 10 - 5 = 5
      expect(result.summary.discrepancyCount).toBe(5);

      // CRITICAL BREAKDOWN INVARIANT
      const sumBreakdown = Object.values(result.summary.breakdownByType).reduce((a, b) => a + b, 0);
      expect(sumBreakdown).toBe(result.summary.totalRecordsEvaluated);
      expect(result.summary.matchedCount + result.summary.discrepancyCount).toBe(result.summary.totalRecordsEvaluated);
    });

    it('stress tests breakdown parity over 50 randomized runs with diverse discrepancy distributions', async () => {
      let seed = 0xabcdef01;
      const nextRandom = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const mockDb: any = {
        transaction: vi.fn(async (cb) => cb(mockDb)),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      };

      for (let run = 1; run <= 50; run++) {
        const numMatched = Math.floor(nextRandom() * 5); // 0 to 4
        const numHealable = Math.floor(nextRandom() * 6); // 0 to 5
        const numIneligible = Math.floor(nextRandom() * 4); // 0 to 3
        const numAmountMismatch = Math.floor(nextRandom() * 4); // 0 to 3
        const numUnexpected = Math.floor(nextRandom() * 3); // 0 to 2

        const payments: PaymentRecord[] = [];
        const providerItems: StatementItem[] = [];
        const ledgerTxs: LedgerRecord[] = [];

        let idx = 0;
        // Matched
        for (let i = 0; i < numMatched; i++) {
          idx++;
          const pid = `p_m_${run}_${idx}`;
          const trx = `trx_m_${run}_${idx}`;
          payments.push({ id: pid, merchantId: 'm1', amountPaisa: 1000n, feePaisa: 15n, provider: 'NAGAD', providerTrxId: trx, status: 'COMPLETED' });
          providerItems.push({ provider: 'NAGAD', providerTrxId: trx, merchantTxId: pid, amountPaisa: 1000n, feePaisa: 15n, netAmountPaisa: 985n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() });
          ledgerTxs.push({ transactionId: `l_${pid}`, referenceId: pid, referenceType: 'PAYMENT', grossDebitPaisa: 1000n, isBalanced: true });
        }

        // Healable
        for (let i = 0; i < numHealable; i++) {
          idx++;
          const pid = `p_h_${run}_${idx}`;
          const trx = `trx_h_${run}_${idx}`;
          payments.push({ id: pid, merchantId: 'm1', amountPaisa: 2000n, feePaisa: 30n, provider: 'NAGAD', providerTrxId: trx, status: 'PENDING' });
          providerItems.push({ provider: 'NAGAD', providerTrxId: trx, merchantTxId: pid, amountPaisa: 2000n, feePaisa: 30n, netAmountPaisa: 1970n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() });
        }

        // Ineligible status mismatch
        for (let i = 0; i < numIneligible; i++) {
          idx++;
          const pid = `p_in_${run}_${idx}`;
          const trx = `trx_in_${run}_${idx}`;
          payments.push({ id: pid, merchantId: 'm1', amountPaisa: 3000n, feePaisa: 45n, provider: 'NAGAD', providerTrxId: trx, status: 'FAILED' });
          providerItems.push({ provider: 'NAGAD', providerTrxId: trx, merchantTxId: pid, amountPaisa: 3000n, feePaisa: 45n, netAmountPaisa: 2955n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() });
        }

        // Amount mismatch
        for (let i = 0; i < numAmountMismatch; i++) {
          idx++;
          const pid = `p_am_${run}_${idx}`;
          const trx = `trx_am_${run}_${idx}`;
          payments.push({ id: pid, merchantId: 'm1', amountPaisa: 4000n, feePaisa: 60n, provider: 'NAGAD', providerTrxId: trx, status: 'COMPLETED' });
          providerItems.push({ provider: 'NAGAD', providerTrxId: trx, merchantTxId: pid, amountPaisa: 4500n, feePaisa: 60n, netAmountPaisa: 4440n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() });
          ledgerTxs.push({ transactionId: `l_${pid}`, referenceId: pid, referenceType: 'PAYMENT', grossDebitPaisa: 4000n, isBalanced: true });
        }

        // Unexpected gateway tx
        for (let i = 0; i < numUnexpected; i++) {
          idx++;
          const trx = `trx_un_${run}_${idx}`;
          providerItems.push({ provider: 'NAGAD', providerTrxId: trx, amountPaisa: 5000n, feePaisa: 75n, netAmountPaisa: 4925n, currency: 'BDT', providerStatus: 'COMPLETED', transactionTime: new Date() });
        }

        const totalExpected = numMatched + numHealable + numIneligible + numAmountMismatch + numUnexpected;

        const result = await runReconciliation(
          { provider: 'NAGAD', merchantId: 'm1', autoHeal: true },
          mockDb,
          { payments, providerItems, ledgerTxs }
        );

        const sumBreakdown = Object.values(result.summary.breakdownByType).reduce((a, b) => a + b, 0);
        expect(sumBreakdown).toBe(result.summary.totalRecordsEvaluated);
        expect(result.summary.totalRecordsEvaluated).toBe(totalExpected);
        expect(result.summary.matchedCount + result.summary.discrepancyCount).toBe(result.summary.totalRecordsEvaluated);
        expect(result.summary.autoHealedCount).toBe(numHealable);
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Zero-Float Invariant Static Scan
  // ==========================================================================
  describe('Challenge 4: Zero-Float Invariant Static Scan on Modified Files', () => {
    const rootDir = path.resolve(__dirname, '../../../');
    const modifiedFiles = [
      'apps/web/src/app/api/v1/reconciliation/run/route.ts',
      'apps/web/src/app/api/v1/reconciliation/reports/route.ts',
      'apps/web/src/app/api/v1/devices/route.ts',
      'apps/web/src/app/api/v1/invoices/[id]/route.ts',
      'apps/web/src/app/api/v1/webhooks/[id]/route.ts',
      'packages/reconciliation/src/runner.ts',
      'packages/reconciliation/src/reconciler.ts',
      'packages/reconciliation/src/auto-heal.ts',
      'packages/ledger/src/settlement.ts',
      'packages/ledger/src/templates.ts',
      'apps/web/src/lib/api/fees.ts',
    ];

    it('verifies all target modified files exist', () => {
      for (const relPath of modifiedFiles) {
        const fullPath = path.join(rootDir, relPath);
        expect(fs.existsSync(fullPath), `Missing expected file: ${relPath}`).toBe(true);
      }
    });

    it('verifies 0 occurrences of parseFloat or Number.parseFloat across all modified files', () => {
      const floatRegex = /\bparseFloat\b|\bNumber\.parseFloat\b/;
      const violations: { file: string; line: number; text: string }[] = [];

      for (const relPath of modifiedFiles) {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (floatRegex.test(lines[i]!)) {
            violations.push({ file: relPath, line: i + 1, text: lines[i]!.trim() });
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it('verifies all money calculations in modified files operate strictly via BigInt, integer bps, or Paisa', () => {
      // Grep for dangerous patterns on money fields:
      // e.g. amountPaisa / 100 (floating divide without bigint 'n')
      // e.g. feePaisa * 0.015
      const dangerousPatterns = [
        /\b[a-zA-Z]*Paisa\s*[/]\s*\d+(?!n)\b/, // divide paisa by number without 'n' suffix
        /\b[a-zA-Z]*Paisa\s*[*]\s*0\.\d+/, // multiply paisa by decimal float
        /\bMath\.(floor|ceil|round)\([^)]*Paisa/, // float rounding applied to Paisa
      ];

      const violations: { file: string; line: number; text: string; pattern: string }[] = [];

      for (const relPath of modifiedFiles) {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          for (const pattern of dangerousPatterns) {
            if (pattern.test(line)) {
              violations.push({ file: relPath, line: i + 1, text: line.trim(), pattern: pattern.toString() });
            }
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});

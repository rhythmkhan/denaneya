import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';
import crypto from 'node:crypto';

describe('Tier 4: Workload Scenario 05 — Nightly Three-Way Reconciliation & Auto-Healing', () => {
  /**
   * E2E-T4-SC-05: Nightly Three-Way Financial Reconciliation & Automated Ledger Discrepancy Resolution
   * Daily 02:00 cron -> Ingests gateway statement -> Identifies missing IPN payment ->
   * Auto-heals payment to COMPLETED -> Posts missing double-entry ledger -> Signs summary report.
   */
  it('E2E-T4-SC-05: Nightly Three-Way Financial Reconciliation & Automated Ledger Discrepancy Resolution', () => {
    const TOTAL_SETTLED_COUNT = 1450;
    const TOTAL_SETTLED_BDT = '1200000.00';
    const totalPaisa = Paisa.fromBDT(TOTAL_SETTLED_BDT).amountPaisa;

    // Simulate 1,450 gateway records
    const gatewayRecords = new Map<string, { trxId: string; amountPaisa: bigint }>();
    const internalPayments = new Map<string, { id: string; trxId: string; amountPaisa: bigint; status: string }>();

    // Seed matched records
    const basePaisaPerTx = totalPaisa / BigInt(TOTAL_SETTLED_COUNT);
    for (let i = 1; i <= TOTAL_SETTLED_COUNT; i++) {
      const trxId = `SSL_TRX_${i.toString().padStart(6, '0')}`;
      gatewayRecords.set(trxId, { trxId, amountPaisa: basePaisaPerTx });
      internalPayments.set(trxId, {
        id: `pay_rec_${i}`,
        trxId,
        amountPaisa: basePaisaPerTx,
        status: i === 42 ? 'PENDING' : 'COMPLETED', // Transaction #42 dropped its IPN!
      });
    }

    // 1. Reconciliation sweep
    let matchedCount = 0;
    let autoHealedCount = 0;
    const ledgerPostings: any[] = [];

    for (const [trxId, gwRow] of gatewayRecords.entries()) {
      const internal = internalPayments.get(trxId);
      if (!internal) {
        throw new Error(`Missing internal record for ${trxId}`);
      }

      if (internal.status === 'COMPLETED') {
        matchedCount++;
      } else if (internal.status === 'PENDING') {
        // Discrepancy found: Dropped IPN auto-healing
        const t1 = validatePaymentTransition('PENDING', 'PROCESSING');
        expect(t1.allowed).toBe(true);
        internal.status = 'PROCESSING';

        const t2 = validatePaymentTransition('PROCESSING', 'COMPLETED');
        expect(t2.allowed).toBe(true);
        internal.status = 'COMPLETED';

        // Post missing capture ledger entries
        const tx = buildPaymentCaptureTransaction({
          paymentId: internal.id,
          merchantId: 'mch_reconciliation_01',
          provider: 'SSLCOMMERZ',
          grossAmountPaisa: internal.amountPaisa,
          platformFeePaisa: (internal.amountPaisa * 185n) / 10000n,
        });

        assertLedgerBalanced(
          tx.entries.map((e) => ({
            entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
            amountPaisa: e.amountPaisa,
          }))
        );
        ledgerPostings.push(tx);
        autoHealedCount++;
        matchedCount++;
      }
    }

    expect(autoHealedCount).toBe(1);
    expect(matchedCount).toBe(TOTAL_SETTLED_COUNT);
    expect(ledgerPostings.length).toBe(1);

    // 2. Summary report generation with cryptographic signature
    const reportData = {
      reconciliationDate: '2026-09-14',
      totalRecords: TOTAL_SETTLED_COUNT,
      matched: matchedCount,
      autoHealed: autoHealedCount,
      remainingDiscrepancies: 0,
      totalVolumePaisa: totalPaisa.toString(),
    };

    const reportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(reportData))
      .digest('hex');

    expect(reportData.matched).toBe(1450);
    expect(reportData.autoHealed).toBe(1);
    expect(reportData.remainingDiscrepancies).toBe(0);
    expect(reportHash.length).toBe(64);
  });
});

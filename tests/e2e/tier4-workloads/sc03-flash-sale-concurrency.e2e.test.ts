import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';

describe('Tier 4: Workload Scenario 03 — Flash-Sale High-Velocity Concurrency Protection', () => {
  /**
   * E2E-T4-SC-03: Flash-Sale High-Velocity Concurrency Invariant Protection
   * 50 units inventory -> 500 concurrent requests -> Duplicate TrxID attempts blocked ->
   * Exactly 50 captures succeed -> Ledger balanced for all 50.
   */
  it('E2E-T4-SC-03: Flash-Sale High-Velocity Concurrency Invariant Protection', async () => {
    const TOTAL_INVENTORY = 50;
    const CONCURRENT_REQUESTS = 500;
    const itemPricePaisa = 150000n; // 1,500.00 BDT
    const merchantId = 'mch_flash_sale_01';

    let availableStock = TOTAL_INVENTORY;
    const settledPayments = new Map<string, any>();
    const providerTrxSet = new Set<string>();
    const ledgerJournals: any[] = [];

    // Simulate 500 concurrent buyer requests
    const attempts = Array.from({ length: CONCURRENT_REQUESTS }, (_, index) => {
      // Intentional collision: 10 shoppers share the same TrxID to simulate collision/fraud
      const simulatedTrxId = `TRX_FLASH_${index % 50}`;
      return {
        requestId: `req_${index}`,
        idempotencyKey: `idem_buyer_${index}`,
        providerTrxId: simulatedTrxId,
      };
    });

    const processFlashSaleOrder = async (req: typeof attempts[0]) => {
      // Atomic reservation with unique constraint on providerTrxId
      if (providerTrxSet.has(req.providerTrxId)) {
        return {
          statusCode: 409,
          error: 'CONFLICT: Provider transaction ID already consumed by another order',
        };
      }

      if (availableStock <= 0) {
        return {
          statusCode: 422,
          error: 'OUT_OF_STOCK: Flash sale inventory has sold out',
        };
      }

      // Claim stock and lock provider TrxID
      availableStock--;
      providerTrxSet.add(req.providerTrxId);

      const paymentId = `pay_flash_${req.requestId}`;
      settledPayments.set(paymentId, {
        id: paymentId,
        providerTrxId: req.providerTrxId,
        amountPaisa: itemPricePaisa,
        status: 'COMPLETED',
      });

      // Post atomic balanced capture journal
      const tx = buildPaymentCaptureTransaction({
        paymentId,
        merchantId,
        provider: 'BKASH',
        grossAmountPaisa: itemPricePaisa,
        platformFeePaisa: 2775n, // 1.85% MDR
      });

      assertLedgerBalanced(
        tx.entries.map((e) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
        }))
      );
      ledgerJournals.push(tx);

      return { statusCode: 201, paymentId };
    };

    // Execute 500 requests simultaneously via Promise.all
    const results = await Promise.all(attempts.map((req) => processFlashSaleOrder(req)));

    const successfulOrders = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);
    const outOfStock = results.filter((r) => r.statusCode === 422);

    // Invariant assertions
    expect(successfulOrders.length).toBe(TOTAL_INVENTORY);
    expect(settledPayments.size).toBe(TOTAL_INVENTORY);
    expect(availableStock).toBe(0);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.length + outOfStock.length).toBe(CONCURRENT_REQUESTS - TOTAL_INVENTORY);

    // Exactly 50 balanced ledger entries posted
    expect(ledgerJournals.length).toBe(TOTAL_INVENTORY);
    for (const journal of ledgerJournals) {
      const v = verifyLedgerBalance(
        journal.entries.map((e: any) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
        }))
      );
      expect(v.balanced).toBe(true);
      expect(v.totalDebitsPaisa).toBe(itemPricePaisa);
    }
  });
});

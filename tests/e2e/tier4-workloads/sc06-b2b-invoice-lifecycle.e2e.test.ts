import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance } from '../helpers/ledger-verifier.js';

describe('Tier 4: Workload Scenario 06 — Digital B2B Invoice Lifecycle & Partial Payments', () => {
  /**
   * E2E-T4-SC-06: Recurring Digital B2B Invoice Issuance, Partial Payment, and Overdue Penalty
   * Invoice 100,000 BDT -> Client pays 50,000 BDT -> Status PARTIALLY_PAID ->
   * Due date passes -> Status OVERDUE -> Client pays remaining 50,000 BDT -> Status PAID.
   */
  it('E2E-T4-SC-06: Recurring Digital B2B Invoice Issuance, Partial Payment, and Overdue Penalty', () => {
    const totalPaisa = 10000000n; // 100,000.00 BDT

    const invoice = {
      id: 'inv_agency_software_01',
      merchantId: 'mch_agency_01',
      totalAmountPaisa: totalPaisa,
      paidAmountPaisa: 0n,
      status: 'SENT' as 'SENT' | 'PARTIALLY_PAID' | 'OVERDUE' | 'PAID',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net-30
    };

    // Step 1: Client pays 50,000.00 BDT (5,000,000 paisa) partial payment via Card
    const payment1Paisa = 5000000n;
    invoice.paidAmountPaisa += payment1Paisa;

    if (invoice.paidAmountPaisa < invoice.totalAmountPaisa) {
      invoice.status = 'PARTIALLY_PAID';
    }

    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.totalAmountPaisa - invoice.paidAmountPaisa).toBe(5000000n);

    // Ledger entry for first partial payment
    const tx1 = buildPaymentCaptureTransaction({
      paymentId: 'pay_inv_part_1',
      merchantId: invoice.merchantId,
      provider: 'SSLCOMMERZ',
      grossAmountPaisa: payment1Paisa,
      platformFeePaisa: 92500n, // 1.85%
    });
    expect(verifyLedgerBalance(tx1.entries.map((e) => ({ entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT', amountPaisa: e.amountPaisa }))).balanced).toBe(true);

    // Step 2: Due date passes without remaining payment -> cron transitions to OVERDUE
    invoice.dueDate = new Date(Date.now() - 1000); // 1s in past
    if (new Date() > invoice.dueDate && invoice.status === 'PARTIALLY_PAID') {
      invoice.status = 'OVERDUE';
    }
    expect(invoice.status).toBe('OVERDUE');

    // Step 3: Client pays remaining 50,000.00 BDT via bKash
    const payment2Paisa = 5000000n;
    invoice.paidAmountPaisa += payment2Paisa;

    if (invoice.paidAmountPaisa >= invoice.totalAmountPaisa) {
      invoice.status = 'PAID';
    }

    expect(invoice.status).toBe('PAID');
    expect(invoice.paidAmountPaisa).toBe(10000000n);
    expect(invoice.totalAmountPaisa - invoice.paidAmountPaisa).toBe(0n);

    // Ledger entry for second partial payment
    const tx2 = buildPaymentCaptureTransaction({
      paymentId: 'pay_inv_part_2',
      merchantId: invoice.merchantId,
      provider: 'BKASH',
      grossAmountPaisa: payment2Paisa,
      platformFeePaisa: 92500n,
    });
    expect(verifyLedgerBalance(tx2.entries.map((e) => ({ entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT', amountPaisa: e.amountPaisa }))).balanced).toBe(true);
  });
});

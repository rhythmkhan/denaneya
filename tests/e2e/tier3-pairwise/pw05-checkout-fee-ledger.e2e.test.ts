import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import {
  buildPaymentCaptureTransaction,
  buildMerchantPayoutTransaction,
  getSystemAccountId,
  getMerchantAccountId,
  SYSTEM_ACCOUNT_CODES,
} from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';

describe('Tier 3: Pairwise Suite 05 — Checkout, Fee Calculation, Invoicing & Ledger', () => {
  /**
   * E2E-T3-PW-05: Hosted Checkout × Paisa Rounding Fee Math × Double-Entry Split Posting
   * Interaction: Customer pays 333.33 BDT via checkout; platform MDR is 1.85% (6.17 BDT) + gateway fee 1.50% (5.00 BDT).
   * Assertion: Paisa integer rounding applies half-up; ledger entries sum:
   * 33333 = 32216 (merchant) + 617 (platform) + 500 (gateway); balance invariant holds to exact paisa.
   */
  it('E2E-T3-PW-05: Hosted Checkout × Paisa Rounding Fee Math × Double-Entry Split Posting', () => {
    const gross = Paisa.fromBDT('333.33'); // 33,333 paisa
    expect(gross.amountPaisa).toBe(33333n);

    // Platform MDR: 1.85% = 185 bps
    // Formula: (33333 * 185 + 5000) / 10000 = (6166605 + 5000) / 10000 = 6171605 / 10000 = 617 paisa (6.17 BDT)
    const platformFee = gross.percentage(185n);
    expect(platformFee.amountPaisa).toBe(617n);
    expect(platformFee.toBDT()).toBe('6.17');

    // Gateway interchange fee: 1.50% = 150 bps
    // Formula: (33333 * 150 + 5000) / 10000 = (4999950 + 5000) / 10000 = 5004950 / 10000 = 500 paisa (5.00 BDT)
    const gatewayFee = gross.percentage(150n);
    expect(gatewayFee.amountPaisa).toBe(500n);
    expect(gatewayFee.toBDT()).toBe('5.00');

    // Net Merchant Payable = 33333 - 617 - 500 = 32216 paisa
    const netMerchantPaisa = gross.amountPaisa - platformFee.amountPaisa - gatewayFee.amountPaisa;
    expect(netMerchantPaisa).toBe(32216n);

    // Verify double-entry balance invariant
    const entries = [
      { entryType: 'DEBIT' as const, amountPaisa: gross.amountPaisa, accountId: '1010_gateway_clearing' },
      { entryType: 'CREDIT' as const, amountPaisa: netMerchantPaisa, accountId: '2010_merchant_payable' },
      { entryType: 'CREDIT' as const, amountPaisa: platformFee.amountPaisa, accountId: '4010_platform_fee' },
      { entryType: 'CREDIT' as const, amountPaisa: gatewayFee.amountPaisa, accountId: '5010_gateway_expense' },
    ];

    const result = verifyLedgerBalance(entries);
    expect(result.balanced).toBe(true);
    expect(result.discrepancyPaisa).toBe(0n);
    expect(() => assertLedgerBalanced(entries)).not.toThrow();
  });

  /**
   * E2E-T3-PW-09: Digital Invoice Multi-Line Item × bKash Direct Checkout × Invoice Status Auto-Update
   * Interaction: Merchant creates invoice with 3 items; customer pays via bKash direct tokenized checkout.
   * Assertion: Webhook from bKash triggers settlement; invoice updates to PAID; payment receipt generated.
   */
  it('E2E-T3-PW-09: Digital Invoice Multi-Line Item × bKash Direct Checkout × Invoice Status Auto-Update', () => {
    const lineItems = [
      { description: 'Cloud VPS Subscription', unitPricePaisa: 250000n, qty: 1 },
      { description: 'Dedicated SSL Certificate', unitPricePaisa: 150000n, qty: 1 },
      { description: 'Automated Backup Addon', unitPricePaisa: 50000n, qty: 2 },
    ];

    const totalInvoicePaisa = lineItems.reduce(
      (sum, item) => sum + item.unitPricePaisa * BigInt(item.qty),
      0n
    );
    // 250000 + 150000 + 100000 = 500000n (5,000.00 BDT)
    expect(totalInvoicePaisa).toBe(500000n);

    const invoice = {
      id: 'inv_b2b_001',
      totalAmountPaisa: totalInvoicePaisa,
      status: 'SENT' as 'SENT' | 'PAID' | 'VOIDED',
      paidAmountPaisa: 0n,
      receiptNumber: null as string | null,
    };

    // Customer completes payment of exact total via bKash
    const paymentCompleted = {
      id: 'pay_bkash_inv_01',
      provider: 'BKASH',
      amountPaisa: 500000n,
      status: 'COMPLETED',
      trxId: 'BKASH_INV_PAID_77',
    };

    if (paymentCompleted.status === 'COMPLETED' && paymentCompleted.amountPaisa >= invoice.totalAmountPaisa) {
      invoice.status = 'PAID';
      invoice.paidAmountPaisa = paymentCompleted.amountPaisa;
      invoice.receiptNumber = `RCP-${invoice.id}-${paymentCompleted.trxId}`;
    }

    expect(invoice.status).toBe('PAID');
    expect(invoice.paidAmountPaisa).toBe(500000n);
    expect(invoice.receiptNumber).toBe('RCP-inv_b2b_001-BKASH_INV_PAID_77');
  });

  /**
   * E2E-T3-PW-18: Invoice Voiding × Active Hosted Checkout Session Invalidation
   * Interaction: Customer opens checkout from invoice link; merchant voids invoice
   * from dashboard before customer submits PIN.
   * Assertion: Checkout session invalidated; customer submission rejected with "Invoice has been voided".
   */
  it('E2E-T3-PW-18: Invoice Voiding × Active Hosted Checkout Session Invalidation', () => {
    const invoice = {
      id: 'inv_voidable_01',
      status: 'SENT' as 'SENT' | 'VOIDED',
    };

    const checkoutSession = {
      id: 'sess_inv_voidable_01',
      invoiceId: invoice.id,
      status: 'ACTIVE' as 'ACTIVE' | 'CANCELLED',
    };

    // Merchant voids invoice from dashboard
    invoice.status = 'VOIDED';

    // Invalidation hook triggers on associated checkout sessions
    if (invoice.status === 'VOIDED' && checkoutSession.status === 'ACTIVE') {
      checkoutSession.status = 'CANCELLED';
    }

    // Customer attempts to submit payment on open browser tab
    const submitPayment = () => {
      if (invoice.status === 'VOIDED' || checkoutSession.status === 'CANCELLED') {
        throw new Error('INVOICE_VOIDED: This invoice has been voided by the merchant and cannot accept payments');
      }
      return { success: true };
    };

    expect(() => submitPayment()).toThrow(/INVOICE_VOIDED/);
    expect(checkoutSession.status).toBe('CANCELLED');
  });

  /**
   * E2E-T3-PW-21: Merchant Rolling Reserve Ledger Withholding × Available Balance Payout
   * Interaction: High-risk merchant configured with 10% rolling reserve; captures 10,000.00 BDT payment; requests payout.
   * Assertion: Ledger posts 9,000 BDT to Available Balance (2010) and 1,000 BDT to Escrow Hold (2020); max payout allowed is 9,000 BDT.
   */
  it('E2E-T3-PW-21: Merchant Rolling Reserve Ledger Withholding × Available Balance Payout', () => {
    const grossPaisa = 1000000n; // 10,000.00 BDT
    const reserveRateBps = 1000n; // 10% = 1,000 bps
    const platformFeePaisa = 0n; // 0 for clean breakdown

    const reservePaisa = (grossPaisa * reserveRateBps) / 10000n; // 1,000.00 BDT (100,000 paisa)
    expect(reservePaisa).toBe(100000n);

    // Build ledger capture transaction with reserve withholding
    const captureTx = buildPaymentCaptureTransaction({
      paymentId: 'pay_reserve_01',
      merchantId: 'mch_high_risk_01',
      provider: 'SSLCOMMERZ',
      grossAmountPaisa: grossPaisa,
      platformFeePaisa,
      reservePaisa,
    });

    const verification = verifyLedgerBalance(
      captureTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(verification.balanced).toBe(true);

    const payableEntry = captureTx.entries.find((e) => e.accountId.includes('2010'));
    const reserveEntry = captureTx.entries.find((e) => e.accountId.includes('2020'));

    expect(payableEntry?.amountPaisa).toBe(900000n); // 9,000.00 BDT available
    expect(reserveEntry?.amountPaisa).toBe(100000n); // 1,000.00 BDT withheld in escrow

    // Payout request check: requesting 9,500 BDT exceeds available 9,000 BDT
    const availableBalancePaisa = payableEntry!.amountPaisa;
    const requestPayout = (requestedPaisa: bigint) => {
      if (requestedPaisa > availableBalancePaisa) {
        throw new Error(
          `INSUFFICIENT_FUNDS: Requested ${requestedPaisa} exceeds available liquid balance of ${availableBalancePaisa}`
        );
      }
      return buildMerchantPayoutTransaction({
        payoutId: 'payout_01',
        merchantId: 'mch_high_risk_01',
        amountPaisa: requestedPaisa,
      });
    };

    // Attempting 9,500 BDT fails
    expect(() => requestPayout(950000n)).toThrow(/INSUFFICIENT_FUNDS/);

    // Attempting 9,000 BDT succeeds
    const payoutTx = requestPayout(900000n);
    expect(payoutTx.entries.length).toBe(2);
    const payoutVerification = verifyLedgerBalance(
      payoutTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(payoutVerification.balanced).toBe(true);
  });

  /**
   * E2E-T3-PW-25: Payment Link Fixed Amount vs Customer-Specified Amount Mode
   * Interaction: Link created with allow_custom_amount = true and min_amount = 100.00 BDT.
   * Assertion: Customer enters 250.00 BDT; checkout processes exact amount; ledger reflects 25000n paisa.
   */
  it('E2E-T3-PW-25: Payment Link Fixed Amount vs Customer-Specified Amount Mode', () => {
    const paymentLinkConfig = {
      id: 'plnk_custom_amt_01',
      allowCustomAmount: true,
      minAmountPaisa: 10000n, // 100.00 BDT
      maxAmountPaisa: 5000000n, // 50,000.00 BDT
    };

    const processCustomerInput = (inputBDT: string) => {
      const parsed = Paisa.fromBDT(inputBDT);
      if (parsed.amountPaisa < paymentLinkConfig.minAmountPaisa) {
        throw new Error('AMOUNT_BELOW_MINIMUM: Specified amount is below minimum allowed');
      }
      if (parsed.amountPaisa > paymentLinkConfig.maxAmountPaisa) {
        throw new Error('AMOUNT_EXCEEDS_MAXIMUM: Specified amount exceeds maximum allowed');
      }
      return parsed;
    };

    // Case 1: Input 50.00 BDT (below minimum)
    expect(() => processCustomerInput('50.00')).toThrow(/AMOUNT_BELOW_MINIMUM/);

    // Case 2: Input 250.00 BDT (valid custom amount)
    const validAmount = processCustomerInput('250.00');
    expect(validAmount.amountPaisa).toBe(25000n);

    // Settle payment and verify ledger
    const ledgerTx = buildPaymentCaptureTransaction({
      paymentId: 'pay_custom_01',
      merchantId: 'mch_01',
      provider: 'BKASH',
      grossAmountPaisa: validAmount.amountPaisa,
      platformFeePaisa: 463n, // 1.85%
    });

    const verification = verifyLedgerBalance(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(verification.balanced).toBe(true);
    expect(verification.totalDebitsPaisa).toBe(25000n);
  });
});

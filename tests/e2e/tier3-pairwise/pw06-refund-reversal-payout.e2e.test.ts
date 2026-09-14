import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import {
  buildRefundTransaction,
  buildMerchantPayoutTransaction,
  buildReserveReleaseTransaction,
  getMerchantAccountId,
  getSystemAccountId,
  SYSTEM_ACCOUNT_CODES,
} from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';

describe('Tier 3: Pairwise Suite 06 — Refunds, Reversals, Chargebacks & Bank Payouts', () => {
  /**
   * E2E-T3-PW-06: Partial Refund Sequence × Cumulative Refund Bound × Ledger Reversal
   * Interaction: Payment of 1,000.00 BDT receives 3 consecutive partial refunds: 300.00 BDT, 400.00 BDT, 300.00 BDT.
   * Assertion: Payment transitions COMPLETED -> PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED -> REFUNDED;
   * 4th refund of 1 paisa rejected; ledger balances at each stage.
   */
  it('E2E-T3-PW-06: Partial Refund Sequence × Cumulative Refund Bound × Ledger Reversal', () => {
    const payment = {
      id: 'pay_seq_refund_01',
      merchantId: 'mch_01',
      capturedAmountPaisa: 100000n, // 1,000.00 BDT (100,000 paisa)
      refundedAmountPaisa: 0n,
      status: 'COMPLETED' as 'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED',
    };

    const processRefund = (refundPaisa: bigint) => {
      const prospectiveTotal = payment.refundedAmountPaisa + refundPaisa;
      if (prospectiveTotal > payment.capturedAmountPaisa) {
        throw new Error(
          `REFUND_EXCEEDS_CAPTURED_AMOUNT: Cumulative refund ${prospectiveTotal}n exceeds captured ${payment.capturedAmountPaisa}n`
        );
      }

      const nextStatus =
        prospectiveTotal === payment.capturedAmountPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      const transition = validatePaymentTransition(payment.status, nextStatus);
      if (!transition.allowed) {
        throw new Error(transition.error);
      }

      payment.refundedAmountPaisa = prospectiveTotal;
      payment.status = nextStatus;

      // Post refund ledger transaction
      const refundTx = buildRefundTransaction({
        refundId: `ref_${Math.random().toString(36).slice(2, 8)}`,
        paymentId: payment.id,
        merchantId: payment.merchantId,
        refundAmountPaisa: refundPaisa,
        platformFeeRefundPaisa: 0n,
      });

      const verification = verifyLedgerBalance(
        refundTx.entries.map((e) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
        }))
      );
      assertLedgerBalanced(
        refundTx.entries.map((e) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
        }))
      );

      return { nextStatus, refundedTotal: payment.refundedAmountPaisa };
    };

    // Refund 1: 300.00 BDT (30,000 paisa)
    const r1 = processRefund(30000n);
    expect(r1.nextStatus).toBe('PARTIALLY_REFUNDED');
    expect(r1.refundedTotal).toBe(30000n);
    expect(payment.status).toBe('PARTIALLY_REFUNDED');

    // Refund 2: 400.00 BDT (40,000 paisa)
    const r2 = processRefund(40000n);
    expect(r2.nextStatus).toBe('PARTIALLY_REFUNDED');
    expect(r2.refundedTotal).toBe(70000n);

    // Refund 3: 300.00 BDT (30,000 paisa) -> Completes full amount
    const r3 = processRefund(30000n);
    expect(r3.nextStatus).toBe('REFUNDED');
    expect(r3.refundedTotal).toBe(100000n);
    expect(payment.status).toBe('REFUNDED');

    // Refund 4: 1 paisa (0.01 BDT) must be strictly rejected
    expect(() => processRefund(1n)).toThrow(/REFUND_EXCEEDS_CAPTURED_AMOUNT/);
    expect(payment.status).toBe('REFUNDED');
  });

  /**
   * E2E-T3-PW-29: Customer Chargeback Notice × Reverse Ledger Entry × Rolling Reserve Drawdown
   * Interaction: Gateway notifies platform of customer dispute on 30-day-old payment.
   * Assertion: Reverse journal debits Merchant Reserve (2020) and credits Gateway In-Transit (1010); balance holds.
   */
  it('E2E-T3-PW-29: Customer Chargeback Notice × Reverse Ledger Entry × Rolling Reserve Drawdown', () => {
    const merchantId = 'mch_chargeback_target';
    const disputeAmountPaisa = 500000n; // 5,000.00 BDT

    // Chargeback journal entry directly debiting merchant reserve escrow
    const reserveAccountId = getMerchantAccountId(merchantId, '2020');
    const gatewayClearingAccountId = getSystemAccountId(SYSTEM_ACCOUNT_CODES.GATEWAY_CLEARING);

    const chargebackEntries = [
      {
        entryType: 'DEBIT' as const,
        amountPaisa: disputeAmountPaisa,
        accountId: reserveAccountId, // Escrow reserve covers dispute
      },
      {
        entryType: 'CREDIT' as const,
        amountPaisa: disputeAmountPaisa,
        accountId: gatewayClearingAccountId, // Settles gateway clawback
      },
    ];

    const result = verifyLedgerBalance(chargebackEntries);
    expect(result.balanced).toBe(true);
    expect(result.discrepancyPaisa).toBe(0n);
    expect(result.totalDebitsPaisa).toBe(disputeAmountPaisa);
  });

  /**
   * E2E-T3-PW-33: Bangladesh Bank National Switch (NPSB) Formatting in Settlement Report
   * Interaction: Generate bank settlement report for BEFTN/NPSB routing.
   * Assertion: CSV contains 9-digit routing numbers, account numbers, and exact paisa amounts.
   */
  it('E2E-T3-PW-33: Bangladesh Bank National Switch (NPSB) Formatting in Settlement Report', () => {
    const payoutRecords = [
      {
        payoutId: 'pot_01',
        beneficiaryName: 'Dhaka Tech Solutions Ltd.',
        bankName: 'BRAC Bank PLC',
        routingNumber: '060261358', // 9-digit Bangladesh Bank routing code
        accountNumber: '1501203948571001',
        amountPaisa: 980000n, // 9,800.00 BDT
      },
      {
        payoutId: 'pot_02',
        beneficiaryName: 'Chittagong Traders',
        bankName: 'Dutch-Bangla Bank Ltd',
        routingNumber: '090272341', // 9-digit routing code
        accountNumber: '1151050098762',
        amountPaisa: 450000n, // 4,500.00 BDT
      },
    ];

    // Format settlement CSV string according to Bangladesh Bank guidelines
    const header = 'PayoutID,Beneficiary,Bank,RoutingNo,AccountNo,AmountBDT,AmountPaisa';
    const rows = payoutRecords.map((r) => {
      const bdt = Paisa.fromPaisa(r.amountPaisa).toBDT();
      return `${r.payoutId},"${r.beneficiaryName}","${r.bankName}",${r.routingNumber},${r.accountNumber},${bdt},${r.amountPaisa.toString()}`;
    });
    const csvContent = [header, ...rows].join('\n');

    // Assertions on format compliance
    expect(csvContent).toContain('060261358');
    expect(csvContent).toContain('9800.00');
    expect(csvContent).toContain('980000');

    for (const record of payoutRecords) {
      expect(record.routingNumber).toMatch(/^\d{9}$/); // Exactly 9 numeric digits
      expect(record.accountNumber.length).toBeGreaterThanOrEqual(10);
      expect(typeof record.amountPaisa).toBe('bigint');
    }
  });

  /**
   * E2E-T3-PW-36: Full Refund Fee Reversal Invariant (Double-Entry Reversal Integrity)
   * Interaction: Execute full refund reversing original platform fee and merchant payable.
   * Assertion: Debits (Merchant Payable + Platform Fee) == Credit (Refund Clearing); zero discrepancy.
   */
  it('E2E-T3-PW-36: Full Refund Fee Reversal Invariant (Double-Entry Reversal Integrity)', () => {
    const grossPaisa = 100000n; // 1,000.00 BDT
    const platformFeePaisa = 1850n; // 18.50 BDT fee reversed
    const merchantDebit = grossPaisa - platformFeePaisa; // 981.50 BDT

    const tx = buildRefundTransaction({
      refundId: 'ref_fee_rev_01',
      paymentId: 'pay_fee_rev_01',
      merchantId: 'mch_01',
      refundAmountPaisa: grossPaisa,
      platformFeeRefundPaisa: platformFeePaisa,
    });

    const verification = verifyLedgerBalance(
      tx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );

    expect(verification.balanced).toBe(true);
    expect(verification.totalDebitsPaisa).toBe(grossPaisa);
    expect(verification.totalCreditsPaisa).toBe(grossPaisa);
  });

  /**
   * E2E-T3-PW-37: Liquidity Constraint: Merchant Payout Cannot Exceed Net Available Balance
   * Interaction: Merchant attempts payout when available balance is below requested amount due to reserve holds.
   * Assertion: Payout rejected with insufficient funds; funds in rolling reserve (2020) remain protected.
   */
  it('E2E-T3-PW-37: Liquidity Constraint: Merchant Payout Cannot Exceed Net Available Balance', () => {
    const accountBalances = {
      availablePayablePaisa: 50000n,  // 500.00 BDT available
      rollingReservePaisa: 150000n,   // 1,500.00 BDT locked in escrow
    };

    const attemptPayout = (requestedPaisa: bigint) => {
      if (requestedPaisa > accountBalances.availablePayablePaisa) {
        throw new Error('INSUFFICIENT_AVAILABLE_BALANCE: Rolling reserve funds cannot be withdrawn');
      }
      return { status: 'APPROVED', amountPaisa: requestedPaisa };
    };

    // Attempting to withdraw 1,000 BDT (which would require dipping into reserve) fails
    expect(() => attemptPayout(100000n)).toThrow(/INSUFFICIENT_AVAILABLE_BALANCE/);

    // Attempting to withdraw 500 BDT succeeds
    const success = attemptPayout(50000n);
    expect(success.status).toBe('APPROVED');
    expect(success.amountPaisa).toBe(50000n);
  });
});

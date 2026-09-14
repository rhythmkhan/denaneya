import { describe, it, expect } from 'vitest';
import {
  buildPaymentCaptureTransaction,
  buildMerchantPayoutTransaction,
  buildRefundTransaction,
  buildReserveReleaseTransaction,
} from '../src/templates.js';
import { validateLedgerEntries } from '../src/posting.js';
import { InvalidLedgerAmountError } from '../src/errors.js';

describe('Standard Ledger Transaction Templates', () => {
  describe('Payment Capture Template', () => {
    it('builds balanced capture for MFS provider (account 1020)', () => {
      const tx = buildPaymentCaptureTransaction({
        paymentId: 'pay_bkash_01',
        merchantId: 'mer_100',
        provider: 'BKASH',
        grossAmountPaisa: 1000000n, // 10,000 BDT
        platformFeePaisa: 15000n,   // 150 BDT
        reservePaisa: 50000n,       // 500 BDT
      });

      expect(tx.transactionType).toBe('PAYMENT_CAPTURE');
      expect(tx.referenceId).toBe('pay_bkash_01');

      // Check account mapping
      expect(tx.entries[0]?.accountId).toBe('acc_sys_1020'); // MFS Asset
      expect(tx.entries[0]?.direction).toBe('DEBIT');
      expect(tx.entries[0]?.amountPaisa).toBe(1000000n);

      expect(tx.entries[1]?.accountId).toBe('acc_mch_mer_100_2010'); // Merchant Payable
      expect(tx.entries[1]?.direction).toBe('CREDIT');
      expect(tx.entries[1]?.amountPaisa).toBe(935000n); // 1000000 - 15000 - 50000

      expect(tx.entries[2]?.accountId).toBe('acc_sys_4010'); // Platform Fee
      expect(tx.entries[2]?.direction).toBe('CREDIT');
      expect(tx.entries[2]?.amountPaisa).toBe(15000n);

      expect(tx.entries[3]?.accountId).toBe('acc_mch_mer_100_2020'); // Rolling Reserve
      expect(tx.entries[3]?.direction).toBe('CREDIT');
      expect(tx.entries[3]?.amountPaisa).toBe(50000n);

      // Verify mathematical balance
      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(1000000n);
      expect(totalCredits).toBe(1000000n);
    });

    it('builds balanced capture for Gateway provider (account 1010)', () => {
      const tx = buildPaymentCaptureTransaction({
        paymentId: 'pay_ssl_01',
        merchantId: 'mer_100',
        provider: 'SSLCOMMERZ',
        grossAmountPaisa: 500000n,
        platformFeePaisa: 12500n,
      });

      expect(tx.entries[0]?.accountId).toBe('acc_sys_1010'); // Gateway Clearing
      expect(tx.entries).toHaveLength(3); // No reserve entry

      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(500000n);
      expect(totalCredits).toBe(500000n);
    });

    it('rejects capture if platform fee and reserve exceed gross amount', () => {
      expect(() =>
        buildPaymentCaptureTransaction({
          paymentId: 'pay_overflow',
          merchantId: 'mer_100',
          provider: 'NAGAD',
          grossAmountPaisa: 1000n,
          platformFeePaisa: 800n,
          reservePaisa: 300n, // 800 + 300 = 1100 > 1000
        })
      ).toThrow(InvalidLedgerAmountError);
    });
  });

  describe('Merchant Payout Template', () => {
    it('builds balanced payout transaction (debit 2010, credit 1030)', () => {
      const tx = buildMerchantPayoutTransaction({
        payoutId: 'pout_01',
        merchantId: 'mer_200',
        amountPaisa: 250000n,
        notes: 'BEFTN transfer to City Bank',
      });

      expect(tx.transactionType).toBe('MERCHANT_PAYOUT');
      expect(tx.entries[0]?.accountId).toBe('acc_mch_mer_200_2010');
      expect(tx.entries[0]?.direction).toBe('DEBIT');
      expect(tx.entries[1]?.accountId).toBe('acc_sys_1030');
      expect(tx.entries[1]?.direction).toBe('CREDIT');

      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(250000n);
      expect(totalCredits).toBe(250000n);
    });
  });

  describe('Refund Template', () => {
    it('builds refund without fee reversal', () => {
      const tx = buildRefundTransaction({
        refundId: 'ref_01',
        paymentId: 'pay_01',
        merchantId: 'mer_300',
        refundAmountPaisa: 100000n,
      });

      expect(tx.transactionType).toBe('REFUND');
      expect(tx.entries).toHaveLength(2);
      expect(tx.entries[0]?.accountId).toBe('acc_mch_mer_300_2010');
      expect(tx.entries[0]?.direction).toBe('DEBIT');
      expect(tx.entries[0]?.amountPaisa).toBe(100000n);
      expect(tx.entries[1]?.accountId).toBe('acc_sys_2030');
      expect(tx.entries[1]?.direction).toBe('CREDIT');
      expect(tx.entries[1]?.amountPaisa).toBe(100000n);

      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(100000n);
      expect(totalCredits).toBe(100000n);
    });

    it('builds refund with platform fee reversal', () => {
      const tx = buildRefundTransaction({
        refundId: 'ref_02',
        paymentId: 'pay_02',
        merchantId: 'mer_300',
        refundAmountPaisa: 100000n,
        platformFeeRefundPaisa: 1500n,
      });

      expect(tx.entries).toHaveLength(3);
      // Merchant debit: 100000 - 1500 = 98500
      expect(tx.entries[0]?.accountId).toBe('acc_mch_mer_300_2010');
      expect(tx.entries[0]?.amountPaisa).toBe(98500n);

      // Fee reversal debit: 1500
      expect(tx.entries[1]?.accountId).toBe('acc_sys_4010');
      expect(tx.entries[1]?.amountPaisa).toBe(1500n);

      // Refund clearing credit: 100000
      expect(tx.entries[2]?.accountId).toBe('acc_sys_2030');
      expect(tx.entries[2]?.amountPaisa).toBe(100000n);

      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(100000n);
      expect(totalCredits).toBe(100000n);
    });

    it('rejects refund when fee reversal exceeds refund amount', () => {
      expect(() =>
        buildRefundTransaction({
          refundId: 'ref_overflow',
          paymentId: 'pay_overflow',
          merchantId: 'mer_300',
          refundAmountPaisa: 1000n,
          platformFeeRefundPaisa: 2000n,
        })
      ).toThrow(InvalidLedgerAmountError);
    });
  });

  describe('Rolling Reserve Release Template', () => {
    it('builds rolling reserve release transaction (debit 2020, credit 2010)', () => {
      const tx = buildReserveReleaseTransaction({
        releaseId: 'rel_01',
        merchantId: 'mer_400',
        amountPaisa: 75000n,
        reason: '90-day escrow release',
      });

      expect(tx.entries[0]?.accountId).toBe('acc_mch_mer_400_2020');
      expect(tx.entries[0]?.direction).toBe('DEBIT');
      expect(tx.entries[1]?.accountId).toBe('acc_mch_mer_400_2010');
      expect(tx.entries[1]?.direction).toBe('CREDIT');

      const { totalDebits, totalCredits } = validateLedgerEntries(tx.entries);
      expect(totalDebits).toBe(75000n);
      expect(totalCredits).toBe(75000n);
    });
  });
});

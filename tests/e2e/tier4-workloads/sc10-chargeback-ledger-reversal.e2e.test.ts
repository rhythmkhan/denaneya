import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';

describe('Tier 4: Workload Scenario 10 — Customer Chargeback & Balanced Journal Reversal', () => {
  /**
   * E2E-T4-SC-10: Customer Chargeback Dispute & Reverse Double-Entry Journal Settlement
   * 10,000 BDT transaction disputed -> Bank upholds dispute ->
   * Balanced reversal journal posted: Debits (2010 + 4010 + 5010) == Credit (1010) ->
   * Debit == Credit = 10,000.00 BDT.
   */
  it('E2E-T4-SC-10: Customer Chargeback Dispute & Reverse Double-Entry Journal Settlement', () => {
    const grossPaisa = 1000000n; // 10,000.00 BDT
    const merchantNetDebitPaisa = 980000n; // 9,800.00 BDT
    const platformMdrReversalPaisa = 5000n; // 50.00 BDT
    const gatewayFeeDebitPaisa = 15000n; // 150.00 BDT

    expect(merchantNetDebitPaisa + platformMdrReversalPaisa + gatewayFeeDebitPaisa).toBe(grossPaisa);

    // Build balanced reversal journal
    const reversalEntries = [
      {
        entryType: 'DEBIT' as const,
        amountPaisa: merchantNetDebitPaisa,
        accountId: 'acc_mch_01_2010_payable',
      },
      {
        entryType: 'DEBIT' as const,
        amountPaisa: platformMdrReversalPaisa,
        accountId: 'acc_sys_4010_platform_fee',
      },
      {
        entryType: 'DEBIT' as const,
        amountPaisa: gatewayFeeDebitPaisa,
        accountId: 'acc_sys_5010_gateway_expense',
      },
      {
        entryType: 'CREDIT' as const,
        amountPaisa: grossPaisa,
        accountId: 'acc_sys_1010_gateway_clearing',
      },
    ];

    const result = verifyLedgerBalance(reversalEntries);
    expect(result.balanced).toBe(true);
    expect(result.discrepancyPaisa).toBe(0n);
    expect(result.totalDebitsPaisa).toBe(grossPaisa);
    expect(result.totalCreditsPaisa).toBe(grossPaisa);
    expect(() => assertLedgerBalanced(reversalEntries)).not.toThrow();
  });
});

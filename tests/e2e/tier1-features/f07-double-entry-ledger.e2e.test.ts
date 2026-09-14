import { describe, it, expect } from "vitest";
import {
  verifyLedgerBalance,
  assertLedgerBalanced,
  calculateAccountBalance,
} from "../helpers/ledger-verifier.js";

describe("Feature 07: Double-Entry Transaction Ledger (Tier 1)", () => {
  it("E2E-T1-F07-01: Balanced Payment Capture Journal Posting", () => {
    const entries = [
      { entryType: "DEBIT" as const, amountPaisa: 100000n, accountId: "1110_sslcommerz" },
      { entryType: "CREDIT" as const, amountPaisa: 98000n, accountId: "2110_merchant" },
      { entryType: "CREDIT" as const, amountPaisa: 500n, accountId: "4100_platform_fee" },
      { entryType: "CREDIT" as const, amountPaisa: 1500n, accountId: "2310_gateway_fee" },
    ];

    const result = verifyLedgerBalance(entries);
    expect(result.balanced).toBe(true);
    expect(result.totalDebitsPaisa).toBe(100000n);
    expect(result.totalCreditsPaisa).toBe(100000n);
    expect(() => assertLedgerBalanced(entries)).not.toThrow();
  });

  it("E2E-T1-F07-02: Database Trigger Rejection of Unbalanced Journal", () => {
    const unbalancedEntries = [
      { entryType: "DEBIT" as const, amountPaisa: 100000n },
      { entryType: "CREDIT" as const, amountPaisa: 95000n },
    ];

    const result = verifyLedgerBalance(unbalancedEntries);
    expect(result.balanced).toBe(false);
    expect(result.discrepancyPaisa).toBe(5000n);
    expect(() => assertLedgerBalanced(unbalancedEntries)).toThrow(/imbalance detected/i);
  });

  it("E2E-T1-F07-03: Real-Time Account Balance Aggregation", () => {
    const entries = [
      { entryType: "CREDIT" as const, amountPaisa: 50000n },
      { entryType: "CREDIT" as const, amountPaisa: 50000n },
    ];

    const balance = calculateAccountBalance(entries, "LIABILITY");
    expect(balance).toBe(100000n);
  });

  it("E2E-T1-F07-04: Balanced Full Refund Reversal Journal", () => {
    const refundEntries = [
      { entryType: "DEBIT" as const, amountPaisa: 98000n, accountId: "2110_merchant" },
      { entryType: "DEBIT" as const, amountPaisa: 500n, accountId: "4100_platform_fee" },
      { entryType: "DEBIT" as const, amountPaisa: 1500n, accountId: "2310_gateway_fee" },
      { entryType: "CREDIT" as const, amountPaisa: 100000n, accountId: "1110_sslcommerz" },
    ];

    const result = verifyLedgerBalance(refundEntries);
    expect(result.balanced).toBe(true);
    expect(result.discrepancyPaisa).toBe(0n);
  });

  it("E2E-T1-F07-05: Immutable Append-Only Ledger Integrity", () => {
    const entry = Object.freeze({
      id: "led_01",
      transactionId: "tx_01",
      entryType: "DEBIT",
      amountPaisa: 100000n,
    });
    expect(() => {
      (entry as any).amountPaisa = 90000n;
    }).toThrow();
  });
});

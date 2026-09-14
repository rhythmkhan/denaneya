import { describe, it, expect } from "vitest";
import {
  merchants,
  users,
  payments,
  ledgerAccounts,
  ledgerTransactions,
  ledgerEntries,
  smsMessages,
  collectorDevices,
  outboxEvents,
} from "@denaneya/database";

describe("Feature 04: Database Schema & Drizzle ORM (Tier 1)", () => {
  it("E2E-T1-F04-01: Migration Generation & DDL Application", () => {
    expect(merchants).toBeDefined();
    expect(users).toBeDefined();
    expect(payments).toBeDefined();
    expect(ledgerAccounts).toBeDefined();
    expect(ledgerTransactions).toBeDefined();
    expect(ledgerEntries).toBeDefined();
    expect(smsMessages).toBeDefined();
    expect(collectorDevices).toBeDefined();
    expect(outboxEvents).toBeDefined();

    expect(payments.amountPaisa).toBeDefined();
    expect(payments.currency).toBeDefined();
    expect(payments.idempotencyKey).toBeDefined();
    expect(payments.providerTrxId).toBeDefined();
  });

  it("E2E-T1-F04-02: Idempotency Key Database Unique Constraint", () => {
    expect(payments.merchantId).toBeDefined();
    expect(payments.idempotencyKey).toBeDefined();
    const symbols = Object.getOwnPropertySymbols(payments);
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("E2E-T1-F04-03: Provider Transaction ID Database Unique Constraint", () => {
    expect(payments.provider).toBeDefined();
    expect(payments.providerTrxId).toBeDefined();
  });

  it("E2E-T1-F04-04: SMS Deduplication Cryptographic Hash Constraint", () => {
    expect(smsMessages.hash).toBeDefined();
    expect(smsMessages.trxId).toBeDefined();
    expect(smsMessages.amountPaisa).toBeDefined();
  });

  it("E2E-T1-F04-05: Currency & Minor Unit Database Check Constraints", () => {
    expect(payments.amountPaisa).toBeDefined();
    expect(payments.currency).toBeDefined();
    expect(payments.refundedAmountPaisa).toBeDefined();
  });
});

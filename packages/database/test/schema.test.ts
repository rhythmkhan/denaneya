import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableName } from 'drizzle-orm';
import {
  merchants,
  users,
  merchantMemberships,
  apiKeys,
  accounts,
  sessions,
  verificationTokens,
  paymentLinks,
  invoices,
  invoiceItems,
  payments,
  refunds,
  ledgerAccounts,
  ledgerTransactions,
  ledgerEntries,
  collectorDevices,
  collectorEvents,
  smsMessages,
  webhookSubscriptions,
  webhookDeliveries,
  outboxEvents,
  fraudEvaluations,
  reviewCases,
  auditLogs,
} from '../src/schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Drizzle Database Schema & Structural Invariants', () => {
  it('T3.1: exports all core domain tables with correct PostgreSQL table names', () => {
    expect(getTableName(merchants)).toBe('merchants');
    expect(getTableName(users)).toBe('users');
    expect(getTableName(merchantMemberships)).toBe('merchant_memberships');
    expect(getTableName(apiKeys)).toBe('api_keys');
    expect(getTableName(accounts)).toBe('accounts');
    expect(getTableName(sessions)).toBe('sessions');
    expect(getTableName(verificationTokens)).toBe('verification_tokens');
    expect(getTableName(paymentLinks)).toBe('payment_links');
    expect(getTableName(invoices)).toBe('invoices');
    expect(getTableName(invoiceItems)).toBe('invoice_items');
    expect(getTableName(payments)).toBe('payments');
    expect(getTableName(refunds)).toBe('refunds');
    expect(getTableName(ledgerAccounts)).toBe('ledger_accounts');
    expect(getTableName(ledgerTransactions)).toBe('ledger_transactions');
    expect(getTableName(ledgerEntries)).toBe('ledger_entries');
    expect(getTableName(collectorDevices)).toBe('collector_devices');
    expect(getTableName(collectorEvents)).toBe('collector_events');
    expect(getTableName(smsMessages)).toBe('sms_messages');
    expect(getTableName(webhookSubscriptions)).toBe('webhook_subscriptions');
    expect(getTableName(webhookDeliveries)).toBe('webhook_deliveries');
    expect(getTableName(outboxEvents)).toBe('outbox_events');
    expect(getTableName(fraudEvaluations)).toBe('fraud_evaluations');
    expect(getTableName(reviewCases)).toBe('review_cases');
    expect(getTableName(auditLogs)).toBe('audit_logs');
  });

  it('T3.2: enforces strict 64-bit integer paisa minor units (zero floating-point currency)', () => {
    // Inspect column data types in Drizzle table schemas
    expect(payments.amountPaisa.dataType).toBe('bigint');
    expect(payments.feePaisa.dataType).toBe('bigint');
    expect(payments.refundedAmountPaisa.dataType).toBe('bigint');

    expect(invoices.subtotalPaisa.dataType).toBe('bigint');
    expect(invoices.totalAmountPaisa.dataType).toBe('bigint');
    expect(invoiceItems.unitPricePaisa.dataType).toBe('bigint');
    expect(invoiceItems.totalPaisa.dataType).toBe('bigint');

    expect(refunds.amountPaisa.dataType).toBe('bigint');
    expect(ledgerEntries.amountPaisa.dataType).toBe('bigint');
    expect(smsMessages.amountPaisa.dataType).toBe('bigint');
  });

  it('T3.3: contains composite unique indexes and anti-replay constraints', () => {
    // Verify payments composite unique index exists in migration DDL
    const ddlPath = join(__dirname, '../migrations/0000_core_tables.sql');
    expect(existsSync(ddlPath)).toBe(true);
    const ddl = readFileSync(ddlPath, 'utf-8');

    // Payments idempotency and provider trx uniqueness
    expect(ddl).toContain('idx_payments_merchant_idempotency');
    expect(ddl).toContain('idx_payments_provider_trx_unique');

    // SMS hash deduplication
    expect(ddl).toContain('idx_sms_messages_hash');

    // Device replay prevention (sequence and nonce)
    expect(ddl).toContain('idx_collector_events_device_sequence');
    expect(ddl).toContain('idx_collector_events_device_nonce');

    // Ledger account code uniqueness per merchant
    expect(ddl).toContain('idx_ledger_accounts_code_merchant');

    // Invoice number uniqueness per merchant
    expect(ddl).toContain('idx_invoices_merchant_number');
  });

  it('T3.4: defines PL/pgSQL deferred ledger balance trigger and immutability rules', () => {
    const triggersPath = join(__dirname, '../migrations/0001_triggers_functions.sql');
    expect(existsSync(triggersPath)).toBe(true);
    const triggersSql = readFileSync(triggersPath, 'utf-8');

    // Deferred ledger balance trigger
    expect(triggersSql).toContain('verify_ledger_transaction_balanced');
    expect(triggersSql).toContain('trg_verify_ledger_balance');
    expect(triggersSql).toContain('DEFERRABLE INITIALLY DEFERRED');

    // Immutability functions
    expect(triggersSql).toContain('forbid_ledger_modifications');
    expect(triggersSql).toContain('prevent_ledger_modification');
    expect(triggersSql).toContain('trg_immutable_ledger_transactions');
    expect(triggersSql).toContain('trg_immutable_ledger_entries');
    expect(triggersSql).toContain('forbid_audit_log_modifications');
    expect(triggersSql).toContain('trg_immutable_audit_logs');

    // State machine transition guard
    expect(triggersSql).toContain('enforce_payment_state_transition');
    expect(triggersSql).toContain('trg_enforce_payment_transition');
  });

  it('T3.5: strictly enforces BEFORE UPDATE OR DELETE on ledger entries and transactions', () => {
    const triggersPath = join(__dirname, '../migrations/0001_triggers_functions.sql');
    const triggersSql = readFileSync(triggersPath, 'utf-8');

    // Both ledger_transactions AND ledger_entries MUST guard BEFORE UPDATE OR DELETE
    expect(triggersSql).toMatch(
      /CREATE\s+TRIGGER\s+trg_immutable_ledger_transactions\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+ledger_transactions/i
    );
    expect(triggersSql).toMatch(
      /CREATE\s+TRIGGER\s+trg_immutable_ledger_entries\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+ledger_entries/i
    );
  });
});

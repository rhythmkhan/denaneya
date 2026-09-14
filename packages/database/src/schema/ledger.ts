import { pgTable, text, timestamp, boolean, bigint, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import {
  accountTypeEnum,
  normalBalanceEnum,
  entryDirectionEnum,
  ledgerTxTypeEnum,
} from './enums.js';

// 1. LEDGER ACCOUNTS (Chart of Accounts)
export const ledgerAccounts = pgTable('ledger_accounts', {
  id: text('id').primaryKey(), // 'acc_' + code (e.g. 'acc_1110' or 'acc_mch_123_2110')
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'restrict' }), // NULL for system/platform accounts
  code: text('code').notNull(), // '1110', '2110', etc.
  name: text('name').notNull(),
  type: accountTypeEnum('type').notNull(),
  normalBalance: normalBalanceEnum('normal_balance').notNull(),
  currency: text('currency').notNull().default('BDT'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_ledger_accounts_code_merchant').on(table.code, table.merchantId),
  index('idx_ledger_accounts_merchant').on(table.merchantId),
  index('idx_ledger_accounts_type').on(table.type),
]);

// 2. LEDGER TRANSACTIONS (Journal Master)
export const ledgerTransactions = pgTable('ledger_transactions', {
  id: text('id').primaryKey(), // 'ltx_' + nanoid(16)
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'restrict' }),
  transactionType: ledgerTxTypeEnum('transaction_type').notNull(),
  referenceType: text('reference_type').notNull(), // 'PAYMENT', 'REFUND', 'PAYOUT', 'ADJUSTMENT'
  referenceId: text('reference_id').notNull(), // paymentId, refundId, payoutId
  idempotencyKey: text('idempotency_key').unique(),
  description: text('description').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ledger_tx_reference').on(table.referenceType, table.referenceId),
  index('idx_ledger_tx_merchant').on(table.merchantId),
  index('idx_ledger_tx_posted_at').on(table.postedAt),
]);

// 3. LEDGER ENTRIES (Debit / Credit Postings)
export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey(), // 'len_' + nanoid(16)
  transactionId: text('transaction_id').notNull().references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
  accountId: text('account_id').notNull().references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
  direction: entryDirectionEnum('direction').notNull(),
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('BDT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ledger_entries_tx').on(table.transactionId),
  index('idx_ledger_entries_account').on(table.accountId),
  check('chk_ledger_entry_amount_positive', sql`amount_paisa > 0`),
  check('chk_ledger_entry_currency_bdt', sql`currency = 'BDT'`),
]);

// Relations
export const ledgerAccountsRelations = relations(ledgerAccounts, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [ledgerAccounts.merchantId],
    references: [merchants.id],
  }),
  entries: many(ledgerEntries),
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [ledgerTransactions.merchantId],
    references: [merchants.id],
  }),
  entries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.transactionId],
    references: [ledgerTransactions.id],
  }),
  account: one(ledgerAccounts, {
    fields: [ledgerEntries.accountId],
    references: [ledgerAccounts.id],
  }),
}));

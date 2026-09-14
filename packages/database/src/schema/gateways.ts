import { pgTable, text, timestamp, integer, bigint, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';

// 1. GATEWAY SETTLEMENT BATCHES
export const gatewaySettlementBatches = pgTable('gateway_settlement_batches', {
  id: text('id').primaryKey(), // 'stl_' + nanoid(16)
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'restrict' }), // NULL for system-wide batches
  provider: text('provider').notNull(), // 'SSLCOMMERZ' | 'BKASH' | 'NAGAD' | 'SHURJOPAY' | 'AAMARPAY' | 'MOCK'
  batchReference: text('batch_reference').notNull(), // Statement identifier or filename (e.g. 'SSL-20260913-01.csv')
  statementDate: timestamp('statement_date', { withTimezone: true }).notNull(),
  totalTransactions: integer('total_transactions').notNull().default(0),
  totalGrossPaisa: bigint('total_gross_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  totalFeePaisa: bigint('total_fee_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  totalNetPaisa: bigint('total_net_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  currency: text('currency').notNull().default('BDT'),
  status: text('status').notNull().default('INGESTED'), // 'INGESTED', 'PROCESSING', 'RECONCILED', 'DISCREPANCIES_DETECTED', 'FAILED'
  fileHash: text('file_hash').notNull(), // SHA-256 of raw uploaded statement for deduplication
  uploadedBy: text('uploaded_by').notNull().default('SYSTEM'), // User ID, API Key, or 'SYSTEM'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_settlement_batches_provider_hash').on(table.provider, table.fileHash),
  index('idx_settlement_batches_merchant_date').on(table.merchantId, table.statementDate),
  index('idx_settlement_batches_status').on(table.status),
  check('chk_batch_gross_positive', sql`total_gross_paisa >= 0`),
]);

// 2. GATEWAY SETTLEMENT ITEMS
export const gatewaySettlementItems = pgTable('gateway_settlement_items', {
  id: text('id').primaryKey(), // 'sit_' + nanoid(16)
  batchId: text('batch_id').notNull().references(() => gatewaySettlementBatches.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerTrxId: text('provider_trx_id').notNull(), // Provider transaction ID (e.g. '9K76TRX01')
  merchantTxId: text('merchant_tx_id'), // Internal DenaNeya payment ID (e.g. 'pay_...')
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
  feePaisa: bigint('fee_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  netAmountPaisa: bigint('net_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  currency: text('currency').notNull().default('BDT'),
  providerStatus: text('provider_status').notNull().default('COMPLETED'), // 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'
  transactionTime: timestamp('transaction_time', { withTimezone: true }).notNull(),
  rawRecord: jsonb('raw_record'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_settlement_items_batch_trx').on(table.batchId, table.providerTrxId),
  index('idx_settlement_items_provider_trx').on(table.provider, table.providerTrxId),
  index('idx_settlement_items_merchant_tx').on(table.merchantTxId),
  check('chk_item_amount_positive', sql`amount_paisa >= 0`),
]);

// Relations
export const gatewaySettlementBatchesRelations = relations(gatewaySettlementBatches, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [gatewaySettlementBatches.merchantId],
    references: [merchants.id],
  }),
  items: many(gatewaySettlementItems),
}));

export const gatewaySettlementItemsRelations = relations(gatewaySettlementItems, ({ one }) => ({
  batch: one(gatewaySettlementBatches, {
    fields: [gatewaySettlementItems.batchId],
    references: [gatewaySettlementBatches.id],
  }),
}));

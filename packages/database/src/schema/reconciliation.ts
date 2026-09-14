import { pgTable, text, timestamp, integer, bigint, jsonb, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import { gatewaySettlementBatches } from './gateways.js';

// 1. RECONCILIATION RUNS (Execution Master)
export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: text('id').primaryKey(), // 'rec_' + nanoid(16)
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'restrict' }), // NULL for platform-wide
  provider: text('provider'), // 'SSLCOMMERZ' | 'BKASH' | 'NAGAD' | 'ALL'
  batchId: text('batch_id').references(() => gatewaySettlementBatches.id, { onDelete: 'set null' }),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('PENDING'), // 'PENDING', 'RUNNING', 'MATCHED', 'DISCREPANCIES_DETECTED', 'FAILED'
  totalRecordsEvaluated: integer('total_records_evaluated').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  discrepancyCount: integer('discrepancy_count').notNull().default(0),
  autoHealedCount: integer('auto_healed_count').notNull().default(0),
  totalInternalAmountPaisa: bigint('total_internal_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  totalProviderAmountPaisa: bigint('total_provider_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  totalLedgerAmountPaisa: bigint('total_ledger_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  netDiscrepancyAmountPaisa: bigint('net_discrepancy_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  summary: jsonb('summary'), // Detailed breakdown by category
  triggeredBy: text('triggered_by').notNull().default('MANUAL'), // 'MANUAL', 'QSTASH_CRON', 'API'
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_reconciliation_runs_merchant_date').on(table.merchantId, table.createdAt),
  index('idx_reconciliation_runs_status').on(table.status),
]);

// 2. RECONCILIATION DISCREPANCIES
export const reconciliationDiscrepancies = pgTable('reconciliation_discrepancies', {
  id: text('id').primaryKey(), // 'rcd_' + nanoid(16)
  runId: text('run_id').notNull().references(() => reconciliationRuns.id, { onDelete: 'cascade' }),
  batchId: text('batch_id').references(() => gatewaySettlementBatches.id, { onDelete: 'set null' }),
  discrepancyType: text('discrepancy_type').notNull(), // 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH' | 'MISSING_IN_LEDGER' | 'MISSING_IN_GATEWAY' | 'UNEXPECTED_GATEWAY_TX' | 'FEE_DISCREPANCY'
  paymentId: text('payment_id'), // Internal DenaNeya payment ID (nullable if UNEXPECTED_GATEWAY_TX)
  providerTrxId: text('provider_trx_id'), // Provider TrxID (nullable if MISSING_IN_GATEWAY)
  provider: text('provider').notNull(),
  merchantId: text('merchant_id'),
  internalAmountPaisa: bigint('internal_amount_paisa', { mode: 'bigint' }),
  providerAmountPaisa: bigint('provider_amount_paisa', { mode: 'bigint' }),
  ledgerAmountPaisa: bigint('ledger_amount_paisa', { mode: 'bigint' }),
  discrepancyAmountPaisa: bigint('discrepancy_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`), // provider - internal
  internalStatus: text('internal_status'),
  providerStatus: text('provider_status'),
  expectedFeePaisa: bigint('expected_fee_paisa', { mode: 'bigint' }),
  actualFeePaisa: bigint('actual_fee_paisa', { mode: 'bigint' }),
  resolutionStatus: text('resolution_status').notNull().default('UNRESOLVED'), // 'UNRESOLVED', 'AUTO_RESOLVED', 'MANUALLY_ADJUSTED', 'INVESTIGATING', 'DISMISSED'
  resolutionNotes: text('resolution_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_reconciliation_discrepancies_run').on(table.runId),
  index('idx_reconciliation_discrepancies_type').on(table.discrepancyType),
  index('idx_reconciliation_discrepancies_payment').on(table.paymentId),
  index('idx_reconciliation_discrepancies_provider_trx').on(table.providerTrxId),
  index('idx_reconciliation_discrepancies_resolution').on(table.resolutionStatus),
]);

// Relations
export const reconciliationRunsRelations = relations(reconciliationRuns, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [reconciliationRuns.merchantId],
    references: [merchants.id],
  }),
  batch: one(gatewaySettlementBatches, {
    fields: [reconciliationRuns.batchId],
    references: [gatewaySettlementBatches.id],
  }),
  discrepancies: many(reconciliationDiscrepancies),
}));

export const reconciliationDiscrepanciesRelations = relations(reconciliationDiscrepancies, ({ one }) => ({
  run: one(reconciliationRuns, {
    fields: [reconciliationDiscrepancies.runId],
    references: [reconciliationRuns.id],
  }),
  batch: one(gatewaySettlementBatches, {
    fields: [reconciliationDiscrepancies.batchId],
    references: [gatewaySettlementBatches.id],
  }),
}));

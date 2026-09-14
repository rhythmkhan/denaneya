import { pgTable, text, timestamp, integer, bigint, jsonb, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import {
  paymentStatusEnum,
  refundStatusEnum,
  paymentLinkTypeEnum,
  paymentLinkStatusEnum,
  invoiceStatusEnum,
  verificationTierEnum,
} from './enums.js';

// 1. PAYMENT LINKS
export const paymentLinks = pgTable('payment_links', {
  id: text('id').primaryKey(), // 'plk_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }), // NULL allows customer-specified amount
  currency: text('currency').notNull().default('BDT'),
  type: paymentLinkTypeEnum('type').notNull().default('SINGLE_USE'),
  status: paymentLinkStatusEnum('status').notNull().default('ACTIVE'),
  allowedProviders: jsonb('allowed_providers').$type<string[]>().default(sql`'["BKASH","NAGAD","ROCKET","SSLCOMMERZ"]'::jsonb`),
  redirectUrl: text('redirect_url'),
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_payment_links_merchant').on(table.merchantId),
  index('idx_payment_links_slug').on(table.slug),
]);

// 2. INVOICES
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(), // 'inv_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'restrict' }),
  invoiceNumber: text('invoice_number').notNull(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone'),
  customerAddress: jsonb('customer_address'),
  subtotalPaisa: bigint('subtotal_paisa', { mode: 'bigint' }).notNull(),
  taxPaisa: bigint('tax_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  discountPaisa: bigint('discount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  totalAmountPaisa: bigint('total_amount_paisa', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('BDT'),
  status: invoiceStatusEnum('status').notNull().default('DRAFT'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentId: text('payment_id'), // Linked upon payment
  notes: text('notes'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_invoices_merchant_number').on(table.merchantId, table.invoiceNumber),
  index('idx_invoices_merchant_status').on(table.merchantId, table.status),
  check('chk_invoice_amounts', sql`total_amount_paisa >= 0 AND subtotal_paisa >= 0`),
]);

// 3. INVOICE ITEMS
export const invoiceItems = pgTable('invoice_items', {
  id: text('id').primaryKey(), // 'itm_' + nanoid(16)
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPricePaisa: bigint('unit_price_paisa', { mode: 'bigint' }).notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  totalPaisa: bigint('total_paisa', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_invoice_items_invoice').on(table.invoiceId),
  check('chk_invoice_item_quantity', sql`quantity > 0`),
  check('chk_invoice_item_price', sql`unit_price_paisa >= 0`),
]);

// 4. PAYMENTS MASTER TABLE
export const payments = pgTable('payments', {
  id: text('id').primaryKey(), // 'pay_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'restrict' }),
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('BDT'),
  status: paymentStatusEnum('status').notNull().default('CREATED'),
  feePaisa: bigint('fee_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  refundedAmountPaisa: bigint('refunded_amount_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  billingAddress: jsonb('billing_address'),
  provider: text('provider'), // 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY', 'SANDBOX'
  providerTrxId: text('provider_trx_id'), // Upstream TrxID (e.g. '9K76TRX01')
  providerSessionId: text('provider_session_id'), // Session token / gateway redirect key
  providerMetadata: jsonb('provider_metadata'),
  idempotencyKey: text('idempotency_key'),
  paymentLinkId: text('payment_link_id').references(() => paymentLinks.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  description: text('description'),
  metadata: jsonb('metadata'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  verifiedTier: verificationTierEnum('verified_tier'),
  riskScore: integer('risk_score'),
  version: integer('version').notNull().default(1), // Optimistic concurrency lock
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Crucial Unique Constraints
  uniqueIndex('idx_payments_merchant_idempotency')
    .on(table.merchantId, table.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),
  uniqueIndex('idx_payments_provider_trx_unique')
    .on(table.provider, table.providerTrxId)
    .where(sql`provider_trx_id IS NOT NULL`),
  
  // Performance Indexes
  index('idx_payments_merchant_status').on(table.merchantId, table.status),
  index('idx_payments_created_at').on(table.createdAt),
  index('idx_payments_customer_phone').on(table.customerPhone),

  // Check Constraints
  check('chk_payment_amount_positive', sql`amount_paisa > 0`),
  check('chk_payment_refund_bounds', sql`refunded_amount_paisa >= 0 AND refunded_amount_paisa <= amount_paisa`),
  check('chk_payment_currency_bdt', sql`currency = 'BDT'`),
]);

// 5. REFUNDS TABLE
export const refunds = pgTable('refunds', {
  id: text('id').primaryKey(), // 'ref_' + nanoid(16)
  paymentId: text('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'restrict' }),
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('BDT'),
  status: refundStatusEnum('status').notNull().default('PENDING'),
  reason: text('reason').notNull(),
  providerRefundId: text('provider_refund_id'),
  providerMetadata: jsonb('provider_metadata'),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_refunds_idempotency')
    .on(table.merchantId, table.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),
  index('idx_refunds_payment_id').on(table.paymentId),
  index('idx_refunds_merchant_id').on(table.merchantId),
  check('chk_refund_amount_positive', sql`amount_paisa > 0`),
  check('chk_refund_currency_bdt', sql`currency = 'BDT'`),
]);

// Relations
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [payments.merchantId],
    references: [merchants.id],
  }),
  paymentLink: one(paymentLinks, {
    fields: [payments.paymentLinkId],
    references: [paymentLinks.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, {
    fields: [refunds.paymentId],
    references: [payments.id],
  }),
  merchant: one(merchants, {
    fields: [refunds.merchantId],
    references: [merchants.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [invoices.merchantId],
    references: [merchants.id],
  }),
  items: many(invoiceItems),
  payment: one(payments, {
    fields: [invoices.paymentId],
    references: [payments.id],
  }),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

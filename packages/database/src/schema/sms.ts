import { pgTable, text, timestamp, boolean, integer, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import { collectorDevices } from './devices.js';
import { payments } from './payments.js';
import { mfsProviderEnum, smsStatusEnum } from './enums.js';

// SMS MESSAGES TABLE
export const smsMessages = pgTable('sms_messages', {
  id: text('id').primaryKey(), // 'sms_' + nanoid(16)
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  deviceId: text('device_id').references(() => collectorDevices.id, { onDelete: 'set null' }),
  provider: mfsProviderEnum('provider').notNull(),
  sender: text('sender').notNull(), // 'bKash', 'NAGAD', '16216', 'Upay'
  text: text('text').notNull(), // Raw SMS text
  amountPaisa: bigint('amount_paisa', { mode: 'bigint' }), // Extracted paisa amount
  trxId: text('trx_id'), // Extracted provider TrxID
  counterpartyMsisdn: text('counterparty_msisdn'), // Customer phone number
  rollingBalancePaisa: bigint('rolling_balance_paisa', { mode: 'bigint' }), // Balance reported in SMS
  feePaisa: bigint('fee_paisa', { mode: 'bigint' }).default(sql`0`),
  hash: text('hash').notNull().unique(), // SHA-256(provider + trxId + amountPaisa + sender)
  parserVersion: text('parser_version').notNull().default('v1'),
  simSlot: integer('sim_slot').default(0),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  status: smsStatusEnum('status').notNull().default('PENDING'),
  isConsumed: boolean('is_consumed').notNull().default(false),
  consumedByPaymentId: text('consumed_by_payment_id').references(() => payments.id),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Deduplication & Single Consumption Constraints
  uniqueIndex('idx_sms_messages_hash').on(table.hash),
  uniqueIndex('idx_sms_messages_single_consumption')
    .on(table.consumedByPaymentId)
    .where(sql`consumed_by_payment_id IS NOT NULL`),
  
  index('idx_sms_messages_trx_id').on(table.trxId),
  index('idx_sms_messages_merchant_status').on(table.merchantId, table.status),
]);

// Relations
export const smsMessagesRelations = relations(smsMessages, ({ one }) => ({
  merchant: one(merchants, {
    fields: [smsMessages.merchantId],
    references: [merchants.id],
  }),
  device: one(collectorDevices, {
    fields: [smsMessages.deviceId],
    references: [collectorDevices.id],
  }),
  consumedByPayment: one(payments, {
    fields: [smsMessages.consumedByPaymentId],
    references: [payments.id],
  }),
}));

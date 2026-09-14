import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import {
  webhookSubscriptionStatusEnum,
  webhookDeliveryStatusEnum,
  outboxStatusEnum,
} from './enums.js';

// 1. WEBHOOK SUBSCRIPTIONS (Endpoints registered by merchants)
export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: text('id').primaryKey(), // 'whs_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // Validated against SSRF blocklist
  secret: text('secret').notNull(), // AES-256-GCM encrypted signing secret
  events: jsonb('events').$type<string[]>().notNull().default(sql`'["payment.completed","refund.created"]'::jsonb`),
  status: webhookSubscriptionStatusEnum('status').notNull().default('ACTIVE'),
  description: text('description'),
  failureCount: integer('failure_count').notNull().default(0),
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webhook_subs_merchant').on(table.merchantId),
]);

// 2. WEBHOOK DELIVERIES (Attempt audit logs)
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(), // 'whd_' + nanoid(16)
  subscriptionId: text('subscription_id').notNull().references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(), // Links to outbox_events.id
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  requestHeaders: jsonb('request_headers'),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  responseHeaders: jsonb('response_headers'),
  durationMs: integer('duration_ms'),
  attempt: integer('attempt').notNull().default(1),
  status: webhookDeliveryStatusEnum('status').notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webhook_deliveries_sub').on(table.subscriptionId),
  index('idx_webhook_deliveries_event').on(table.eventId),
  index('idx_webhook_deliveries_status').on(table.status),
]);

// 3. TRANSACTIONAL OUTBOX EVENTS
export const outboxEvents = pgTable('outbox_events', {
  id: text('id').primaryKey(), // 'obx_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // 'payment.completed', 'payment.failed', etc.
  payload: jsonb('payload').notNull(),
  status: outboxStatusEnum('status').notNull().default('PENDING'),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_outbox_events_pending').on(table.status, table.scheduledAt),
  index('idx_outbox_events_merchant').on(table.merchantId),
]);

// Relations
export const webhookSubscriptionsRelations = relations(webhookSubscriptions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [webhookSubscriptions.merchantId],
    references: [merchants.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  subscription: one(webhookSubscriptions, {
    fields: [webhookDeliveries.subscriptionId],
    references: [webhookSubscriptions.id],
  }),
  merchant: one(merchants, {
    fields: [webhookDeliveries.merchantId],
    references: [merchants.id],
  }),
}));

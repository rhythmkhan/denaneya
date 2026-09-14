import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { merchants } from './auth.js';
import { auditActorTypeEnum } from './enums.js';

// AUDIT LOGS TABLE (Cryptographic Hash-Chained)
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(), // 'aud_' + nanoid(16)
  merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  actorId: text('actor_id').notNull(), // User ID, API Key ID, Device ID, or 'SYSTEM'
  actorType: auditActorTypeEnum('actor_type').notNull(),
  action: text('action').notNull(), // e.g. 'payment.completed', 'api_key.created', 'settings.updated'
  resourceType: text('resource_type').notNull(), // 'payment', 'api_key', 'device', 'invoice', etc.
  resourceId: text('resource_id').notNull(),
  previousHash: text('previous_hash').notNull(), // SHA-256 of previous audit_logs record
  currentHash: text('current_hash').notNull(), // SHA-256(id + timestamp + actorId + action + payload + previousHash)
  payload: jsonb('payload'), // Details / before-and-after diff
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_logs_merchant_action').on(table.merchantId, table.action),
  index('idx_audit_logs_resource').on(table.resourceType, table.resourceId),
  index('idx_audit_logs_timestamp').on(table.timestamp),
]);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  merchant: one(merchants, {
    fields: [auditLogs.merchantId],
    references: [merchants.id],
  }),
}));

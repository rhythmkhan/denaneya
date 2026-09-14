import { pgTable, text, timestamp, boolean, integer, bigint, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants } from './auth.js';
import {
  deviceStatusEnum,
  collectorEventTypeEnum,
  collectorEventStatusEnum,
} from './enums.js';

// 1. COLLECTOR DEVICES TABLE
export const collectorDevices = pgTable('collector_devices', {
  id: text('id').primaryKey(), // 'dev_' + nanoid(16)
  deviceId: text('device_id').notNull().unique(), // Hardware Device UUID / Android ID
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  deviceName: text('device_name').notNull(),
  model: text('model'),
  osVersion: text('os_version'),
  appVersion: text('app_version'),
  publicKeyHex: text('public_key_hex').notNull(), // EC P-256 Public Key (Hex / SubjectPublicKeyInfo)
  sequenceNumber: bigint('sequence_number', { mode: 'bigint' }).notNull().default(sql`0`),
  simSlots: jsonb('sim_slots').$type<Array<{ slot: number; carrier: string; msisdn: string }>>(),
  assignedWallets: jsonb('assigned_wallets').$type<Array<{ provider: string; msisdn: string }>>(),
  batteryLevel: integer('battery_level'),
  isCharging: boolean('is_charging'),
  networkType: text('network_type'),
  status: deviceStatusEnum('status').notNull().default('PENDING_PAIRING'),
  pairingTokenHash: text('pairing_token_hash'),
  pairingTokenExpiresAt: timestamp('pairing_token_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_collector_devices_merchant').on(table.merchantId),
  index('idx_collector_devices_status').on(table.status),
]);

// 2. COLLECTOR EVENTS TABLE (For replay prevention & audit)
export const collectorEvents = pgTable('collector_events', {
  id: text('id').primaryKey(), // 'evt_' + nanoid(16)
  deviceId: text('device_id').notNull().references(() => collectorDevices.id, { onDelete: 'cascade' }),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  sequenceNumber: bigint('sequence_number', { mode: 'bigint' }).notNull(),
  nonce: text('nonce').notNull(),
  eventType: collectorEventTypeEnum('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  signature: text('signature').notNull(), // Base64 ECDSA signature
  timestamp: bigint('timestamp', { mode: 'bigint' }).notNull(), // Epoch milliseconds from device
  status: collectorEventStatusEnum('status').notNull().default('PROCESSED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Anti-Replay Unique Constraints
  uniqueIndex('idx_collector_events_device_sequence').on(table.deviceId, table.sequenceNumber),
  uniqueIndex('idx_collector_events_device_nonce').on(table.deviceId, table.nonce),
  index('idx_collector_events_device').on(table.deviceId),
]);

// Relations
export const collectorDevicesRelations = relations(collectorDevices, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [collectorDevices.merchantId],
    references: [merchants.id],
  }),
  events: many(collectorEvents),
}));

export const collectorEventsRelations = relations(collectorEvents, ({ one }) => ({
  device: one(collectorDevices, {
    fields: [collectorEvents.deviceId],
    references: [collectorDevices.id],
  }),
  merchant: one(merchants, {
    fields: [collectorEvents.merchantId],
    references: [merchants.id],
  }),
}));

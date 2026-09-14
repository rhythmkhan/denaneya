import { pgTable, text, timestamp, boolean, integer, bigint, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  merchantBusinessTypeEnum,
  kycStatusEnum,
  merchantStatusEnum,
  userStatusEnum,
  merchantRoleEnum,
  membershipStatusEnum,
  apiKeyTypeEnum,
  environmentEnum,
} from './enums.js';

// 1. MERCHANTS TABLE
export const merchants = pgTable('merchants', {
  id: text('id').primaryKey(), // 'mch_' + nanoid(16)
  name: text('name').notNull(),
  businessName: text('business_name').notNull(),
  businessType: merchantBusinessTypeEnum('business_type').notNull().default('INDIVIDUAL'),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  websiteUrl: text('website_url'),
  logoUrl: text('logo_url'),
  kycStatus: kycStatusEnum('kyc_status').notNull().default('PENDING'),
  status: merchantStatusEnum('status').notNull().default('ACTIVE'),
  defaultCurrency: text('default_currency').notNull().default('BDT'),
  environment: environmentEnum('environment').notNull().default('SANDBOX'),
  feeRateBps: integer('fee_rate_bps').notNull().default(150), // 1.50%
  fixedFeePaisa: bigint('fixed_fee_paisa', { mode: 'bigint' }).notNull().default(sql`0`),
  settlementBankName: text('settlement_bank_name'),
  settlementBankAccountNumber: text('settlement_bank_account_number'),
  settlementRoutingNumber: text('settlement_routing_number'),
  webhookSecret: text('webhook_secret'), // AES-256-GCM encrypted default webhook secret
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_merchants_email').on(table.email),
  index('idx_merchants_status').on(table.status),
]);

// 2. USERS TABLE
export const users = pgTable('users', {
  id: text('id').primaryKey(), // 'usr_' + nanoid(16)
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash'), // Argon2id hash
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  mfaSecret: text('mfa_secret'), // AES-256-GCM encrypted TOTP secret
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_users_email').on(table.email),
]);

// 3. MERCHANT MEMBERSHIPS (RBAC)
export const merchantMemberships = pgTable('merchant_memberships', {
  id: text('id').primaryKey(), // 'mem_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: merchantRoleEnum('role').notNull().default('VIEWER'),
  status: membershipStatusEnum('status').notNull().default('ACTIVE'),
  invitedEmail: text('invited_email'),
  invitationToken: text('invitation_token'),
  invitationExpiresAt: timestamp('invitation_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_merchant_user_membership').on(table.merchantId, table.userId),
  index('idx_memberships_user_id').on(table.userId),
  index('idx_memberships_merchant_id').on(table.merchantId),
]);

// 4. API KEYS
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(), // 'key_' + nanoid(16)
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // 'dn_live_sec_' or 'dn_test_sec_' + first 8 chars
  keyHash: text('key_hash').notNull(), // Argon2id or SHA-256 hash of plaintext secret
  type: apiKeyTypeEnum('type').notNull().default('SECRET'),
  environment: environmentEnum('environment').notNull().default('SANDBOX'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'["payments:read","payments:write"]'::jsonb`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: text('revoked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_api_keys_lookup').on(table.keyPrefix, table.environment),
  index('idx_api_keys_merchant_id').on(table.merchantId),
]);

// 5. ACCOUNTS (Auth.js / NextAuth)
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
}, (table) => [
  uniqueIndex('idx_accounts_provider_provider_account_id').on(table.provider, table.providerAccountId),
]);

// 6. SESSIONS (Auth.js / NextAuth)
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  sessionToken: text('session_token').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

// 7. VERIFICATION TOKENS (Auth.js / NextAuth)
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('idx_verification_tokens_identifier_token').on(table.identifier, table.token),
]);

// Relations
export const merchantsRelations = relations(merchants, ({ many }) => ({
  memberships: many(merchantMemberships),
  apiKeys: many(apiKeys),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(merchantMemberships),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const merchantMembershipsRelations = relations(merchantMemberships, ({ one }) => ({
  merchant: one(merchants, {
    fields: [merchantMemberships.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [merchantMemberships.userId],
    references: [users.id],
  }),
}));

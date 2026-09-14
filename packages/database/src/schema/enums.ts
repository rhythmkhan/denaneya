import { pgEnum } from 'drizzle-orm/pg-core';

// 1. Tenancy & Auth Enums
export const merchantBusinessTypeEnum = pgEnum('merchant_business_type', [
  'INDIVIDUAL',
  'SOLE_PROPRIETORSHIP',
  'PARTNERSHIP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
]);

export const kycStatusEnum = pgEnum('kyc_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);

export const merchantStatusEnum = pgEnum('merchant_status', [
  'ACTIVE',
  'SUSPENDED',
  'TERMINATED',
]);

export const userStatusEnum = pgEnum('user_status', [
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
]);

export const merchantRoleEnum = pgEnum('merchant_role', [
  'OWNER',
  'ADMIN',
  'DEVELOPER',
  'FINANCE',
  'VIEWER',
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
]);

export const apiKeyTypeEnum = pgEnum('api_key_type', [
  'SECRET',
  'PUBLISHABLE',
]);

export const environmentEnum = pgEnum('environment', [
  'SANDBOX',
  'PRODUCTION',
]);

// 2. Payment Enums
export const paymentStatusEnum = pgEnum('payment_status', [
  'CREATED',
  'REQUIRES_ACTION',
  'PENDING',
  'PROCESSING',
  'UNDER_REVIEW',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export const refundStatusEnum = pgEnum('refund_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
]);

export const paymentLinkTypeEnum = pgEnum('payment_link_type', [
  'SINGLE_USE',
  'MULTI_USE',
]);

export const paymentLinkStatusEnum = pgEnum('payment_link_status', [
  'ACTIVE',
  'INACTIVE',
  'EXPIRED',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'SENT',
  'PAID',
  'OVERDUE',
  'VOID',
]);

export const verificationTierEnum = pgEnum('verification_tier', [
  'TIER_A', // Gateway Direct API
  'TIER_B', // Gateway Webhook + Query API
  'TIER_C', // Authenticated Android SMS Collector
  'TIER_D', // Manual Merchant Entry
]);

// 3. Ledger Enums
export const accountTypeEnum = pgEnum('account_type', [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
]);

export const normalBalanceEnum = pgEnum('normal_balance', [
  'DEBIT',
  'CREDIT',
]);

export const entryDirectionEnum = pgEnum('entry_direction', [
  'DEBIT',
  'CREDIT',
]);

export const ledgerTxTypeEnum = pgEnum('ledger_tx_type', [
  'PAYMENT_CAPTURE',
  'GATEWAY_FEE',
  'MERCHANT_PAYOUT',
  'REFUND',
  'DISPUTE_REVERSAL',
  'ADJUSTMENT',
]);

// 4. SMS & Device Enums
export const mfsProviderEnum = pgEnum('mfs_provider', [
  'BKASH',
  'NAGAD',
  'ROCKET',
  'UPAY',
]);

export const smsStatusEnum = pgEnum('sms_status', [
  'PENDING',
  'PARSED',
  'MATCHED',
  'PARSER_UNRECOGNIZED',
  'DUPLICATE',
  'DISCARDED',
]);

export const deviceStatusEnum = pgEnum('device_status', [
  'PENDING_PAIRING',
  'ACTIVE',
  'OFFLINE',
  'REVOKED',
]);

export const collectorEventTypeEnum = pgEnum('collector_event_type', [
  'SMS_RECEIVED',
  'HEARTBEAT',
  'STATUS_UPDATE',
]);

export const collectorEventStatusEnum = pgEnum('collector_event_status', [
  'PROCESSED',
  'REJECTED',
  'IGNORED',
]);

// 5. Webhooks & Outbox Enums
export const webhookSubscriptionStatusEnum = pgEnum('webhook_subscription_status', [
  'ACTIVE',
  'DISABLED',
  'FAILED',
]);

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'SUCCESS',
  'RETRYING',
  'DEAD_LETTER',
]);

export const outboxStatusEnum = pgEnum('outbox_status', [
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
]);

// 6. Fraud & Review Enums
export const riskClassificationEnum = pgEnum('risk_classification', [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const riskActionEnum = pgEnum('risk_action', [
  'ALLOW',
  'CHALLENGE',
  'UNDER_REVIEW',
  'BLOCK',
]);

export const reviewCaseStatusEnum = pgEnum('review_case_status', [
  'OPEN',
  'MAKER_RECOMMENDED',
  'CHECKER_APPROVED',
  'CHECKER_REJECTED',
  'AUTO_RESOLVED',
]);

export const reviewDecisionEnum = pgEnum('review_decision', [
  'APPROVE',
  'REJECT',
]);

// 7. Audit Enums
export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'USER',
  'API_KEY',
  'DEVICE',
  'SYSTEM',
]);

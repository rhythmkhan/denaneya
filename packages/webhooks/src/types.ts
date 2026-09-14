export const WEBHOOK_EVENT_TYPES = [
  'payment.created',
  'payment.requires_action',
  'payment.pending',
  'payment.processing',
  'payment.under_review',
  'payment.completed',
  'payment.failed',
  'payment.cancelled',
  'payment.expired',
  'payment.partially_refunded',
  'payment.refunded',
  'refund.created',
  'refund.succeeded',
  'refund.failed',
  'invoice.sent',
  'invoice.paid',
  'invoice.voided',
  'device.paired',
  'device.offline',
  'ping',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
export type WebhookDeliveryStatus = 'SUCCESS' | 'RETRYING' | 'DEAD_LETTER';
export type WebhookSubscriptionStatus = 'ACTIVE' | 'DISABLED' | 'FAILED';

export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string;
  event: WebhookEventType;
  apiVersion: 'v1';
  createdAt: string;
  merchantId: string;
  data: T;
}

export interface PaymentWebhookData {
  paymentId: string;
  merchantId: string;
  amountPaisa: string;
  currency: 'BDT';
  status: string;
  provider?: string;
  providerTrxId?: string;
  customerMsisdn?: string;
  customerEmail?: string;
  feePaisa?: string;
  netPaisa?: string;
  refundedPaisa?: string;
  metadata?: Record<string, unknown>;
  settledAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export interface RefundWebhookData {
  refundId: string;
  paymentId: string;
  merchantId: string;
  amountPaisa: string;
  currency: 'BDT';
  status: string;
  reason?: string;
  providerRefundId?: string;
  createdAt: string;
}

export interface PingWebhookData {
  subscriptionId: string;
  message: string;
  sentAt: string;
}

export interface EnqueueOutboxEventParams<T = Record<string, unknown>> {
  merchantId: string;
  eventType: WebhookEventType;
  payload: T;
  scheduledAt?: Date;
}

export interface OutboxEventRecord {
  id: string;
  merchantId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  retryCount: number;
  lastError: string | null;
  scheduledAt: Date;
  processedAt: Date | null;
  createdAt: Date;
}

export interface WebhookSubscriptionRecord {
  id: string;
  merchantId: string;
  url: string;
  secret: string;
  events: string[];
  status: WebhookSubscriptionStatus;
  description: string | null;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDispatchResult {
  statusCode: number | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ProcessOutboxOptions {
  batchSize?: number;
  maxConcurrency?: number;
}

export interface ProcessRetriesOptions {
  batchSize?: number;
}

export type DbExecutor = any;
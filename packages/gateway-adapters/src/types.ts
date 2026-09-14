import { Paisa } from '@denaneya/payment-core';

export const GATEWAY_PROVIDERS = [
  'SSLCOMMERZ',
  'SHURJOPAY',
  'AAMARPAY',
  'BKASH',
  'NAGAD',
  'MOCK',
] as const;

export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export type PaymentMethodType =
  | 'CARDS'
  | 'BKASH'
  | 'NAGAD'
  | 'ROCKET'
  | 'UPAY'
  | 'INTERNET_BANKING'
  | 'ALL';

export interface GatewayCustomerInfo {
  name: string;
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface InitiatePaymentParams {
  paymentId: string;
  merchantId: string;
  amount: Paisa;
  currency: 'BDT';
  customer: GatewayCustomerInfo;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  clientIp?: string;
  metadata?: Record<string, unknown>;
  preferredMethod?: PaymentMethodType;
}

export interface InitiatePaymentResult {
  provider: GatewayProvider;
  redirectUrl: string;
  providerPaymentId: string;
  sessionData?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface VerifyPaymentParams {
  paymentId: string;
  providerPaymentId?: string;
  providerTrxId?: string;
  amount?: Paisa;
  rawCallbackParams?: Record<string, string | unknown>;
  signature?: string;
  provider?: GatewayProvider;
}

export type GatewayTransactionStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface VerifyPaymentResult {
  provider: GatewayProvider;
  status: GatewayTransactionStatus;
  providerTrxId: string;
  providerPaymentId: string;
  amount: Paisa;
  fee: Paisa;
  currency: 'BDT';
  customerPhone?: string;
  cardType?: string;
  bankTrxId?: string;
  paidAt: Date;
  rawResponse: Record<string, unknown>;
}

export interface RefundParams {
  paymentId: string;
  providerTrxId: string;
  providerPaymentId?: string;
  refundAmount: Paisa;
  totalCapturedAmount: Paisa;
  refundReason: string;
  refundId: string;
  provider?: GatewayProvider;
}

export interface RefundResult {
  provider: GatewayProvider;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  providerRefundId: string;
  refundAmount: Paisa;
  refundedAt: Date;
  rawResponse: Record<string, unknown>;
}

export interface PaymentDetailsResult {
  provider: GatewayProvider;
  paymentId?: string;
  providerTrxId: string;
  status: GatewayTransactionStatus;
  amount: Paisa;
  currency: 'BDT';
  customerMsisdn?: string;
  paidAt?: Date;
  rawResponse: Record<string, unknown>;
}

export interface RefundDetailsResult {
  provider: GatewayProvider;
  providerRefundId: string;
  providerTrxId: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  amount: Paisa;
  rawResponse: Record<string, unknown>;
}

export interface GatewayHealthStatus {
  provider: GatewayProvider;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  message?: string;
  timestamp: Date;
}

export interface BaseGatewayConfig {
  isSandbox?: boolean;
  sandbox?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface GatewayHealthState {
  provider: GatewayProvider;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  lastProbeTime?: number;
  lastError?: string;
  latencyMs?: number;
}

export interface FailoverRouterConfig {
  primaryProvider?: GatewayProvider;
  fallbackProviders?: GatewayProvider[];
  methodRouting?: Partial<Record<PaymentMethodType, GatewayProvider[]>>;
  failureThreshold?: number;
  degradedThreshold?: number;
  recoveryCooldownMs?: number;
  successThresholdForRecovery?: number;
  failoverOnDegraded?: boolean;
  maxFailoverAttempts?: number;
}

export interface GatewayFailoverExecutionResult<T> {
  result: T;
  providerUsed: GatewayProvider;
  failoverOccurred: boolean;
  attempts: number;
  errors?: Array<{ provider: GatewayProvider; error: unknown }>;
}

export interface SslCommerzConfig extends BaseGatewayConfig {
  storeId: string;
  storePassword: string;
}

export interface ShurjoPayConfig extends BaseGatewayConfig {
  username: string;
  password: string;
  prefix: string;
}

export interface AamarPayConfig extends BaseGatewayConfig {
  storeId: string;
  signatureKey: string;
}

export interface BkashConfig extends BaseGatewayConfig {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
}

export interface NagadConfig extends BaseGatewayConfig {
  merchantId: string;
  merchantPrivateKey: string;
  nagadPublicKey: string;
}

export interface MockConfig extends BaseGatewayConfig {
  simulatedLatencyMs?: number;
  defaultStatus?: GatewayTransactionStatus;
  mockFailurePatterns?: boolean;
}

export type GatewayConfig =
  | SslCommerzConfig
  | ShurjoPayConfig
  | AamarPayConfig
  | BkashConfig
  | NagadConfig
  | MockConfig;
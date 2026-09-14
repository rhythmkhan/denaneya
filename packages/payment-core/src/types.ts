/**
 * DenaNeya Payment Core Domain Types
 */

export type Currency = 'BDT';

export const PAYMENT_STATES = [
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
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

export const TERMINAL_STATES: readonly PaymentState[] = [
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;

export type TerminalPaymentState = (typeof TERMINAL_STATES)[number];

export interface PaymentTransitionContext {
  paymentId: string;
  currentState: PaymentState;
  targetState: PaymentState;
  triggerEvent: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  operatorId?: string;
  makerId?: string;
  checkerId?: string;
  amountPaisa?: bigint;
  capturedAmountPaisa?: bigint;
  existingRefundedAmountPaisa?: bigint;
  newRefundAmountPaisa?: bigint;
  riskScore?: number;
  currentVersion?: number;
}

export interface TransitionValidationResult {
  allowed: boolean;
  error?: string;
  errorCode?: string;
}

export interface PaymentRecord {
  id: string;
  merchantId: string;
  amountPaisa: bigint;
  currency: Currency;
  status: PaymentState;
  feePaisa: bigint;
  refundedAmountPaisa: bigint;
  version: number;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  provider?: string | null;
  providerTrxId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormattedBDTOptions {
  includeSymbol?: boolean; // Prepends '৳' (Bengali Taka sign)
  currencyCode?: boolean;  // Appends 'BDT'
  locale?: 'en' | 'bn';    // 'en' formats as 1,50,000.00; 'bn' formats with Bengali digits ১,৫০,০০০.০০
  useGrouping?: boolean;   // Enables South Asian comma separation (Lakh/Crore)
}

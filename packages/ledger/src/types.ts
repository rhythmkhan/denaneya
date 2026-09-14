/**
 * DenaNeya Ledger Domain Types
 */

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type EntryDirection = 'DEBIT' | 'CREDIT';

export type LedgerTransactionType =
  | 'PAYMENT_CAPTURE'
  | 'GATEWAY_FEE'
  | 'MERCHANT_PAYOUT'
  | 'REFUND'
  | 'DISPUTE_REVERSAL'
  | 'ADJUSTMENT';

export type SystemAccountCode =
  | '1010'
  | '1020'
  | '1030'
  | '2010'
  | '2020'
  | '2030'
  | '4010'
  | '5010'
  | '3010';

export interface SystemAccountDefinition {
  code: string;
  name: string;
  type: AccountCategory;
  normalBalance: NormalBalance;
  description: string;
}

export interface LedgerPostingEntry {
  accountId: string;
  direction: EntryDirection;
  amountPaisa: bigint;
  currency: 'BDT';
  accountType?: AccountCategory;
}

export interface PostTransactionRequest {
  merchantId?: string | null;
  transactionType: LedgerTransactionType;
  referenceType: string;
  referenceId: string;
  idempotencyKey?: string | null;
  description: string;
  entries: LedgerPostingEntry[];
}

export interface PostTransactionResult {
  transactionId: string;
  postedAt: Date;
  alreadyExisted: boolean;
  totalAmountPaisa: bigint;
}

export interface PaymentCaptureTemplateParams {
  paymentId: string;
  merchantId: string;
  provider: string; // 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'SSLCOMMERZ' | 'SHURJOPAY' | 'AAMARPAY' | 'SANDBOX'
  grossAmountPaisa: bigint;
  platformFeePaisa: bigint;
  reservePaisa?: bigint;
  idempotencyKey?: string;
}

export interface MerchantPayoutTemplateParams {
  payoutId: string;
  merchantId: string;
  amountPaisa: bigint;
  idempotencyKey?: string;
  notes?: string;
}

export interface RefundTemplateParams {
  refundId: string;
  paymentId: string;
  merchantId: string;
  refundAmountPaisa: bigint;
  platformFeeRefundPaisa?: bigint;
  idempotencyKey?: string;
}

export interface ReserveReleaseTemplateParams {
  releaseId: string;
  merchantId: string;
  amountPaisa: bigint;
  idempotencyKey?: string;
  reason?: string;
}

export interface SettlePaymentParams {
  paymentId: string;
  provider?: string;
  providerTrxId?: string;
  smsMessageId?: string;
  amountPaisa?: bigint;
  feePaisa?: bigint;
  reservePaisa?: bigint;
}

export interface SettlementResult {
  paymentId: string;
  status: 'COMPLETED';
  settledAt: Date;
  ledgerTransactionId?: string;
  outboxEventId?: string;
  alreadySettled: boolean;
}

export interface AccountBalanceResult {
  accountId: string;
  merchantId?: string | null;
  code: string;
  name: string;
  type: AccountCategory;
  normalBalance: NormalBalance;
  currency: 'BDT';
  balancePaisa: bigint;
  totalDebits: bigint;
  totalCredits: bigint;
  entryCount: number;
}

export interface MerchantBalanceSummary {
  merchantId: string;
  availableBalancePaisa: bigint;
  rollingReservePaisa: bigint;
  pendingRefundPaisa: bigint;
  totalSettledPaisa: bigint;
  totalWithdrawnPaisa: bigint;
  currency: 'BDT';
  asOf: Date;
}

export interface LedgerIntegrityReport {
  isBalanced: boolean;
  totalDebitsPaisa: bigint;
  totalCreditsPaisa: bigint;
  netDifferencePaisa: bigint;
  totalEntries: number;
  unbalancedTransactionIds: string[];
  verifiedAt: Date;
}

export type DbExecutor = any;

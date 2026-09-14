import { Paisa } from '@denaneya/payment-core';

export const MFS_PROVIDERS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

export const SMS_TRANSACTION_TYPES = [
  'PAYMENT_RECEIVED',
  'CASH_IN',
  'CASH_OUT',
  'SEND_MONEY',
  'UNKNOWN',
] as const;
export type SmsTransactionType = (typeof SMS_TRANSACTION_TYPES)[number];

export const SMS_PARSER_STATUSES = ['SUCCESS', 'PARSER_UNRECOGNIZED'] as const;
export type SmsParserStatus = (typeof SMS_PARSER_STATUSES)[number];

export const BALANCE_CHAIN_STATUSES = [
  'VERIFIED',
  'DISCONTINUITY_DETECTED',
  'UNKNOWN_BASELINE',
] as const;
export type BalanceChainStatus = (typeof BALANCE_CHAIN_STATUSES)[number];

export const DISCONTINUITY_TYPES = [
  'NONE',
  'SKIPPED_CREDIT_SMS',
  'SKIPPED_DEBIT_TRANSACTION',
  'FEE_MISMATCH',
  'TAMPERING',
  'OUT_OF_ORDER',
] as const;
export type DiscontinuityType = (typeof DISCONTINUITY_TYPES)[number];

export interface ParsedSmsResult {
  readonly provider: MfsProvider;
  readonly type: SmsTransactionType;
  readonly trxId: string;
  readonly amountPaisa: Paisa;
  readonly feePaisa: Paisa;
  readonly counterparty: string | null;
  readonly balancePaisa: Paisa | null;
  readonly reference?: string | null;
  readonly timestamp: Date;
  readonly rawSms: string;
  readonly smsHash: string;
  readonly parserVersion: string;
  readonly confidence: number;
  readonly status: SmsParserStatus;
  readonly isSenderVerified: boolean;
  readonly metadata?: Record<string, unknown>;

  // Schema & ergonomics aliases
  readonly rawText?: string;
  readonly deduplicationHash?: string;
  readonly counterpartyMsisdn?: string | null;
  readonly newBalancePaisa?: Paisa | null;
}

export interface BalanceChainVerificationInput {
  readonly walletId: string;
  readonly incomingSms: ParsedSmsResult;
  readonly previousBalancePaisa?: Paisa | null;
  readonly history?: readonly ParsedSmsResult[];
}

export interface BalanceChainVerificationResult {
  readonly status: BalanceChainStatus;
  readonly walletId: string;
  readonly previousBalancePaisa: Paisa | null;
  readonly expectedNewBalancePaisa: Paisa | null;
  readonly reportedBalancePaisa: Paisa | null;
  readonly deltaPaisa: Paisa | null;
  readonly isDiscontinuity: boolean;
  readonly discontinuityType: DiscontinuityType;
  readonly message: string;
  readonly resolvedOutOfOrder?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface ProviderParser {
  readonly provider: MfsProvider;
  readonly verifiedSenders: readonly string[];
  canParse(sender: string, text: string): boolean;
  parse(sender: string, text: string): ParsedSmsResult;
}

export interface ParseSmsOptions {
  readonly fallbackProvider?: MfsProvider;
  readonly allowUnverifiedSender?: boolean;
}
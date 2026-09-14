import type { Paisa } from '@denaneya/payment-core';

export type DiscrepancyType =
  | 'MATCHED'
  | 'AMOUNT_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'MISSING_IN_LEDGER'
  | 'MISSING_IN_GATEWAY'
  | 'UNEXPECTED_GATEWAY_TX'
  | 'FEE_DISCREPANCY';

export type ResolutionStatus =
  | 'UNRESOLVED'
  | 'AUTO_RESOLVED'
  | 'MANUALLY_ADJUSTED'
  | 'INVESTIGATING'
  | 'DISMISSED';

export interface StatementItem {
  provider: string;
  providerTrxId: string;
  merchantTxId?: string;
  amountPaisa: bigint;
  feePaisa: bigint;
  netAmountPaisa: bigint;
  currency: 'BDT';
  providerStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  transactionTime: Date;
  rawRecord?: Record<string, unknown>;
}

// Alias for plan consistency
export type ParsedSettlementRecord = StatementItem;

export interface StatementBatch {
  provider: string;
  batchReference: string;
  statementDate: Date;
  items: StatementItem[];
  totalGrossPaisa: bigint;
  totalFeePaisa: bigint;
  totalNetPaisa: bigint;
  fileHash: string;
}

// Alias for plan consistency
export type ParsedStatementBatch = StatementBatch;

export interface PaymentRecord {
  id: string;
  merchantId: string;
  amountPaisa: bigint;
  feePaisa: bigint;
  provider: string;
  providerTrxId?: string | null;
  status: string;
  settledAt?: Date | null;
  createdAt?: Date;
}

export interface LedgerRecord {
  transactionId: string;
  referenceId: string; // paymentId
  referenceType: string; // 'PAYMENT'
  grossDebitPaisa: bigint;
  isBalanced: boolean;
  postedAt?: Date;
}

export interface ReconciliationTriplet {
  key: string;
  payment?: PaymentRecord;
  providerItem?: StatementItem;
  ledgerTx?: LedgerRecord;
}

export interface DiscrepancyReport {
  id?: string;
  runId?: string;
  batchId?: string;
  discrepancyType: DiscrepancyType;
  paymentId?: string;
  providerTrxId?: string;
  provider: string;
  merchantId?: string;
  internalAmountPaisa?: bigint;
  providerAmountPaisa?: bigint;
  ledgerAmountPaisa?: bigint;
  discrepancyAmountPaisa: bigint;
  internalStatus?: string;
  providerStatus?: string;
  expectedFeePaisa?: bigint;
  actualFeePaisa?: bigint;
  canAutoHeal?: boolean;
  resolutionStatus: ResolutionStatus;
  resolutionNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  createdAt?: Date;
}

export interface ReconciliationSummary {
  totalRecordsEvaluated: number;
  matchedCount: number;
  discrepancyCount: number;
  autoHealedCount: number;
  totalInternalAmountPaisa: bigint;
  totalProviderAmountPaisa: bigint;
  totalLedgerAmountPaisa: bigint;
  netDiscrepancyAmountPaisa: bigint;
  breakdownByType: Record<DiscrepancyType, number>;
}

export interface ReconciliationRunResult {
  runId: string;
  batchId?: string;
  status: 'MATCHED' | 'DISCREPANCIES_DETECTED' | 'FAILED';
  startDate: Date;
  endDate: Date;
  summary: ReconciliationSummary;
  discrepancies: DiscrepancyReport[];
  completedAt: Date;
}

export interface RunOptions {
  batchId?: string;
  startDate?: Date;
  endDate?: Date;
  provider?: string;
  merchantId?: string;
  autoHeal?: boolean;
  feeTolerancePaisa?: bigint;
  expectedMdrBps?: number;
  expectedMdrBpsByProvider?: Record<string, number>;
  content?: string;
  statementBatch?: StatementBatch;
  batchReference?: string;
  triggeredBy?: 'MANUAL' | 'QSTASH_CRON' | 'API';
}

export type ReconciliationConfig = RunOptions;

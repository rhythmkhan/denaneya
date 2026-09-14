/**
 * DenaNeya Fraud Engine Domain Types
 */

export type RiskClassification = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskAction = 'ALLOW' | 'CHALLENGE' | 'UNDER_REVIEW' | 'BLOCK';

export type ReviewCaseState =
  | 'PENDING_REVIEW'
  | 'FIRST_APPROVED'
  | 'APPROVED'
  | 'REJECTED';

export type ReviewDecision = 'APPROVE' | 'REJECT';

export type FraudRuleId =
  | 'RULE_REUSED_TRX_ID'
  | 'RULE_DUPLICATE_SMS'
  | 'RULE_AMOUNT_MISMATCH'
  | 'RULE_SUSPICIOUS_SENDER'
  | 'RULE_VELOCITY_IP'
  | 'RULE_VELOCITY_MERCHANT'
  | 'RULE_DEVICE_REPLAY'
  | 'RULE_BALANCE_CHAIN_DISCONTINUITY'
  | 'RULE_HIGH_VALUE_TRANSACTION'
  | 'RULE_OFF_HOURS_SPIKE'
  | 'RULE_IP_COUNTRY_MISMATCH'
  | 'RULE_DORMANT_SURGE';

export interface PaymentContext {
  id: string;
  merchantId: string;
  amountPaisa: bigint;
  currency: string;
  provider?: string;
  providerTrxId?: string;
  customerPhone?: string;
  customerIp?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SmsContext {
  id?: string;
  provider: string; // 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY'
  sender: string;
  text: string;
  amountPaisa?: bigint;
  trxId?: string;
  hash: string;
  rollingBalancePaisa?: bigint;
  previousBalancePaisa?: bigint;
  feePaisa?: bigint;
  receivedAt: Date;
  counterpartyMsisdn?: string;
}

export interface DeviceContext {
  deviceId: string;
  sequenceNumber: bigint;
  lastSequenceNumber?: bigint;
  nonce: string;
  timestamp: bigint; // device epoch ms
  serverTimestamp: bigint; // server epoch ms
  signatureValid?: boolean;
}

export interface MerchantHistoryContext {
  isDormant?: boolean;
  lastActiveAt?: Date | null;
  recentTxCount1h?: number;
  baselineTxCount1h?: number;
  averageTxAmountPaisa?: bigint;
  highValueThresholdPaisa?: bigint;
  operatingHoursStart?: number; // default 6
  operatingHoursEnd?: number; // default 23
}

export interface IpContext {
  ip: string;
  countryCode?: string; // ISO 3166-1 alpha-2, e.g. 'BD'
  isTor?: boolean;
  isVpnOrProxy?: boolean;
  isDatacenter?: boolean;
  recentAttempts1h?: number;
}

export interface FraudRuleContext {
  payment: PaymentContext;
  sms?: SmsContext;
  device?: DeviceContext;
  merchantHistory?: MerchantHistoryContext;
  ipContext?: IpContext;
  dataProvider?: FraudDataProvider;
}

export interface FraudDataProvider {
  isTrxIdConsumed(provider: string, trxId: string, excludePaymentId?: string): Promise<boolean>;
  isSmsHashSeen(hash: string): Promise<boolean>;
  isNonceSeen(deviceId: string, nonce: string): Promise<boolean>;
  getIpRecentAttemptCount(ip: string, windowMs: number): Promise<number>;
  getMerchantRecentTxCount(merchantId: string, windowMs: number): Promise<number>;
}

export interface RuleEvaluationResult {
  ruleId: FraudRuleId;
  ruleName: string;
  triggered: boolean;
  weight: number;
  instantBlock?: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface FraudEvaluationOutput {
  paymentId: string;
  merchantId: string;
  riskScore: number; // 0 to 100
  classification: RiskClassification;
  actionTaken: RiskAction;
  triggeredRules: Array<{
    ruleId: FraudRuleId;
    ruleName: string;
    weight: number;
    reason: string;
    instantBlock?: boolean;
    metadata?: Record<string, unknown>;
  }>;
  evaluatedAt: Date;
}

export interface ReviewCase {
  id: string;
  paymentId: string;
  merchantId: string;
  status: ReviewCaseState;
  reason: string;
  makerId?: string | null;
  makerRecommendation?: ReviewDecision | null;
  makerNotes?: string | null;
  makerDecidedAt?: Date | null;
  checkerId?: string | null;
  checkerDecision?: ReviewDecision | null;
  checkerNotes?: string | null;
  checkerDecidedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewAuditEntry {
  id: string;
  caseId: string;
  paymentId: string;
  merchantId: string;
  actorId: string;
  action: 'CASE_CREATED' | 'FIRST_APPROVAL' | 'FINAL_APPROVAL' | 'REJECTION' | 'NOTE_ADDED';
  fromStatus: ReviewCaseState;
  toStatus: ReviewCaseState;
  reason: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

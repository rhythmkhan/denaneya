import {
  getMerchantAccountId,
  getSystemAccountId,
  SYSTEM_ACCOUNT_CODES,
} from './accounts.js';
import { InvalidLedgerAmountError } from './errors.js';
import type {
  LedgerPostingEntry,
  PaymentCaptureTemplateParams,
  MerchantPayoutTemplateParams,
  RefundTemplateParams,
  ReserveReleaseTemplateParams,
  PostTransactionRequest,
} from './types.js';

export function buildPaymentCaptureTransaction(
  params: PaymentCaptureTemplateParams
): PostTransactionRequest {
  const reserve = params.reservePaisa ?? 0n;
  const netMerchantPayable = params.grossAmountPaisa - params.platformFeePaisa - reserve;

  if (netMerchantPayable < 0n) {
    throw new InvalidLedgerAmountError('Platform fee and reserve exceed gross payment amount');
  }

  // Determine Clearing Asset Account: 1020 for MFS, 1010 for Card/Online Gateways
  const isMfs = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'].includes(params.provider.toUpperCase());
  const assetAccountId = getSystemAccountId(
    isMfs ? SYSTEM_ACCOUNT_CODES.MFS_SETTLEMENT_RECEIVABLE : SYSTEM_ACCOUNT_CODES.GATEWAY_CLEARING
  );

  const merchantPayableAccountId = getMerchantAccountId(params.merchantId, '2010');
  const platformFeeAccountId = getSystemAccountId(SYSTEM_ACCOUNT_CODES.PLATFORM_FEE_INCOME);
  const reserveAccountId = getMerchantAccountId(params.merchantId, '2020');

  const entries: LedgerPostingEntry[] = [
    {
      accountId: assetAccountId,
      direction: 'DEBIT',
      amountPaisa: params.grossAmountPaisa,
      currency: 'BDT',
    },
    {
      accountId: merchantPayableAccountId,
      direction: 'CREDIT',
      amountPaisa: netMerchantPayable,
      currency: 'BDT',
    },
    {
      accountId: platformFeeAccountId,
      direction: 'CREDIT',
      amountPaisa: params.platformFeePaisa,
      currency: 'BDT',
    },
  ];

  if (reserve > 0n) {
    entries.push({
      accountId: reserveAccountId,
      direction: 'CREDIT',
      amountPaisa: reserve,
      currency: 'BDT',
    });
  }

  return {
    merchantId: params.merchantId,
    transactionType: 'PAYMENT_CAPTURE',
    referenceType: 'PAYMENT',
    referenceId: params.paymentId,
    idempotencyKey: params.idempotencyKey ?? `ltx_cap_${params.paymentId}`,
    description: `Payment capture for ${params.paymentId} via ${params.provider}`,
    entries,
  };
}

export function buildMerchantPayoutTransaction(
  params: MerchantPayoutTemplateParams
): PostTransactionRequest {
  const merchantPayableAccountId = getMerchantAccountId(params.merchantId, '2010');
  const bankClearingAccountId = getSystemAccountId(SYSTEM_ACCOUNT_CODES.BANK_SETTLEMENT_CLEARING);

  return {
    merchantId: params.merchantId,
    transactionType: 'MERCHANT_PAYOUT',
    referenceType: 'PAYOUT',
    referenceId: params.payoutId,
    idempotencyKey: params.idempotencyKey ?? `ltx_payout_${params.payoutId}`,
    description: `Merchant payout ${params.payoutId}${params.notes ? ` - ${params.notes}` : ''}`,
    entries: [
      {
        accountId: merchantPayableAccountId,
        direction: 'DEBIT',
        amountPaisa: params.amountPaisa,
        currency: 'BDT',
      },
      {
        accountId: bankClearingAccountId,
        direction: 'CREDIT',
        amountPaisa: params.amountPaisa,
        currency: 'BDT',
      },
    ],
  };
}

export function buildRefundTransaction(params: RefundTemplateParams): PostTransactionRequest {
  const feeReversal = params.platformFeeRefundPaisa ?? 0n;
  const merchantDebit = params.refundAmountPaisa - feeReversal;

  if (merchantDebit < 0n) {
    throw new InvalidLedgerAmountError('Fee reversal amount cannot exceed refund amount');
  }

  const merchantPayableAccountId = getMerchantAccountId(params.merchantId, '2010');
  const refundClearingAccountId = getSystemAccountId(SYSTEM_ACCOUNT_CODES.REFUND_CLEARING);
  const platformFeeAccountId = getSystemAccountId(SYSTEM_ACCOUNT_CODES.PLATFORM_FEE_INCOME);

  const entries: LedgerPostingEntry[] = [];

  if (merchantDebit > 0n) {
    entries.push({
      accountId: merchantPayableAccountId,
      direction: 'DEBIT',
      amountPaisa: merchantDebit,
      currency: 'BDT',
    });
  }

  if (feeReversal > 0n) {
    entries.push({
      accountId: platformFeeAccountId,
      direction: 'DEBIT',
      amountPaisa: feeReversal,
      currency: 'BDT',
    });
  }

  entries.push({
    accountId: refundClearingAccountId,
    direction: 'CREDIT',
    amountPaisa: params.refundAmountPaisa,
    currency: 'BDT',
  });

  return {
    merchantId: params.merchantId,
    transactionType: 'REFUND',
    referenceType: 'REFUND',
    referenceId: params.refundId,
    idempotencyKey: params.idempotencyKey ?? `ltx_ref_${params.refundId}`,
    description: `Refund ${params.refundId} for payment ${params.paymentId}`,
    entries,
  };
}

export function buildReserveReleaseTransaction(
  params: ReserveReleaseTemplateParams
): PostTransactionRequest {
  const reserveAccountId = getMerchantAccountId(params.merchantId, '2020');
  const merchantPayableAccountId = getMerchantAccountId(params.merchantId, '2010');

  return {
    merchantId: params.merchantId,
    transactionType: 'ADJUSTMENT',
    referenceType: 'RESERVE_RELEASE',
    referenceId: params.releaseId,
    idempotencyKey: params.idempotencyKey ?? `ltx_rel_${params.releaseId}`,
    description: `Rolling reserve release ${params.releaseId}${params.reason ? ` - ${params.reason}` : ''}`,
    entries: [
      {
        accountId: reserveAccountId,
        direction: 'DEBIT',
        amountPaisa: params.amountPaisa,
        currency: 'BDT',
      },
      {
        accountId: merchantPayableAccountId,
        direction: 'CREDIT',
        amountPaisa: params.amountPaisa,
        currency: 'BDT',
      },
    ],
  };
}

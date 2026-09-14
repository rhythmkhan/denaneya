import { eq, sql } from 'drizzle-orm';
import { ledgerAccounts, ledgerEntries } from '@denaneya/database';
import { getMerchantAccountId } from './accounts.js';
import { AccountNotFoundError } from './errors.js';
import type {
  DbExecutor,
  AccountBalanceResult,
  MerchantBalanceSummary,
  LedgerIntegrityReport,
} from './types.js';

export async function getAccountBalance(
  db: DbExecutor,
  accountId: string
): Promise<AccountBalanceResult> {
  const accountRows = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.id, accountId))
    .limit(1);

  if (!accountRows || accountRows.length === 0 || !accountRows[0]) {
    throw new AccountNotFoundError(`Ledger account ${accountId} not found`);
  }

  const account = accountRows[0];

  const sumResult = await db
    .select({
      totalDebits: sql<bigint>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'DEBIT' THEN ${ledgerEntries.amountPaisa} ELSE 0 END), 0)::bigint`,
      totalCredits: sql<bigint>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'CREDIT' THEN ${ledgerEntries.amountPaisa} ELSE 0 END), 0)::bigint`,
      entryCount: sql<number>`COUNT(${ledgerEntries.id})::int`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));

  const totalDebits = sumResult[0]?.totalDebits ? BigInt(sumResult[0].totalDebits) : 0n;
  const totalCredits = sumResult[0]?.totalCredits ? BigInt(sumResult[0].totalCredits) : 0n;
  const entryCount = sumResult[0]?.entryCount ?? 0;

  let balancePaisa = 0n;
  if (account.normalBalance === 'DEBIT') {
    balancePaisa = totalDebits - totalCredits;
  } else {
    balancePaisa = totalCredits - totalDebits;
  }

  return {
    accountId: account.id,
    merchantId: account.merchantId,
    code: account.code,
    name: account.name,
    type: account.type,
    normalBalance: account.normalBalance,
    currency: 'BDT',
    balancePaisa,
    totalDebits,
    totalCredits,
    entryCount,
  };
}

export async function getMerchantBalanceSummary(
  db: DbExecutor,
  merchantId: string
): Promise<MerchantBalanceSummary> {
  const payableAccId = getMerchantAccountId(merchantId, '2010');
  const reserveAccId = getMerchantAccountId(merchantId, '2020');
  const refundAccId = getMerchantAccountId(merchantId, '2030');

  const [payable, reserve, refund] = await Promise.all([
    getAccountBalance(db, payableAccId).catch(() => null),
    getAccountBalance(db, reserveAccId).catch(() => null),
    getAccountBalance(db, refundAccId).catch(() => null),
  ]);

  return {
    merchantId,
    availableBalancePaisa: payable?.balancePaisa ?? 0n,
    rollingReservePaisa: reserve?.balancePaisa ?? 0n,
    pendingRefundPaisa: refund?.balancePaisa ?? 0n,
    totalSettledPaisa: payable?.totalCredits ?? 0n,
    totalWithdrawnPaisa: payable?.totalDebits ?? 0n,
    currency: 'BDT',
    asOf: new Date(),
  };
}

/**
 * Performs a 3-point automated verification across the entire database ledger:
 * 1. Global Zero-Drift Check: sum(All Debits) === sum(All Credits)
 * 2. Unbalanced Transaction Audit: verifies that no individual transaction has net != 0
 * 3. Total Entries Count
 */
export async function verifyLedgerIntegrity(db: DbExecutor): Promise<LedgerIntegrityReport> {
  // 1. Global Zero-Drift Check
  const globalSum = await db
    .select({
      totalDebits: sql<bigint>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'DEBIT' THEN ${ledgerEntries.amountPaisa} ELSE 0 END), 0)::bigint`,
      totalCredits: sql<bigint>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'CREDIT' THEN ${ledgerEntries.amountPaisa} ELSE 0 END), 0)::bigint`,
      netDiff: sql<bigint>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'DEBIT' THEN ${ledgerEntries.amountPaisa} ELSE -${ledgerEntries.amountPaisa} END), 0)::bigint`,
      totalEntries: sql<number>`COUNT(*)::int`,
    })
    .from(ledgerEntries);

  const totalDebits = BigInt(globalSum[0]?.totalDebits ?? 0);
  const totalCredits = BigInt(globalSum[0]?.totalCredits ?? 0);
  const netDifference = BigInt(globalSum[0]?.netDiff ?? 0);
  const totalEntries = globalSum[0]?.totalEntries ?? 0;

  // 2. Unbalanced Transaction Check
  const unbalancedTransactions = await db
    .select({
      transactionId: ledgerEntries.transactionId,
      difference: sql<bigint>`SUM(CASE WHEN ${ledgerEntries.direction} = 'DEBIT' THEN ${ledgerEntries.amountPaisa} ELSE -${ledgerEntries.amountPaisa} END)::bigint`,
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.transactionId)
    .having(
      sql`SUM(CASE WHEN ${ledgerEntries.direction} = 'DEBIT' THEN ${ledgerEntries.amountPaisa} ELSE -${ledgerEntries.amountPaisa} END) <> 0`
    );

  const isBalanced = netDifference === 0n && unbalancedTransactions.length === 0;

  return {
    isBalanced,
    totalDebitsPaisa: totalDebits,
    totalCreditsPaisa: totalCredits,
    netDifferencePaisa: netDifference,
    totalEntries,
    unbalancedTransactionIds: unbalancedTransactions.map((u: any) => u.transactionId),
    verifiedAt: new Date(),
  };
}

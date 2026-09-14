import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { ledgerTransactions, ledgerEntries } from '@denaneya/database';
import {
  UnbalancedLedgerEntryError,
  InvalidLedgerAmountError,
  InvalidLedgerEntryError,
} from './errors.js';
import type {
  DbExecutor,
  LedgerPostingEntry,
  PostTransactionRequest,
  PostTransactionResult,
} from './types.js';

export function generateLedgerId(prefix: 'ltx' | 'len'): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

export function validateLedgerEntries(entries: LedgerPostingEntry[]): {
  totalDebits: bigint;
  totalCredits: bigint;
} {
  if (!entries || entries.length < 2) {
    throw new UnbalancedLedgerEntryError('A double-entry transaction must contain at least 2 entries');
  }

  let totalDebits = 0n;
  let totalCredits = 0n;
  let debitCount = 0;
  let creditCount = 0;

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]!;

    if (!entry.accountId || typeof entry.accountId !== 'string') {
      throw new InvalidLedgerEntryError(`Entry at index ${idx} is missing a valid accountId`);
    }

    if (entry.currency !== 'BDT') {
      throw new InvalidLedgerEntryError(
        `Entry at index ${idx} has invalid currency '${entry.currency}'. Only 'BDT' is permitted`
      );
    }

    if (typeof entry.amountPaisa !== 'bigint') {
      throw new InvalidLedgerAmountError(
        `Entry at index ${idx} amountPaisa must be a bigint, got ${typeof entry.amountPaisa}`
      );
    }

    if (entry.amountPaisa <= 0n) {
      throw new InvalidLedgerAmountError(
        `Entry at index ${idx} amountPaisa must be strictly positive (> 0), got ${entry.amountPaisa}`
      );
    }

    if (entry.direction === 'DEBIT') {
      totalDebits += entry.amountPaisa;
      debitCount++;
    } else if (entry.direction === 'CREDIT') {
      totalCredits += entry.amountPaisa;
      creditCount++;
    } else {
      throw new InvalidLedgerEntryError(
        `Entry at index ${idx} has invalid direction '${entry.direction}'. Must be 'DEBIT' or 'CREDIT'`
      );
    }
  }

  if (debitCount === 0 || creditCount === 0) {
    throw new UnbalancedLedgerEntryError(
      `Transaction must include at least one DEBIT (got ${debitCount}) and at least one CREDIT (got ${creditCount})`
    );
  }

  if (totalDebits !== totalCredits) {
    const diff = totalDebits - totalCredits;
    throw new UnbalancedLedgerEntryError(
      `Ledger transaction is unbalanced by ${diff} paisa: sum(DEBIT) = ${totalDebits} paisa, sum(CREDIT) = ${totalCredits} paisa`,
      { totalDebits: totalDebits.toString(), totalCredits: totalCredits.toString(), difference: diff.toString() }
    );
  }

  return { totalDebits, totalCredits };
}

export async function postTransaction(
  db: DbExecutor,
  req: PostTransactionRequest
): Promise<PostTransactionResult> {
  // 1. Strict mathematical balance verification
  const { totalDebits } = validateLedgerEntries(req.entries);

  // 2. Idempotency Check: if idempotencyKey is supplied, return existing transaction if already posted
  if (req.idempotencyKey) {
    const existing = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, req.idempotencyKey))
      .limit(1);

    if (existing && existing.length > 0 && existing[0]) {
      return {
        transactionId: existing[0].id,
        postedAt: existing[0].postedAt,
        alreadyExisted: true,
        totalAmountPaisa: totalDebits,
      };
    }
  }

  // 3. Create Journal Master Record
  const transactionId = generateLedgerId('ltx');
  const now = new Date();

  await db.insert(ledgerTransactions).values({
    id: transactionId,
    merchantId: req.merchantId ?? null,
    transactionType: req.transactionType,
    referenceType: req.referenceType,
    referenceId: req.referenceId,
    idempotencyKey: req.idempotencyKey ?? null,
    description: req.description,
    postedAt: now,
    createdAt: now,
  });

  // 4. Create Journal Postings (batch insert)
  const entriesToInsert = req.entries.map((entry) => ({
    id: generateLedgerId('len'),
    transactionId,
    accountId: entry.accountId,
    direction: entry.direction,
    amountPaisa: entry.amountPaisa,
    currency: 'BDT' as const,
    createdAt: now,
  }));

  await db.insert(ledgerEntries).values(entriesToInsert);

  return {
    transactionId,
    postedAt: now,
    alreadyExisted: false,
    totalAmountPaisa: totalDebits,
  };
}

export interface LedgerEntryLike {
  entryType: "DEBIT" | "CREDIT";
  amountPaisa: bigint | number;
  accountId?: string;
}

export interface BalanceAssertionResult {
  balanced: boolean;
  totalDebitsPaisa: bigint;
  totalCreditsPaisa: bigint;
  discrepancyPaisa: bigint;
}

export function verifyLedgerBalance(entries: LedgerEntryLike[]): BalanceAssertionResult {
  let totalDebits = 0n;
  let totalCredits = 0n;

  for (const entry of entries) {
    const amount = typeof entry.amountPaisa === "bigint" ? entry.amountPaisa : BigInt(entry.amountPaisa);
    if (entry.entryType === "DEBIT") {
      totalDebits += amount;
    } else if (entry.entryType === "CREDIT") {
      totalCredits += amount;
    }
  }

  const discrepancy = totalDebits - totalCredits;
  return {
    balanced: discrepancy === 0n,
    totalDebitsPaisa: totalDebits,
    totalCreditsPaisa: totalCredits,
    discrepancyPaisa: discrepancy,
  };
}

export function assertLedgerBalanced(entries: LedgerEntryLike[]): void {
  const result = verifyLedgerBalance(entries);
  if (!result.balanced) {
    throw new Error(
      `Ledger imbalance detected! Total Debits: ${result.totalDebitsPaisa}n, Total Credits: ${result.totalCreditsPaisa}n, Discrepancy: ${result.discrepancyPaisa}n paisa`
    );
  }
}

export function calculateAccountBalance(
  entries: LedgerEntryLike[],
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" = "LIABILITY"
): bigint {
  let netBalance = 0n;
  for (const entry of entries) {
    const amount = typeof entry.amountPaisa === "bigint" ? entry.amountPaisa : BigInt(entry.amountPaisa);
    if (accountType === "ASSET" || accountType === "EXPENSE") {
      netBalance += entry.entryType === "DEBIT" ? amount : -amount;
    } else {
      netBalance += entry.entryType === "CREDIT" ? amount : -amount;
    }
  }
  return netBalance;
}

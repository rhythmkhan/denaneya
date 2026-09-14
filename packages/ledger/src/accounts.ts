import { ledgerAccounts } from '@denaneya/database';
import type {
  AccountCategory,
  DbExecutor,
  NormalBalance,
  SystemAccountCode,
  SystemAccountDefinition,
} from './types.js';

export const SYSTEM_ACCOUNT_CODES = {
  GATEWAY_CLEARING: '1010',
  MFS_SETTLEMENT_RECEIVABLE: '1020',
  BANK_SETTLEMENT_CLEARING: '1030',
  MERCHANT_PAYABLE: '2010',
  ROLLING_RESERVE: '2020',
  REFUND_CLEARING: '2030',
  PLATFORM_FEE_INCOME: '4010',
  GATEWAY_FEE_EXPENSE: '5010',
  RETAINED_EARNINGS: '3010',
} as const;

export const SYSTEM_ACCOUNTS: Record<SystemAccountCode, SystemAccountDefinition> = {
  [SYSTEM_ACCOUNT_CODES.GATEWAY_CLEARING]: {
    code: '1010',
    name: 'Gateway Clearing',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    description:
      'In-transit clearing receivable for commercial card/netbanking gateways (SSLCOMMERZ, shurjoPay, aamarPay)',
  },
  [SYSTEM_ACCOUNT_CODES.MFS_SETTLEMENT_RECEIVABLE]: {
    code: '1020',
    name: 'MFS Settlement Receivable',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    description:
      'Receivables owed by MFS operators or held in SIM collector merchant wallets (bKash, Nagad, Rocket, Upay)',
  },
  [SYSTEM_ACCOUNT_CODES.BANK_SETTLEMENT_CLEARING]: {
    code: '1030',
    name: 'Bank Settlement Clearing',
    type: 'ASSET',
    normalBalance: 'DEBIT',
    description:
      'Platform commercial bank clearing treasury for merchant payouts via BEFTN/NPSB/RTGS',
  },
  [SYSTEM_ACCOUNT_CODES.MERCHANT_PAYABLE]: {
    code: '2010',
    name: 'Merchant Payable Balance',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Net available liquid funds owed to merchants for completed transactions',
  },
  [SYSTEM_ACCOUNT_CODES.ROLLING_RESERVE]: {
    code: '2020',
    name: 'Rolling Reserve',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Risk reserve funds held in escrow against disputes, chargebacks, and fraud',
  },
  [SYSTEM_ACCOUNT_CODES.REFUND_CLEARING]: {
    code: '2030',
    name: 'Refund Clearing',
    type: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Holding account for customer refund disbursements pending gateway clearing',
  },
  [SYSTEM_ACCOUNT_CODES.PLATFORM_FEE_INCOME]: {
    code: '4010',
    name: 'Platform Processing Fee Income',
    type: 'REVENUE',
    normalBalance: 'CREDIT',
    description: 'DenaNeya operating revenue earned from MDR basis points and fixed transaction fees',
  },
  [SYSTEM_ACCOUNT_CODES.GATEWAY_FEE_EXPENSE]: {
    code: '5010',
    name: 'Gateway Network Fee Expense',
    type: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Network interchange and gateway processing fees charged by upstream providers',
  },
  [SYSTEM_ACCOUNT_CODES.RETAINED_EARNINGS]: {
    code: '3010',
    name: 'Platform Retained Earnings',
    type: 'EQUITY',
    normalBalance: 'CREDIT',
    description: 'Accumulated earnings from platform operations',
  },
};

export function getSystemAccountId(code: SystemAccountCode): string {
  return `acc_sys_${code}`;
}

export function getMerchantAccountId(merchantId: string, code: '2010' | '2020' | '2030'): string {
  return `acc_mch_${merchantId}_${code}`;
}

/**
 * Ensures all system Chart of Accounts rows exist in the database.
 * Uses ON CONFLICT DO NOTHING to ensure idempotency.
 */
export async function ensureSystemAccounts(db: DbExecutor): Promise<void> {
  const accountRows = Object.values(SYSTEM_ACCOUNTS).map((def) => ({
    id: getSystemAccountId(def.code as SystemAccountCode),
    merchantId: null,
    code: def.code,
    name: def.name,
    type: def.type,
    normalBalance: def.normalBalance,
    currency: 'BDT',
    description: def.description,
    isActive: true,
  }));

  for (const row of accountRows) {
    await db.insert(ledgerAccounts).values(row).onConflictDoNothing();
  }
}

/**
 * Ensures merchant-specific sub-ledger accounts (2010, 2020, 2030) exist.
 */
export async function ensureMerchantAccounts(
  db: DbExecutor,
  merchantId: string
): Promise<{
  payableAccountId: string;
  reserveAccountId: string;
  refundAccountId: string;
}> {
  const accountsToCreate = [
    {
      code: '2010' as const,
      name: `Merchant Payable (${merchantId})`,
      type: 'LIABILITY' as AccountCategory,
      normalBalance: 'CREDIT' as NormalBalance,
      description: 'Available balance for merchant payouts',
    },
    {
      code: '2020' as const,
      name: `Rolling Reserve (${merchantId})`,
      type: 'LIABILITY' as AccountCategory,
      normalBalance: 'CREDIT' as NormalBalance,
      description: 'Dispute escrow reserve hold for merchant',
    },
    {
      code: '2030' as const,
      name: `Refund Clearing (${merchantId})`,
      type: 'LIABILITY' as AccountCategory,
      normalBalance: 'CREDIT' as NormalBalance,
      description: 'Pending customer refund clearing for merchant',
    },
  ];

  for (const acc of accountsToCreate) {
    const id = getMerchantAccountId(merchantId, acc.code);
    await db
      .insert(ledgerAccounts)
      .values({
        id,
        merchantId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        currency: 'BDT',
        description: acc.description,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  return {
    payableAccountId: getMerchantAccountId(merchantId, '2010'),
    reserveAccountId: getMerchantAccountId(merchantId, '2020'),
    refundAccountId: getMerchantAccountId(merchantId, '2030'),
  };
}

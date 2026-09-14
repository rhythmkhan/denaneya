import { describe, it, expect, vi } from 'vitest';
import {
  SYSTEM_ACCOUNT_CODES,
  SYSTEM_ACCOUNTS,
  getSystemAccountId,
  getMerchantAccountId,
  ensureSystemAccounts,
  ensureMerchantAccounts,
} from '../src/accounts.js';

describe('Ledger Chart of Accounts (COA)', () => {
  it('verifies all 9 system accounts are registered with valid categories and normal balances', () => {
    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.GATEWAY_CLEARING]).toMatchObject({
      code: '1010',
      type: 'ASSET',
      normalBalance: 'DEBIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.MFS_SETTLEMENT_RECEIVABLE]).toMatchObject({
      code: '1020',
      type: 'ASSET',
      normalBalance: 'DEBIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.BANK_SETTLEMENT_CLEARING]).toMatchObject({
      code: '1030',
      type: 'ASSET',
      normalBalance: 'DEBIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.MERCHANT_PAYABLE]).toMatchObject({
      code: '2010',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.ROLLING_RESERVE]).toMatchObject({
      code: '2020',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.REFUND_CLEARING]).toMatchObject({
      code: '2030',
      type: 'LIABILITY',
      normalBalance: 'CREDIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.PLATFORM_FEE_INCOME]).toMatchObject({
      code: '4010',
      type: 'REVENUE',
      normalBalance: 'CREDIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.GATEWAY_FEE_EXPENSE]).toMatchObject({
      code: '5010',
      type: 'EXPENSE',
      normalBalance: 'DEBIT',
    });

    expect(SYSTEM_ACCOUNTS[SYSTEM_ACCOUNT_CODES.RETAINED_EARNINGS]).toMatchObject({
      code: '3010',
      type: 'EQUITY',
      normalBalance: 'CREDIT',
    });
  });

  it('generates predictable account IDs for system and merchant sub-ledgers', () => {
    expect(getSystemAccountId('1010')).toBe('acc_sys_1010');
    expect(getSystemAccountId('4010')).toBe('acc_sys_4010');

    expect(getMerchantAccountId('mer_abc123', '2010')).toBe('acc_mch_mer_abc123_2010');
    expect(getMerchantAccountId('mer_abc123', '2020')).toBe('acc_mch_mer_abc123_2020');
    expect(getMerchantAccountId('mer_abc123', '2030')).toBe('acc_mch_mer_abc123_2030');
  });

  it('provisions system accounts idempotently via database client', async () => {
    const insertedRows: any[] = [];
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedRows.push(val);
          return {
            onConflictDoNothing: vi.fn().mockResolvedValue({}),
          };
        }),
      }),
    };

    await ensureSystemAccounts(mockDb);

    expect(mockDb.insert).toHaveBeenCalledTimes(9);
    expect(insertedRows).toHaveLength(9);
    expect(insertedRows.some((r) => r.id === 'acc_sys_1010')).toBe(true);
  });

  it('provisions merchant sub-accounts idempotently', async () => {
    const insertedRows: any[] = [];
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedRows.push(val);
          return {
            onConflictDoNothing: vi.fn().mockResolvedValue({}),
          };
        }),
      }),
    };

    const result = await ensureMerchantAccounts(mockDb, 'mer_xyz');

    expect(mockDb.insert).toHaveBeenCalledTimes(3);
    expect(result.payableAccountId).toBe('acc_mch_mer_xyz_2010');
    expect(result.reserveAccountId).toBe('acc_mch_mer_xyz_2020');
    expect(result.refundAccountId).toBe('acc_mch_mer_xyz_2030');
  });
});

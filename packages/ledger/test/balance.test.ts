import { describe, it, expect, vi } from 'vitest';
import {
  getAccountBalance,
  getMerchantBalanceSummary,
  verifyLedgerIntegrity,
} from '../src/balance.js';
import { AccountNotFoundError } from '../src/errors.js';

describe('Real-Time Balance Derivation & Ledger Integrity', () => {
  describe('getAccountBalance', () => {
    it('computes balance for DEBIT normal balance account (Asset: Debits - Credits)', async () => {
      const mockAccount = {
        id: 'acc_sys_1010',
        code: '1010',
        name: 'Gateway Clearing',
        type: 'ASSET',
        normalBalance: 'DEBIT',
      };

      const mockDb = {
        select: vi.fn().mockImplementation((fields) => {
          return {
            from: vi.fn().mockImplementation((table) => {
              return {
                where: vi.fn().mockImplementation(() => {
                  if (fields?.totalDebits) {
                    return Promise.resolve([
                      {
                        totalDebits: 500000n,
                        totalCredits: 100000n,
                        entryCount: 4,
                      },
                    ]);
                  }
                  return {
                    limit: vi.fn().mockResolvedValue([mockAccount]),
                  };
                }),
              };
            }),
          };
        }),
      };

      const result = await getAccountBalance(mockDb, 'acc_sys_1010');

      expect(result.accountId).toBe('acc_sys_1010');
      expect(result.normalBalance).toBe('DEBIT');
      // 500000 - 100000 = 400000
      expect(result.balancePaisa).toBe(400000n);
      expect(result.totalDebits).toBe(500000n);
      expect(result.totalCredits).toBe(100000n);
      expect(result.entryCount).toBe(4);
    });

    it('computes balance for CREDIT normal balance account (Liability: Credits - Debits)', async () => {
      const mockAccount = {
        id: 'acc_mch_01_2010',
        code: '2010',
        name: 'Merchant Payable',
        type: 'LIABILITY',
        normalBalance: 'CREDIT',
      };

      const mockDb = {
        select: vi.fn().mockImplementation((fields) => {
          return {
            from: vi.fn().mockImplementation((table) => {
              return {
                where: vi.fn().mockImplementation(() => {
                  if (fields?.totalDebits) {
                    return Promise.resolve([
                      {
                        totalDebits: 200000n,
                        totalCredits: 750000n,
                        entryCount: 6,
                      },
                    ]);
                  }
                  return {
                    limit: vi.fn().mockResolvedValue([mockAccount]),
                  };
                }),
              };
            }),
          };
        }),
      };

      const result = await getAccountBalance(mockDb, 'acc_mch_01_2010');

      expect(result.normalBalance).toBe('CREDIT');
      // Credits - Debits = 750000 - 200000 = 550000
      expect(result.balancePaisa).toBe(550000n);
    });

    it('throws AccountNotFoundError when account does not exist', async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      await expect(getAccountBalance(mockDb, 'acc_missing')).rejects.toThrow(AccountNotFoundError);
    });
  });

  describe('getMerchantBalanceSummary', () => {
    it('aggregates available balance, reserve, and refund balances', async () => {
      const mockDb = {
        select: vi.fn().mockImplementation((fields) => {
          return {
            from: vi.fn().mockImplementation((table) => {
              return {
                where: vi.fn().mockImplementation((condition) => {
                  if (fields?.totalDebits) {
                    return Promise.resolve([
                      {
                        totalDebits: 50000n,
                        totalCredits: 200000n,
                        entryCount: 2,
                      },
                    ]);
                  }
                  return {
                    limit: vi.fn().mockResolvedValue([
                      {
                        id: 'acc_test',
                        type: 'LIABILITY',
                        normalBalance: 'CREDIT',
                      },
                    ]),
                  };
                }),
              };
            }),
          };
        }),
      };

      const summary = await getMerchantBalanceSummary(mockDb, 'mer_summary_01');

      expect(summary.merchantId).toBe('mer_summary_01');
      expect(summary.currency).toBe('BDT');
      expect(summary.availableBalancePaisa).toBe(150000n);
    });
  });

  describe('verifyLedgerIntegrity', () => {
    it('returns isBalanced: true when total debits equals total credits and no unbalanced transactions exist', async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation((fields) => {
          return {
            from: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // Global sum
                return Promise.resolve([
                  {
                    totalDebits: 1000000n,
                    totalCredits: 1000000n,
                    netDiff: 0n,
                    totalEntries: 20,
                  },
                ]);
              }
              // Unbalanced transactions query
              return {
                groupBy: vi.fn().mockReturnValue({
                  having: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          };
        }),
      };

      const report = await verifyLedgerIntegrity(mockDb);

      expect(report.isBalanced).toBe(true);
      expect(report.netDifferencePaisa).toBe(0n);
      expect(report.unbalancedTransactionIds).toHaveLength(0);
    });

    it('returns isBalanced: false and lists unbalanced transaction IDs on discrepancy', async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation((fields) => {
          return {
            from: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // Global sum has 50 paisa discrepancy
                return Promise.resolve([
                  {
                    totalDebits: 1000050n,
                    totalCredits: 1000000n,
                    netDiff: 50n,
                    totalEntries: 20,
                  },
                ]);
              }
              // Unbalanced transactions query
              return {
                groupBy: vi.fn().mockReturnValue({
                  having: vi.fn().mockResolvedValue([
                    {
                      transactionId: 'ltx_corrupt_01',
                      difference: 50n,
                    },
                  ]),
                }),
              };
            }),
          };
        }),
      };

      const report = await verifyLedgerIntegrity(mockDb);

      expect(report.isBalanced).toBe(false);
      expect(report.netDifferencePaisa).toBe(50n);
      expect(report.unbalancedTransactionIds).toEqual(['ltx_corrupt_01']);
    });
  });
});

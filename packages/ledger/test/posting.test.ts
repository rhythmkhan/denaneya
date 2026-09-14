import { describe, it, expect, vi } from 'vitest';
import { validateLedgerEntries, postTransaction, generateLedgerId } from '../src/posting.js';
import {
  UnbalancedLedgerEntryError,
  InvalidLedgerAmountError,
  InvalidLedgerEntryError,
} from '../src/errors.js';
import type { LedgerPostingEntry, PostTransactionRequest } from '../src/types.js';

describe('Double-Entry Posting Engine & Mathematical Invariant', () => {
  it('generates unique transaction and entry IDs with expected prefixes', () => {
    const txId = generateLedgerId('ltx');
    const entryId = generateLedgerId('len');

    expect(txId.startsWith('ltx_')).toBe(true);
    expect(entryId.startsWith('len_')).toBe(true);
  });

  describe('validateLedgerEntries', () => {
    it('passes validation for a balanced 2-entry transaction', () => {
      const entries: LedgerPostingEntry[] = [
        {
          accountId: 'acc_sys_1010',
          direction: 'DEBIT',
          amountPaisa: 100000n, // 1,000.00 BDT
          currency: 'BDT',
        },
        {
          accountId: 'acc_mch_01_2010',
          direction: 'CREDIT',
          amountPaisa: 100000n,
          currency: 'BDT',
        },
      ];

      const { totalDebits, totalCredits } = validateLedgerEntries(entries);
      expect(totalDebits).toBe(100000n);
      expect(totalCredits).toBe(100000n);
    });

    it('rejects an entry unbalanced by exactly +1 paisa', () => {
      const entries: LedgerPostingEntry[] = [
        {
          accountId: 'acc_sys_1010',
          direction: 'DEBIT',
          amountPaisa: 100001n, // 1 paisa too high!
          currency: 'BDT',
        },
        {
          accountId: 'acc_mch_01_2010',
          direction: 'CREDIT',
          amountPaisa: 100000n,
          currency: 'BDT',
        },
      ];

      expect(() => validateLedgerEntries(entries)).toThrow(UnbalancedLedgerEntryError);
    });

    it('rejects an entry unbalanced by exactly -1 paisa', () => {
      const entries: LedgerPostingEntry[] = [
        {
          accountId: 'acc_sys_1010',
          direction: 'DEBIT',
          amountPaisa: 99999n, // 1 paisa too low!
          currency: 'BDT',
        },
        {
          accountId: 'acc_mch_01_2010',
          direction: 'CREDIT',
          amountPaisa: 100000n,
          currency: 'BDT',
        },
      ];

      expect(() => validateLedgerEntries(entries)).toThrow(UnbalancedLedgerEntryError);
    });

    it('validates multi-leg transactions (1 debit, 3 credits)', () => {
      const entries: LedgerPostingEntry[] = [
        {
          accountId: 'acc_sys_1010',
          direction: 'DEBIT',
          amountPaisa: 1000000n, // 10,000 BDT
          currency: 'BDT',
        },
        {
          accountId: 'acc_mch_01_2010',
          direction: 'CREDIT',
          amountPaisa: 935000n, // Merchant net
          currency: 'BDT',
        },
        {
          accountId: 'acc_sys_4010',
          direction: 'CREDIT',
          amountPaisa: 15000n, // Platform fee
          currency: 'BDT',
        },
        {
          accountId: 'acc_mch_01_2020',
          direction: 'CREDIT',
          amountPaisa: 50000n, // Reserve
          currency: 'BDT',
        },
      ];

      const { totalDebits, totalCredits } = validateLedgerEntries(entries);
      expect(totalDebits).toBe(1000000n);
      expect(totalCredits).toBe(1000000n);
    });

    it('rejects fewer than 2 entries', () => {
      expect(() => validateLedgerEntries([])).toThrow(UnbalancedLedgerEntryError);
      expect(() =>
        validateLedgerEntries([
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: 100n,
            currency: 'BDT',
          },
        ])
      ).toThrow(UnbalancedLedgerEntryError);
    });

    it('rejects entries with all debits and no credits', () => {
      const entries: LedgerPostingEntry[] = [
        {
          accountId: 'acc_sys_1010',
          direction: 'DEBIT',
          amountPaisa: 100n,
          currency: 'BDT',
        },
        {
          accountId: 'acc_sys_1020',
          direction: 'DEBIT',
          amountPaisa: 100n,
          currency: 'BDT',
        },
      ];
      expect(() => validateLedgerEntries(entries)).toThrow(UnbalancedLedgerEntryError);
    });

    it('rejects zero or negative amounts with InvalidLedgerAmountError', () => {
      expect(() =>
        validateLedgerEntries([
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: 0n,
            currency: 'BDT',
          },
          {
            accountId: 'acc_sys_2010',
            direction: 'CREDIT',
            amountPaisa: 0n,
            currency: 'BDT',
          },
        ])
      ).toThrow(InvalidLedgerAmountError);

      expect(() =>
        validateLedgerEntries([
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: -500n,
            currency: 'BDT',
          },
          {
            accountId: 'acc_sys_2010',
            direction: 'CREDIT',
            amountPaisa: -500n,
            currency: 'BDT',
          },
        ])
      ).toThrow(InvalidLedgerAmountError);
    });

    it('rejects invalid currency or missing accountId', () => {
      expect(() =>
        validateLedgerEntries([
          {
            accountId: '',
            direction: 'DEBIT',
            amountPaisa: 100n,
            currency: 'BDT',
          },
          {
            accountId: 'acc_sys_2010',
            direction: 'CREDIT',
            amountPaisa: 100n,
            currency: 'BDT',
          },
        ])
      ).toThrow(InvalidLedgerEntryError);

      expect(() =>
        validateLedgerEntries([
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: 100n,
            currency: 'USD' as any,
          },
          {
            accountId: 'acc_sys_2010',
            direction: 'CREDIT',
            amountPaisa: 100n,
            currency: 'USD' as any,
          },
        ])
      ).toThrow(InvalidLedgerEntryError);
    });
  });

  describe('postTransaction', () => {
    it('inserts master transaction and entries into database', async () => {
      const inserts: Record<string, any[]> = {
        transactions: [],
        entries: [],
      };

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockImplementation((table) => {
          return {
            values: vi.fn().mockImplementation((val) => {
              if (Array.isArray(val)) {
                inserts.entries.push(...val);
              } else {
                inserts.transactions.push(val);
              }
              return Promise.resolve();
            }),
          };
        }),
      };

      const req: PostTransactionRequest = {
        merchantId: 'mer_01',
        transactionType: 'PAYMENT_CAPTURE',
        referenceType: 'PAYMENT',
        referenceId: 'pay_01',
        description: 'Capture test',
        entries: [
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: 50000n,
            currency: 'BDT',
          },
          {
            accountId: 'acc_mch_01_2010',
            direction: 'CREDIT',
            amountPaisa: 50000n,
            currency: 'BDT',
          },
        ],
      };

      const result = await postTransaction(mockDb, req);

      expect(result.alreadyExisted).toBe(false);
      expect(result.totalAmountPaisa).toBe(50000n);
      expect(inserts.transactions).toHaveLength(1);
      expect(inserts.entries).toHaveLength(2);
    });

    it('returns existing transaction on idempotencyKey match without inserting duplicates', async () => {
      const existingDate = new Date('2026-09-13T10:00:00Z');
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'ltx_existing_123',
                  postedAt: existingDate,
                },
              ]),
            }),
          }),
        }),
        insert: vi.fn(),
      };

      const req: PostTransactionRequest = {
        merchantId: 'mer_01',
        transactionType: 'PAYMENT_CAPTURE',
        referenceType: 'PAYMENT',
        referenceId: 'pay_01',
        idempotencyKey: 'idem_key_already_used',
        description: 'Capture test replay',
        entries: [
          {
            accountId: 'acc_sys_1010',
            direction: 'DEBIT',
            amountPaisa: 50000n,
            currency: 'BDT',
          },
          {
            accountId: 'acc_mch_01_2010',
            direction: 'CREDIT',
            amountPaisa: 50000n,
            currency: 'BDT',
          },
        ],
      };

      const result = await postTransaction(mockDb, req);

      expect(result.alreadyExisted).toBe(true);
      expect(result.transactionId).toBe('ltx_existing_123');
      expect(result.postedAt).toBe(existingDate);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});

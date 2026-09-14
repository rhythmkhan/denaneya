import { describe, it, expect, vi } from 'vitest';
import { settlePaymentAtomic } from '../src/settlement.js';
import {
  PaymentNotFoundError,
  InvalidPaymentStateTransitionError,
  PaymentAlreadySettledConflictError,
  ProviderTransactionAlreadyConsumedError,
} from '../src/errors.js';

describe('Atomic Settlement Pipeline', () => {
  it('successfully settles payment atomically', async () => {
    const payment = {
      id: 'pay_settle_01',
      merchantId: 'mer_01',
      status: 'PENDING',
      amountPaisa: 100000n,
      feePaisa: 1500n,
      provider: 'BKASH',
      providerTrxId: null,
      version: 1,
    };

    const updates: Record<string, any> = {};
    const inserts: Record<string, any[]> = {
      transactions: [],
      entries: [],
      outbox: [],
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table) => {
          return {
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([payment]),
              limit: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      }),
      update: vi.fn().mockImplementation((table) => {
        return {
          set: vi.fn().mockImplementation((setValues) => {
            return {
              where: vi.fn().mockImplementation(() => {
                updates.payment = setValues;
                return Promise.resolve({ rowCount: 1 });
              }),
            };
          }),
        };
      }),
      insert: vi.fn().mockImplementation((table) => {
        return {
          values: vi.fn().mockImplementation((val) => {
            if (Array.isArray(val)) {
              inserts.entries.push(...val);
            } else if (val.eventType) {
              inserts.outbox.push(val);
            } else if (val.transactionType) {
              inserts.transactions.push(val);
            }
            return {
              onConflictDoNothing: vi.fn().mockResolvedValue({}),
            };
          }),
        };
      }),
    };

    const result = await settlePaymentAtomic(mockDb, {
      paymentId: 'pay_settle_01',
      provider: 'BKASH',
      providerTrxId: '9K76TRX01',
      smsMessageId: 'sms_01',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.alreadySettled).toBe(false);
    expect(result.ledgerTransactionId).toBeDefined();
    expect(result.outboxEventId).toBeDefined();

    expect(updates.payment.status).toBe('COMPLETED');
    expect(updates.payment.version).toBe(2);
    expect(updates.payment.providerTrxId).toBe('9K76TRX01');

    expect(inserts.outbox).toHaveLength(1);
    expect(inserts.outbox[0].eventType).toBe('payment.completed');
    expect(inserts.outbox[0].payload.paymentId).toBe('pay_settle_01');
  });

  it('throws PaymentNotFoundError if payment does not exist', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    await expect(
      settlePaymentAtomic(mockDb, { paymentId: 'non_existent' })
    ).rejects.toThrow(PaymentNotFoundError);
  });

  it('handles idempotent replay for already COMPLETED payment with matching TrxID', async () => {
    const payment = {
      id: 'pay_already_completed',
      merchantId: 'mer_01',
      status: 'COMPLETED',
      providerTrxId: '9K76TRX01',
      settledAt: new Date('2026-09-13T10:00:00Z'),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([payment]),
          }),
        }),
      }),
    };

    const result = await settlePaymentAtomic(mockDb, {
      paymentId: 'pay_already_completed',
      providerTrxId: '9K76TRX01',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.alreadySettled).toBe(true);
  });

  it('throws PaymentAlreadySettledConflictError when TrxID conflicts on completed payment', async () => {
    const payment = {
      id: 'pay_already_completed',
      merchantId: 'mer_01',
      status: 'COMPLETED',
      providerTrxId: '9K76TRX01',
      settledAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([payment]),
          }),
        }),
      }),
    };

    await expect(
      settlePaymentAtomic(mockDb, {
        paymentId: 'pay_already_completed',
        providerTrxId: 'DIFFERENT_TRX_999',
      })
    ).rejects.toThrow(PaymentAlreadySettledConflictError);
  });

  it('rejects invalid pre-settlement payment states (e.g. FAILED)', async () => {
    const payment = {
      id: 'pay_failed',
      merchantId: 'mer_01',
      status: 'FAILED',
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([payment]),
          }),
        }),
      }),
    };

    await expect(
      settlePaymentAtomic(mockDb, { paymentId: 'pay_failed' })
    ).rejects.toThrow(InvalidPaymentStateTransitionError);
  });

  it('rejects duplicate SMS consumption with ProviderTransactionAlreadyConsumedError', async () => {
    const payment = {
      id: 'pay_dup_sms',
      merchantId: 'mer_01',
      status: 'PENDING',
      amountPaisa: 100000n,
      feePaisa: 1500n,
      version: 1,
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([payment]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 0 }), // 0 rows updated because SMS was already consumed!
        }),
      }),
    };

    await expect(
      settlePaymentAtomic(mockDb, {
        paymentId: 'pay_dup_sms',
        smsMessageId: 'sms_already_used',
      })
    ).rejects.toThrow(ProviderTransactionAlreadyConsumedError);
  });
});

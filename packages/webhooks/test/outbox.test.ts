import { describe, it, expect, vi } from 'vitest';
import { enqueueOutboxEvent } from '../src/outbox.js';

describe('Transactional Outbox Producer', () => {
  it('enqueues outbox event into database with PENDING status', async () => {
    let insertedVal: any = null;
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedVal = val;
          return Promise.resolve();
        }),
      }),
    };

    const record = await enqueueOutboxEvent(mockTx, {
      merchantId: 'mer_merchant_01',
      eventType: 'payment.completed',
      payload: {
        paymentId: 'pay_001',
        amountPaisa: '150000',
        currency: 'BDT',
      },
    });

    expect(record.status).toBe('PENDING');
    expect(record.merchantId).toBe('mer_merchant_01');
    expect(record.eventType).toBe('payment.completed');
    expect(record.id).toMatch(/^obx_/);
    expect(insertedVal).toEqual(expect.objectContaining({
      id: record.id,
      merchantId: 'mer_merchant_01',
      eventType: 'payment.completed',
      status: 'PENDING',
    }));
  });
});
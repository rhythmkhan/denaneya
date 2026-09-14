import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchWebhook } from '../src/dispatcher.js';
import { SsrfBlockedError } from '../src/errors.js';
import type { WebhookSubscriptionRecord } from '../src/types.js';

describe('Webhook Dispatcher & SSRF Guard', () => {
  let mockDb: any;
  let insertedDeliveries: any[];
  let updatedSubs: any[];

  beforeEach(() => {
    insertedDeliveries = [];
    updatedSubs = [];
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedDeliveries.push(val);
          return Promise.resolve();
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((val) => {
            updatedSubs.push(val);
            return Promise.resolve();
          }),
        }),
      }),
    };
  });

  it('blocks SSRF destination URLs (loopback/cloud metadata) and marks DEAD_LETTER', async () => {
    const maliciousSub: WebhookSubscriptionRecord = {
      id: 'whs_ssrf_test',
      merchantId: 'mer_test',
      url: 'http://169.254.169.254/latest/meta-data',
      secret: 'whsec_test',
      events: ['*'],
      status: 'ACTIVE',
      description: 'Hostile endpoint',
      failureCount: 0,
      lastDeliveryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      dispatchWebhook(mockDb, {
        subscription: maliciousSub,
        eventId: 'evt_test_1',
        eventType: 'payment.completed',
        payload: { amountPaisa: '50000' },
        attempt: 1,
      })
    ).rejects.toThrow(SsrfBlockedError);

    // Verified recorded as DEAD_LETTER in delivery audit table
    expect(insertedDeliveries.length).toBe(1);
    expect(insertedDeliveries[0].status).toBe('DEAD_LETTER');
    expect(insertedDeliveries[0].errorMessage).toContain('SSRF Blocked');
  });

  it('blocks 127.0.0.1 loopback access', async () => {
    const loopbackSub: WebhookSubscriptionRecord = {
      id: 'whs_loopback_test',
      merchantId: 'mer_test',
      url: 'http://127.0.0.1:8080/webhook',
      secret: 'whsec_test',
      events: ['*'],
      status: 'ACTIVE',
      description: 'Localhost endpoint',
      failureCount: 0,
      lastDeliveryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      dispatchWebhook(mockDb, {
        subscription: loopbackSub,
        eventId: 'evt_test_2',
        eventType: 'payment.completed',
        payload: {},
        attempt: 1,
      })
    ).rejects.toThrow(SsrfBlockedError);
  });
});
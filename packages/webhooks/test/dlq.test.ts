import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_DELIVERY_ATTEMPTS,
  calculateNextRetryDelay,
  RETRY_INTERVALS_MS,
  processWebhookRetries,
  replayDeadLetterDelivery,
  getDeadLetterDeliveries,
  requeueDeadLetterDelivery,
} from '../src/retry.js';
import { WebhookService } from '../src/client.js';
import * as dispatcherModule from '../src/dispatcher.js';

import { webhookDeliveries, webhookSubscriptions } from '@denaneya/database';

describe('Dead Letter Queue (DLQ) & Webhook Retry Processing', () => {
  let mockDb: any;
  let deliveriesStore: any[];
  let subscriptionsStore: any[];

  beforeEach(() => {
    deliveriesStore = [];
    subscriptionsStore = [];

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table) => ({
          where: vi.fn().mockImplementation((condition) => ({
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation((limit) => ({
                offset: vi.fn().mockImplementation((offset) => {
                  return Promise.resolve(deliveriesStore.filter((d) => d.status === 'DEAD_LETTER').slice(offset, offset + limit));
                }),
              })),
            })),
            then: (resolve: any) => {
              if (table === webhookSubscriptions) {
                return Promise.resolve(subscriptionsStore).then(resolve);
              }
              return Promise.resolve(deliveriesStore).then(resolve);
            },
          })),
        })),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          deliveriesStore.push(val);
          return Promise.resolve();
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((updates) => ({
          where: vi.fn().mockImplementation((condition: any) => {
            const targetId = condition?.value ?? condition?.right?.value ?? condition?.right;
            if (targetId && typeof targetId === 'string') {
              const item = deliveriesStore.find((d) => d.id === targetId);
              if (item) Object.assign(item, updates);
            } else {
              for (const d of deliveriesStore) {
                Object.assign(d, updates);
              }
            }
            return Promise.resolve();
          }),
        })),
      }),
      transaction: vi.fn().mockImplementation((callback) => callback(mockDb)),
      execute: vi.fn().mockImplementation((queryObj: any) => {
        const pending = deliveriesStore
          .filter((d) => d.status === 'RETRYING')
          .map((d) => ({
            id: d.id,
            subscription_id: d.subscriptionId ?? d.subscription_id,
            merchant_id: d.merchantId ?? d.merchant_id,
            event_id: d.eventId ?? d.event_id,
            event_type: d.eventType ?? d.event_type,
            payload: d.payload,
            attempt: d.attempt,
          }));
        return Promise.resolve(pending);
      }),
    };
  });

  describe('Retry Policy & Backoff Math', () => {
    it('enforces maximum 5 delivery attempts ceiling', () => {
      expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
      expect(RETRY_INTERVALS_MS.length).toBe(5);
    });

    it('applies exponential backoff with 20% randomized jitter', () => {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const base = RETRY_INTERVALS_MS[attempt - 1]!;
        const delay = calculateNextRetryDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(base);
        expect(delay).toBeLessThanOrEqual(base * 1.2);
      }
    });

    it('escalates to DEAD_LETTER when reaching attempt 5', () => {
      const getNextState = (attempt: number): 'RETRYING' | 'DEAD_LETTER' => {
        return attempt >= MAX_DELIVERY_ATTEMPTS ? 'DEAD_LETTER' : 'RETRYING';
      };

      expect(getNextState(1)).toBe('RETRYING');
      expect(getNextState(2)).toBe('RETRYING');
      expect(getNextState(3)).toBe('RETRYING');
      expect(getNextState(4)).toBe('RETRYING');
      expect(getNextState(5)).toBe('DEAD_LETTER');
      expect(getNextState(6)).toBe('DEAD_LETTER');
    });
  });

  describe('replayDeadLetterDelivery', () => {
    it('replays a DEAD_LETTER delivery and invokes dispatcher with next attempt count', async () => {
      const deadDelivery = {
        id: 'whd_dead_01',
        subscriptionId: 'whs_active_01',
        merchantId: 'mch_01',
        eventId: 'evt_001',
        eventType: 'payment.completed',
        payload: { amountPaisa: 50000, currency: 'BDT' },
        attempt: 5,
        status: 'DEAD_LETTER',
      };

      const activeSub = {
        id: 'whs_active_01',
        merchantId: 'mch_01',
        url: 'https://merchant.example.com/webhook',
        secret: 'whsec_valid_secret',
        events: ['payment.completed'],
        status: 'ACTIVE',
        failureCount: 5,
      };

      deliveriesStore.push(deadDelivery);
      subscriptionsStore.push(activeSub);

      // Mock dispatcher result
      const dispatchSpy = vi.spyOn(dispatcherModule, 'dispatchWebhook').mockResolvedValueOnce({
        statusCode: 200,
        responseBody: '{"received":true}',
        responseHeaders: {},
        durationMs: 45,
        success: true,
      });

      const replayResult = await replayDeadLetterDelivery(mockDb, 'whd_dead_01');

      expect(replayResult.success).toBe(true);
      expect(replayResult.attempt).toBe(6);
      expect(replayResult.deliveryId).toBe('whd_dead_01');
      // When manual replay succeeds, dead delivery record in DB is resolved to SUCCESS
      expect(deadDelivery.status).toBe('SUCCESS');
      expect(deadDelivery.nextRetryAt).toBeNull();

      expect(dispatchSpy).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          subscription: activeSub,
          attempt: 6,
          eventId: 'evt_001',
        })
      );
    });

    it('rejects replaying deliveries that are not in DEAD_LETTER status', async () => {
      deliveriesStore.push({
        id: 'whd_retrying_01',
        subscriptionId: 'whs_01',
        attempt: 2,
        status: 'RETRYING',
      });

      await expect(replayDeadLetterDelivery(mockDb, 'whd_retrying_01')).rejects.toThrow(
        'Only DEAD_LETTER deliveries can be manually replayed'
      );
    });

    it('throws when delivery does not exist', async () => {
      await expect(replayDeadLetterDelivery(mockDb, 'whd_non_existent')).rejects.toThrow(
        /not found/
      );
    });
  });

  describe('getDeadLetterDeliveries & requeueDeadLetterDelivery', () => {
    it('retrieves dead letter entries', async () => {
      deliveriesStore.push(
        { id: 'whd_dlq_1', status: 'DEAD_LETTER', merchantId: 'mch_01' },
        { id: 'whd_dlq_2', status: 'DEAD_LETTER', merchantId: 'mch_01' },
        { id: 'whd_ok', status: 'SUCCESS', merchantId: 'mch_01' }
      );

      const dlqList = await getDeadLetterDeliveries(mockDb);
      expect(dlqList.length).toBe(2);
      expect(dlqList.every((d) => d.status === 'DEAD_LETTER')).toBe(true);
    });

    it('re-queues a DEAD_LETTER delivery into RETRYING status', async () => {
      const delivery = {
        id: 'whd_dlq_requeue',
        status: 'DEAD_LETTER',
      };
      deliveriesStore.push(delivery);

      const result = await requeueDeadLetterDelivery(mockDb, 'whd_dlq_requeue');
      expect(result.success).toBe(true);
      expect(delivery.status).toBe('RETRYING');
    });
  });

  describe('WebhookService DLQ facade', () => {
    it('provides replayDeadLetter and getDeadLetters via WebhookService', async () => {
      const service = new WebhookService(mockDb);

      const deadDelivery = {
        id: 'whd_service_dlq',
        subscriptionId: 'whs_srv',
        status: 'DEAD_LETTER',
        attempt: 5,
        payload: { test: true },
        eventId: 'evt_srv',
        eventType: 'ping',
      };
      deliveriesStore.push(deadDelivery);
      subscriptionsStore.push({
        id: 'whs_srv',
        status: 'ACTIVE',
        url: 'https://example.com',
        secret: 'whsec_test',
        events: ['*'],
      });

      vi.spyOn(dispatcherModule, 'dispatchWebhook').mockResolvedValueOnce({
        statusCode: 200,
        responseBody: 'OK',
        responseHeaders: {},
        durationMs: 20,
        success: true,
      });

      const replayRes = await service.replayDeadLetter('whd_service_dlq');
      expect(replayRes.success).toBe(true);
      expect(replayRes.attempt).toBe(6);

      const dlqList = await service.getDeadLetters();
      expect(Array.isArray(dlqList)).toBe(true);
    });
  });

  describe('processWebhookRetries Poller Engine & DLQ Transition', () => {
    it('successfully processes pending retries and resolves original delivery record', async () => {
      const retryingDelivery = {
        id: 'whd_retry_pending_1',
        subscriptionId: 'whs_active_10',
        merchantId: 'mch_10',
        eventId: 'evt_retry_10',
        eventType: 'payment.completed',
        payload: { amountPaisa: 10000 },
        attempt: 1,
        status: 'RETRYING',
        nextRetryAt: new Date(Date.now() - 1000),
      };

      const activeSub = {
        id: 'whs_active_10',
        status: 'ACTIVE',
        merchantId: 'mch_10',
        url: 'https://example.com/webhook',
        secret: 'whsec_secret_10',
        events: ['payment.completed'],
      };

      deliveriesStore.push(retryingDelivery);
      subscriptionsStore.push(activeSub);

      vi.spyOn(dispatcherModule, 'dispatchWebhook').mockResolvedValueOnce({
        statusCode: 200,
        responseBody: '{"ok":true}',
        responseHeaders: {},
        durationMs: 30,
        success: true,
      });

      const summary = await processWebhookRetries(mockDb);

      expect(summary.retriedCount).toBe(1);
      expect(summary.succeededCount).toBe(1);
      expect(summary.deadLetterCount).toBe(0);

      // Verify original delivery is marked SUCCESS and nextRetryAt is null to prevent infinite loops
      expect(retryingDelivery.status).toBe('SUCCESS');
      expect(retryingDelivery.nextRetryAt).toBeNull();
    });

    it('escalates to DEAD_LETTER and clears nextRetryAt when retry reaches MAX_DELIVERY_ATTEMPTS', async () => {
      const failingDelivery = {
        id: 'whd_max_attempts_1',
        subscriptionId: 'whs_active_11',
        merchantId: 'mch_11',
        eventId: 'evt_max_11',
        eventType: 'payment.completed',
        payload: { amountPaisa: 20000 },
        attempt: 4, // Next attempt will be 5 = MAX_DELIVERY_ATTEMPTS
        status: 'RETRYING',
        nextRetryAt: new Date(Date.now() - 1000),
      };

      const activeSub = {
        id: 'whs_active_11',
        status: 'ACTIVE',
        merchantId: 'mch_11',
        url: 'https://example.com/webhook',
        secret: 'whsec_secret_11',
        events: ['payment.completed'],
      };

      deliveriesStore.push(failingDelivery);
      subscriptionsStore.push(activeSub);

      vi.spyOn(dispatcherModule, 'dispatchWebhook').mockResolvedValueOnce({
        statusCode: 500,
        responseBody: 'Server error',
        responseHeaders: {},
        durationMs: 50,
        success: false,
        error: 'HTTP status 500',
      });

      const summary = await processWebhookRetries(mockDb);

      expect(summary.retriedCount).toBe(1);
      expect(summary.succeededCount).toBe(0);
      expect(summary.deadLetterCount).toBe(1);

      // Verify row is escalated to DEAD_LETTER with nextRetryAt cleared
      expect(failingDelivery.status).toBe('DEAD_LETTER');
      expect(failingDelivery.nextRetryAt).toBeNull();
      expect(failingDelivery.errorMessage).toBe('HTTP status 500');
    });

    it('clears nextRetryAt on old delivery row when retry attempt fails under MAX_DELIVERY_ATTEMPTS', async () => {
      const retryingDelivery = {
        id: 'whd_intermediate_fail',
        subscriptionId: 'whs_active_12',
        merchantId: 'mch_12',
        eventId: 'evt_int_12',
        eventType: 'payment.completed',
        payload: { amountPaisa: 30000 },
        attempt: 2, // Next attempt is 3 < 5
        status: 'RETRYING',
        nextRetryAt: new Date(Date.now() - 1000),
      };

      const activeSub = {
        id: 'whs_active_12',
        status: 'ACTIVE',
        merchantId: 'mch_12',
        url: 'https://example.com/webhook',
        secret: 'whsec_secret_12',
        events: ['payment.completed'],
      };

      deliveriesStore.push(retryingDelivery);
      subscriptionsStore.push(activeSub);

      vi.spyOn(dispatcherModule, 'dispatchWebhook').mockResolvedValueOnce({
        statusCode: 504,
        responseBody: 'Gateway Timeout',
        responseHeaders: {},
        durationMs: 10000,
        success: false,
        error: 'HTTP status 504',
      });

      const summary = await processWebhookRetries(mockDb);

      expect(summary.retriedCount).toBe(1);
      expect(summary.succeededCount).toBe(0);
      expect(summary.deadLetterCount).toBe(0);

      // Old delivery row nextRetryAt MUST be cleared so it does not loop
      expect(retryingDelivery.nextRetryAt).toBeNull();
    });

    it('immediately moves delivery to DEAD_LETTER if subscription is disabled or deleted', async () => {
      const orphanedDelivery = {
        id: 'whd_orphaned_1',
        subscriptionId: 'whs_disabled_1',
        merchantId: 'mch_orphaned',
        eventId: 'evt_orphaned_1',
        eventType: 'payment.completed',
        payload: { amountPaisa: 40000 },
        attempt: 1,
        status: 'RETRYING',
        nextRetryAt: new Date(Date.now() - 1000),
      };

      const disabledSub = {
        id: 'whs_disabled_1',
        status: 'DISABLED',
        merchantId: 'mch_orphaned',
        url: 'https://example.com/webhook',
        secret: 'whsec_disabled',
        events: ['payment.completed'],
      };

      deliveriesStore.push(orphanedDelivery);
      subscriptionsStore.push(disabledSub);

      const summary = await processWebhookRetries(mockDb);

      expect(summary.retriedCount).toBe(1);
      expect(summary.succeededCount).toBe(0);
      expect(summary.deadLetterCount).toBe(1);

      expect(orphanedDelivery.status).toBe('DEAD_LETTER');
      expect(orphanedDelivery.nextRetryAt).toBeNull();
      expect(orphanedDelivery.errorMessage).toContain('Subscription inactive or deleted');
    });
  });
});

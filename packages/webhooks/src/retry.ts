import { sql, eq, and, desc } from 'drizzle-orm';
import { webhookDeliveries, webhookSubscriptions } from '@denaneya/database';
import { dispatchWebhook } from './dispatcher.js';
import type { DbExecutor, ProcessRetriesOptions, WebhookSubscriptionRecord } from './types.js';
import { Logger } from '@denaneya/observability';

const logger = new Logger({ service: 'webhook-retry' });

export const RETRY_INTERVALS_MS = [
  60 * 1000,         // Attempt 2: 1 minute
  5 * 60 * 1000,     // Attempt 3: 5 minutes
  15 * 60 * 1000,    // Attempt 4: 15 minutes
  60 * 60 * 1000,    // Attempt 5: 1 hour
  6 * 60 * 60 * 1000 // Attempt 6 (if extended): 6 hours
];

export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Calculates next retry delay with 20% randomized jitter.
 */
export function calculateNextRetryDelay(attempt: number): number {
  const index = Math.min(Math.max(0, attempt - 1), RETRY_INTERVALS_MS.length - 1);
  const baseInterval = RETRY_INTERVALS_MS[index]!;
  const jitter = Math.floor(Math.random() * (baseInterval * 0.2));
  return baseInterval + jitter;
}

/**
 * Poller for processing pending webhook retries.
 */
export async function processWebhookRetries(
  db: DbExecutor,
  options: ProcessRetriesOptions = {}
): Promise<{ retriedCount: number; succeededCount: number; deadLetterCount: number }> {
  const batchSize = options.batchSize ?? 50;

  // 1. Fetch pending retries using row locking
  const deliveriesToRetry = await db.transaction(async (tx: DbExecutor) => {
    const query = sql`
      SELECT id, subscription_id, merchant_id, event_id, event_type, payload, attempt
      FROM webhook_deliveries
      WHERE status = 'RETRYING'
        AND next_retry_at <= NOW()
      ORDER BY next_retry_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED;
    `;

    const result = await tx.execute(query);
    const rows = Array.isArray(result) ? result : (result as any)?.rows ?? [];

    if (rows.length === 0) return [];

    const ids = rows.map((r: any) => r.id);
    await tx.execute(sql`
      UPDATE webhook_deliveries
      SET next_retry_at = NOW() + INTERVAL '5 minutes'
      WHERE id = ANY(${ids});
    `);

    return rows;
  });

  if (deliveriesToRetry.length === 0) {
    return { retriedCount: 0, succeededCount: 0, deadLetterCount: 0 };
  }

  let succeededCount = 0;
  let deadLetterCount = 0;

  for (const item of deliveriesToRetry) {
    try {
      const subId = item.subscription_id ?? item.subscriptionId;
      const eventId = item.event_id ?? item.eventId;
      const eventType = item.event_type ?? item.eventType;
      const currentAttempt = item.attempt ?? 1;

      const subRows = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, subId));

      if (subRows.length === 0 || subRows[0].status !== 'ACTIVE') {
        await db
          .update(webhookDeliveries)
          .set({ status: 'DEAD_LETTER', nextRetryAt: null, errorMessage: 'Subscription inactive or deleted' })
          .where(eq(webhookDeliveries.id, item.id));
        deadLetterCount++;
        continue;
      }

      const subscription: WebhookSubscriptionRecord = subRows[0];
      const nextAttempt = currentAttempt + 1;

      const result = await dispatchWebhook(db, {
        subscription,
        eventId,
        eventType,
        payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload,
        attempt: nextAttempt,
      });

      if (result.success) {
        await db
          .update(webhookDeliveries)
          .set({ status: 'SUCCESS', nextRetryAt: null })
          .where(eq(webhookDeliveries.id, item.id));
        succeededCount++;
      } else if (nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
        await db
          .update(webhookDeliveries)
          .set({ status: 'DEAD_LETTER', nextRetryAt: null, errorMessage: result.error ?? null })
          .where(eq(webhookDeliveries.id, item.id));
        deadLetterCount++;
      } else {
        // Attempt failed, but next attempt was scheduled on the newly inserted delivery row.
        // Clear nextRetryAt on the old row so it does not loop indefinitely.
        await db
          .update(webhookDeliveries)
          .set({ nextRetryAt: null })
          .where(eq(webhookDeliveries.id, item.id));
      }
    } catch (err: any) {
      logger.error('Error during webhook retry dispatch', {
        deliveryId: item.id,
        error: err.message,
      });
      try {
        await db
          .update(webhookDeliveries)
          .set({ nextRetryAt: new Date(Date.now() + 15 * 60 * 1000), errorMessage: err.message })
          .where(eq(webhookDeliveries.id, item.id));
      } catch {
        // Ignore secondary error
      }
    }
  }

  return {
    retriedCount: deliveriesToRetry.length,
    succeededCount,
    deadLetterCount,
  };
}

export interface ReplayDeadLetterResult {
  success: boolean;
  deliveryId: string;
  attempt: number;
  statusCode?: number | null;
  error?: string;
}

export interface GetDeadLettersOptions {
  merchantId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Replays a failed webhook delivery stuck in DEAD_LETTER status.
 * Re-attempts dispatch with an incremented attempt count.
 */
export async function replayDeadLetterDelivery(
  db: DbExecutor,
  deliveryId: string
): Promise<ReplayDeadLetterResult> {
  const deliveryRows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId));

  const delivery = deliveryRows[0];
  if (!delivery) {
    throw new Error(`Webhook delivery '${deliveryId}' not found`);
  }

  if (delivery.status !== 'DEAD_LETTER') {
    throw new Error('Only DEAD_LETTER deliveries can be manually replayed');
  }

  const subRows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, delivery.subscriptionId));

  const subscription = subRows[0];
  if (!subscription) {
    throw new Error(`Associated webhook subscription '${delivery.subscriptionId}' not found`);
  }

  const nextAttempt = (delivery.attempt || 0) + 1;
  const payload = typeof delivery.payload === 'string' ? JSON.parse(delivery.payload) : delivery.payload;

  const result = await dispatchWebhook(db, {
    subscription,
    eventId: delivery.eventId,
    eventType: delivery.eventType as any,
    payload,
    attempt: nextAttempt,
  });

  if (result.success) {
    // When manual replay succeeds, resolve the dead-lettered delivery record
    await db
      .update(webhookDeliveries)
      .set({
        status: 'SUCCESS',
        nextRetryAt: null,
        errorMessage: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  } else {
    // Record latest replay failure on the dead letter record
    await db
      .update(webhookDeliveries)
      .set({
        errorMessage: result.error ?? 'Manual replay failed',
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  }

  return {
    success: result.success,
    deliveryId,
    attempt: nextAttempt,
    statusCode: result.statusCode,
    error: result.error,
  };
}

/**
 * Lists webhook deliveries currently in the Dead Letter Queue (DLQ).
 */
export async function getDeadLetterDeliveries(
  db: DbExecutor,
  options: GetDeadLettersOptions = {}
) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  if (options.merchantId) {
    return await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, 'DEAD_LETTER'),
          eq(webhookDeliveries.merchantId, options.merchantId)
        )
      )
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);
  }

  return await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.status, 'DEAD_LETTER'))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Re-queues a DEAD_LETTER delivery back into RETRYING status for automated scheduler pickup.
 */
export async function requeueDeadLetterDelivery(
  db: DbExecutor,
  deliveryId: string
): Promise<{ success: boolean; deliveryId: string }> {
  const deliveryRows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId));

  const delivery = deliveryRows[0];
  if (!delivery) {
    throw new Error(`Webhook delivery '${deliveryId}' not found`);
  }

  if (delivery.status !== 'DEAD_LETTER') {
    throw new Error('Only DEAD_LETTER deliveries can be re-queued');
  }

  await db
    .update(webhookDeliveries)
    .set({
      status: 'RETRYING',
      nextRetryAt: new Date(),
      errorMessage: null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  return { success: true, deliveryId };
}
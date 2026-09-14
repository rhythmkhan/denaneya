import { sql, eq } from 'drizzle-orm';
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
      const subRows = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, item.subscription_id));

      if (subRows.length === 0 || subRows[0].status !== 'ACTIVE') {
        await db
          .update(webhookDeliveries)
          .set({ status: 'DEAD_LETTER', nextRetryAt: null, errorMessage: 'Subscription inactive or deleted' })
          .where(eq(webhookDeliveries.id, item.id));
        deadLetterCount++;
        continue;
      }

      const subscription: WebhookSubscriptionRecord = subRows[0];
      const nextAttempt = item.attempt + 1;

      const result = await dispatchWebhook(db, {
        subscription,
        eventId: item.event_id,
        eventType: item.event_type,
        payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload,
        attempt: nextAttempt,
      });

      if (result.success) {
        succeededCount++;
      } else if (nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
        deadLetterCount++;
      }
    } catch (err: any) {
      logger.error('Error during webhook retry dispatch', {
        deliveryId: item.id,
        error: err.message,
      });
    }
  }

  return {
    retriedCount: deliveriesToRetry.length,
    succeededCount,
    deadLetterCount,
  };
}
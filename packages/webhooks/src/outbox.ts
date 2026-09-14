import * as crypto from 'node:crypto';
import { sql, inArray, eq } from 'drizzle-orm';
import { outboxEvents, webhookSubscriptions } from '@denaneya/database';
import { dispatchWebhook } from './dispatcher.js';
import type { DbExecutor, EnqueueOutboxEventParams, OutboxEventRecord, ProcessOutboxOptions, WebhookSubscriptionRecord } from './types.js';
import { Logger } from '@denaneya/observability';

const logger = new Logger({ service: 'webhooks-outbox' });

/**
 * Enqueues an event in the transactional outbox table.
 * Must be executed within the same database transaction as the business operation.
 */
export async function enqueueOutboxEvent<T extends Record<string, unknown>>(
  tx: DbExecutor,
  params: EnqueueOutboxEventParams<T>
): Promise<OutboxEventRecord> {
  const now = new Date();
  const id = `obx_${now.getTime().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  const scheduledAt = params.scheduledAt ?? now;

  const record: OutboxEventRecord = {
    id,
    merchantId: params.merchantId,
    eventType: params.eventType,
    payload: params.payload as Record<string, unknown>,
    status: 'PENDING',
    retryCount: 0,
    lastError: null,
    scheduledAt,
    processedAt: null,
    createdAt: now,
  };

  await tx.insert(outboxEvents).values({
    id: record.id,
    merchantId: record.merchantId,
    eventType: record.eventType,
    payload: record.payload,
    status: record.status,
    retryCount: record.retryCount,
    lastError: record.lastError,
    scheduledAt: record.scheduledAt,
    createdAt: record.createdAt,
  });

  return record;
}

/**
 * Poller that fetches pending outbox events using FOR UPDATE SKIP LOCKED
 * and dispatches them to matching active webhook subscriptions.
 */
export async function processOutboxEvents(
  db: DbExecutor,
  options: ProcessOutboxOptions = {}
): Promise<{ processedCount: number; deliveredCount: number; failedCount: number }> {
  const batchSize = options.batchSize ?? 50;

  // 1. Fetch pending batch with FOR UPDATE SKIP LOCKED
  const eventsToProcess = await db.transaction(async (tx: DbExecutor) => {
    const query = sql`
      SELECT id, merchant_id, event_type, payload, status, retry_count, last_error, scheduled_at, processed_at, created_at
      FROM outbox_events
      WHERE status = 'PENDING'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED;
    `;

    const result = await tx.execute(query);
    const rows = Array.isArray(result) ? result : (result as any)?.rows ?? [];

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((r: any) => r.id);

    // Immediately mark as PROCESSING to prevent duplicate pickup
    await tx
      .update(outboxEvents)
      .set({ status: 'PROCESSING' })
      .where(inArray(outboxEvents.id, ids));

    return rows.map((r: any) => ({
      id: r.id,
      merchantId: r.merchant_id,
      eventType: r.event_type,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: 'PROCESSING',
      retryCount: r.retry_count,
      lastError: r.last_error,
      scheduledAt: new Date(r.scheduled_at),
      processedAt: r.processed_at ? new Date(r.processed_at) : null,
      createdAt: new Date(r.created_at),
    }));
  });

  if (eventsToProcess.length === 0) {
    return { processedCount: 0, deliveredCount: 0, failedCount: 0 };
  }

  let deliveredCount = 0;
  let failedCount = 0;

  // 2. Process each event
  for (const event of eventsToProcess) {
    try {
      const subs = await db
        .select()
        .from(webhookSubscriptions)
        .where(
          sql`${webhookSubscriptions.merchantId} = ${event.merchantId} AND ${webhookSubscriptions.status} = 'ACTIVE'`
        );

      const matchingSubs = subs.filter((sub: WebhookSubscriptionRecord) => {
        const events = Array.isArray(sub.events) ? sub.events : [];
        return events.includes(event.eventType) || events.includes('*');
      });

      if (matchingSubs.length === 0) {
        await db
          .update(outboxEvents)
          .set({
            status: 'DELIVERED',
            processedAt: new Date(),
          })
          .where(eq(outboxEvents.id, event.id));
        deliveredCount++;
        continue;
      }

      for (const sub of matchingSubs) {
        await dispatchWebhook(db, {
          subscription: sub,
          eventId: event.id,
          eventType: event.eventType,
          payload: event.payload,
          attempt: 1,
        });
      }

      await db
        .update(outboxEvents)
        .set({
          status: 'DELIVERED',
          processedAt: new Date(),
        })
        .where(eq(outboxEvents.id, event.id));

      deliveredCount++;
    } catch (err: any) {
      logger.error('Failed to process outbox event', {
        eventId: event.id,
        error: err.message,
      });

      await db
        .update(outboxEvents)
        .set({
          status: 'FAILED',
          lastError: err.message,
          retryCount: event.retryCount + 1,
        })
        .where(eq(outboxEvents.id, event.id));

      failedCount++;
    }
  }

  return {
    processedCount: eventsToProcess.length,
    deliveredCount,
    failedCount,
  };
}
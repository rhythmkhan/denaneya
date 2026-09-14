import type { DbExecutor, EnqueueOutboxEventParams, ProcessOutboxOptions, ProcessRetriesOptions } from './types.js';
import { enqueueOutboxEvent, processOutboxEvents } from './outbox.js';
import { processWebhookRetries } from './retry.js';
import { verifyWebhookSignature } from './signature.js';

export class WebhookService {
  constructor(private readonly db: DbExecutor) {}

  /**
   * Enqueues an outbox event within an atomic database transaction.
   */
  async enqueueEvent<T extends Record<string, unknown>>(
    tx: DbExecutor,
    params: EnqueueOutboxEventParams<T>
  ) {
    return enqueueOutboxEvent(tx, params);
  }

  /**
   * Processes pending outbox events using SKIP LOCKED.
   */
  async pollOutbox(options?: ProcessOutboxOptions) {
    return processOutboxEvents(this.db, options);
  }

  /**
   * Processes scheduled retries using SKIP LOCKED.
   */
  async pollRetries(options?: ProcessRetriesOptions) {
    return processWebhookRetries(this.db, options);
  }

  /**
   * Verifies an inbound webhook HMAC-SHA256 signature.
   */
  verifySignature(params: Parameters<typeof verifyWebhookSignature>[0]) {
    return verifyWebhookSignature(params);
  }
}
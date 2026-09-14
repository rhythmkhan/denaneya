import type { DbExecutor, EnqueueOutboxEventParams, ProcessOutboxOptions, ProcessRetriesOptions } from './types.js';
import { enqueueOutboxEvent, processOutboxEvents } from './outbox.js';
import {
  processWebhookRetries,
  replayDeadLetterDelivery,
  getDeadLetterDeliveries,
  requeueDeadLetterDelivery,
  type GetDeadLettersOptions,
} from './retry.js';
import { verifyWebhookSignature } from './signature.js';
import {
  verifyQStashSignature,
  QStashReceiver,
  QStashClient,
  type QStashReceiverConfig,
  type QStashClientConfig,
} from './qstash.js';

export class WebhookService {
  public readonly qstashReceiver: QStashReceiver;
  public readonly qstashClient: QStashClient;

  constructor(
    private readonly db: DbExecutor,
    qstashConfig?: QStashReceiverConfig & QStashClientConfig
  ) {
    this.qstashReceiver = new QStashReceiver(qstashConfig);
    this.qstashClient = new QStashClient(qstashConfig);
  }

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
   * Verifies an inbound webhook HMAC-SHA256 signature from DenaNeya.
   */
  verifySignature(params: Parameters<typeof verifyWebhookSignature>[0]) {
    return verifyWebhookSignature(params);
  }

  /**
   * Verifies an incoming Upstash QStash webhook trigger signature (with key rotation).
   */
  verifyQStashSignature(params: Parameters<typeof verifyQStashSignature>[0]) {
    return verifyQStashSignature(params);
  }

  /**
   * Replays a dead-lettered webhook delivery.
   */
  async replayDeadLetter(deliveryId: string) {
    return replayDeadLetterDelivery(this.db, deliveryId);
  }

  /**
   * Lists deliveries currently in the Dead Letter Queue.
   */
  async getDeadLetters(options?: GetDeadLettersOptions) {
    return getDeadLetterDeliveries(this.db, options);
  }

  /**
   * Re-queues a DEAD_LETTER delivery into RETRYING status.
   */
  async requeueDeadLetter(deliveryId: string) {
    return requeueDeadLetterDelivery(this.db, deliveryId);
  }
}
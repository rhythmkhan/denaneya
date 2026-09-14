export abstract class WebhookError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SsrfBlockedError extends WebhookError {
  readonly code = 'SSRF_BLOCKED';
  constructor(public readonly url: string, public readonly reason: string) {
    super(`SSRF protection rejected webhook destination '${url}': ${reason}`);
  }
}

export class InvalidSignatureHeaderError extends WebhookError {
  readonly code = 'INVALID_SIGNATURE_HEADER';
  constructor(message = 'Invalid or malformed X-DenaNeya-Signature header format') {
    super(message);
  }
}

export class SignatureVerificationFailedError extends WebhookError {
  readonly code = 'SIGNATURE_VERIFICATION_FAILED';
  constructor(message = 'Webhook HMAC-SHA256 signature verification failed') {
    super(message);
  }
}

export class SignatureTimestampExpiredError extends WebhookError {
  readonly code = 'SIGNATURE_TIMESTAMP_EXPIRED';
  constructor(public readonly driftSeconds: number, public readonly toleranceSeconds: number) {
    super(
      `Webhook signature timestamp drift (${driftSeconds}s) exceeds allowed tolerance (${toleranceSeconds}s)`
    );
  }
}

export class WebhookDeliveryTimeoutError extends WebhookError {
  readonly code = 'WEBHOOK_DELIVERY_TIMEOUT';
  constructor(public readonly timeoutMs: number) {
    super(`Webhook delivery timed out after ${timeoutMs}ms`);
  }
}

export class SubscriptionNotFoundError extends WebhookError {
  readonly code = 'SUBSCRIPTION_NOT_FOUND';
  constructor(public readonly subscriptionId: string) {
    super(`Webhook subscription '${subscriptionId}' not found`);
  }
}
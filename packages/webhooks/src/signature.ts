import * as crypto from 'node:crypto';

export interface SignPayloadResult {
  signatureHeader: string;
  timestamp: number;
  signature: string;
}

/**
 * Signs an outbound webhook JSON body with the endpoint secret.
 */
export function signWebhookPayload(
  rawJsonBody: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): SignPayloadResult {
  if (!secret) {
    throw new Error('Webhook signing secret is required');
  }

  const signaturePayload = `${timestampSeconds}.${rawJsonBody}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');

  const signatureHeader = `t=${timestampSeconds},v1=${signature}`;
  return { signatureHeader, timestamp: timestampSeconds, signature };
}

export interface VerifyWebhookSignatureParams {
  payload: string | Buffer;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  currentTimeSeconds?: number;
}

export interface VerifySignatureResult {
  valid: boolean;
  timestamp: number;
  reason?: string;
}

/**
 * Verifies inbound webhook signature from DenaNeya.
 * Used by merchant consumers and internal verification endpoints.
 */
export function verifyWebhookSignature({
  payload,
  signatureHeader,
  secret,
  toleranceSeconds = 300,
  currentTimeSeconds = Math.floor(Date.now() / 1000),
}: VerifyWebhookSignatureParams): VerifySignatureResult {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, timestamp: 0, reason: 'Missing signature header' };
  }

  // 1. Parse header components: t=<timestamp>,v1=<signature>
  const parts = signatureHeader.split(',');
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === 't' && value) {
      timestamp = Number.parseInt(value, 10);
    } else if (key === 'v1' && value) {
      signature = value;
    }
  }

  if (timestamp === null || Number.isNaN(timestamp) || !signature) {
    return { valid: false, timestamp: 0, reason: 'Malformed signature header' };
  }

  // 2. Anti-Replay Timestamp Drift Check
  const drift = Math.abs(currentTimeSeconds - timestamp);
  if (drift > toleranceSeconds) {
    return {
      valid: false,
      timestamp,
      reason: `Timestamp drift (${drift}s) exceeds allowed tolerance (${toleranceSeconds}s)`,
    };
  }

  // 3. Compute Expected HMAC-SHA256
  const rawBodyString = typeof payload === 'string' ? payload : payload.toString('utf8');
  const signaturePayload = `${timestamp}.${rawBodyString}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');

  // 4. Constant-time comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, timestamp, reason: 'Signature length mismatch' };
  }

  const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  return {
    valid: isValid,
    timestamp,
    reason: isValid ? undefined : 'HMAC signature mismatch',
  };
}
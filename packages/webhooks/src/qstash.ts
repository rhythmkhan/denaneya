import * as crypto from 'node:crypto';

export interface SignQStashMessageParams {
  body: string | Buffer;
  url: string;
  key: string;
  expSeconds?: number;
  clockTimeSeconds?: number;
}

/**
 * Signs a message using the QStash JWT format (HS256).
 * Computes SHA-256 hash of the body and signs the JWT using the provided signing key.
 */
export function signQStashMessage(params: SignQStashMessageParams): string {
  const { body, url, key, expSeconds = 300, clockTimeSeconds } = params;
  const trimmedKey = (key ?? '').trim();
  if (!trimmedKey) {
    throw new Error('QStash signing key is required to sign a message');
  }

  const now = clockTimeSeconds ?? Math.floor(Date.now() / 1000);
  const rawBody = typeof body === 'string' ? body : (body ? body.toString('utf8') : '');
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('base64url');

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'Upstash',
    sub: url,
    exp: now + expSeconds,
    nbf: now - 5,
    body: bodyHash,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', trimmedKey)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export interface VerifyQStashSignatureParams {
  signature: string;
  body: string | Buffer;
  url?: string;
  currentSigningKey?: string;
  nextSigningKey?: string;
  toleranceSeconds?: number;
  clockTimeSeconds?: number;
}

export interface VerifyQStashResult {
  valid: boolean;
  keyUsed?: 'current' | 'next';
  reason?: string;
  claims?: {
    iss: string;
    sub?: string;
    exp?: number;
    nbf?: number;
    body?: string;
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/**
 * Verifies incoming QStash message signature (Upstash-Signature).
 * Handles zero-downtime key rotation cleanly by verifying against
 * QSTASH_CURRENT_SIGNING_KEY first, and seamlessly falling back to
 * QSTASH_NEXT_SIGNING_KEY if the current key does not match.
 */
export function verifyQStashSignature(params: VerifyQStashSignatureParams): VerifyQStashResult {
  const currentKey = (params.currentSigningKey ?? process.env.QSTASH_CURRENT_SIGNING_KEY ?? '').trim();
  const nextKey = (params.nextSigningKey ?? process.env.QSTASH_NEXT_SIGNING_KEY ?? '').trim();

  if (!currentKey && !nextKey) {
    return {
      valid: false,
      reason: 'No QStash signing keys configured (neither current nor next key available)',
    };
  }

  if (!params.signature || typeof params.signature !== 'string') {
    return { valid: false, reason: 'Missing Upstash-Signature header' };
  }

  const parts = params.signature.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed QStash JWT: expected 3 dot-separated segments' };
  }

  const [headerB64, payloadB64, rawSignatureB64] = parts;
  const signatureB64 = rawSignatureB64!.trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  // 1. Decode & validate JWT header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed QStash JWT header JSON' };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, reason: `Unsupported QStash signature algorithm: ${header.alg}` };
  }

  // 2. Decode & validate JWT payload
  let payload: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try {
    payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed QStash JWT payload JSON' };
  }

  if (payload.iss !== 'Upstash') {
    return { valid: false, reason: `Invalid QStash issuer '${payload.iss}', expected 'Upstash'` };
  }

  const now = params.clockTimeSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? 300;

  // 3. Expiration & Not-Before validation
  if (payload.exp !== undefined && typeof payload.exp === 'number') {
    if (now > payload.exp + tolerance) {
      return {
        valid: false,
        reason: `Signature expired (exp: ${payload.exp}, now: ${now}, drift: ${now - payload.exp}s)`,
      };
    }
  }

  if (payload.nbf !== undefined && typeof payload.nbf === 'number') {
    if (now < payload.nbf - tolerance) {
      return {
        valid: false,
        reason: `Signature not yet valid (nbf: ${payload.nbf}, now: ${now})`,
      };
    }
  }

  // 4. Destination URL validation (if URL provided)
  if (params.url) {
    if (!payload.sub || normalizeUrl(params.url) !== normalizeUrl(payload.sub)) {
      return {
        valid: false,
        reason: `Destination URL mismatch: expected '${params.url}', got '${payload.sub ?? 'none'}'`,
      };
    }
  }

  // 5. Body SHA-256 validation (if body claim present)
  if (payload.body) {
    const rawBody = typeof params.body === 'string' ? params.body : (params.body ? params.body.toString('utf8') : '');
    const computedB64 = crypto.createHash('sha256').update(rawBody).digest('base64url');
    const computedHex = crypto.createHash('sha256').update(rawBody).digest('hex');
    const computedStdB64 = crypto.createHash('sha256').update(rawBody).digest('base64');

    if (payload.body !== computedB64 && payload.body !== computedHex && payload.body !== computedStdB64) {
      return { valid: false, reason: 'Message body SHA-256 hash mismatch' };
    }
  }

  const signableContent = `${headerB64}.${payloadB64}`;

  // 6. Cryptographic verification with Current Key
  if (currentKey) {
    const expectedCurrent = crypto
      .createHmac('sha256', currentKey)
      .update(signableContent)
      .digest('base64url');

    if (timingSafeEqual(signatureB64, expectedCurrent)) {
      return {
        valid: true,
        keyUsed: 'current',
        claims: payload as any,
      };
    }
  }

  // 7. Cryptographic verification fallback with Next Key (Zero-Downtime Key Rotation)
  if (nextKey) {
    const expectedNext = crypto
      .createHmac('sha256', nextKey)
      .update(signableContent)
      .digest('base64url');

    if (timingSafeEqual(signatureB64, expectedNext)) {
      return {
        valid: true,
        keyUsed: 'next',
        claims: payload as any,
      };
    }
  }

  return {
    valid: false,
    reason: currentKey && nextKey
      ? 'Signature verification failed for both current and next signing keys'
      : 'Signature verification failed for configured signing key',
  };
}

export interface QStashReceiverConfig {
  currentSigningKey?: string;
  nextSigningKey?: string;
  toleranceSeconds?: number;
}

/**
 * Receiver helper for verifying QStash messages with automated key rotation handling.
 */
export class QStashReceiver {
  private currentSigningKey?: string;
  private nextSigningKey?: string;
  private toleranceSeconds: number;

  constructor(config: QStashReceiverConfig = {}) {
    this.currentSigningKey = config.currentSigningKey;
    this.nextSigningKey = config.nextSigningKey;
    this.toleranceSeconds = config.toleranceSeconds ?? 300;
  }

  public verify(params: {
    signature: string;
    body: string | Buffer;
    url?: string;
    toleranceSeconds?: number;
    clockTimeSeconds?: number;
  }): VerifyQStashResult {
    return verifyQStashSignature({
      ...params,
      currentSigningKey: this.currentSigningKey ?? process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: this.nextSigningKey ?? process.env.QSTASH_NEXT_SIGNING_KEY,
      toleranceSeconds: params.toleranceSeconds ?? this.toleranceSeconds,
    });
  }
}

export interface QStashClientConfig {
  baseUrl?: string;
  token?: string;
  currentSigningKey?: string;
  nextSigningKey?: string;
  timeoutMs?: number;
}

export interface PublishQStashMessageParams {
  destinationUrl: string;
  body: Record<string, unknown> | string;
  delaySeconds?: number;
  retries?: number;
  headers?: Record<string, string>;
  callbackUrl?: string;
  failureCallbackUrl?: string;
  deduplicationId?: string;
}

export interface PublishQStashResult {
  messageId: string;
  url: string;
  deduplicated?: boolean;
}

/**
 * Upstash QStash client for publishing asynchronous delayed/retry messages
 * and managing incoming message verification.
 */
export class QStashClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;
  public receiver: QStashReceiver;

  constructor(config: QStashClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env.QSTASH_URL ?? 'https://qstash.upstash.io/v2').replace(/\/+$/, '');
    this.token = (config.token ?? process.env.QSTASH_TOKEN ?? '').trim();
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.receiver = new QStashReceiver({
      currentSigningKey: config.currentSigningKey,
      nextSigningKey: config.nextSigningKey,
    });
  }

  public async publish(params: PublishQStashMessageParams): Promise<PublishQStashResult> {
    if (!this.token) {
      throw new Error('QStash token must be configured to publish messages');
    }

    const {
      destinationUrl,
      body,
      delaySeconds,
      retries,
      headers = {},
      callbackUrl,
      failureCallbackUrl,
      deduplicationId,
    } = params;

    const targetEndpoint = `${this.baseUrl}/publish/${destinationUrl}`;

    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    if (delaySeconds && delaySeconds > 0) {
      reqHeaders['Upstash-Delay'] = `${delaySeconds}s`;
    }
    if (retries !== undefined) {
      reqHeaders['Upstash-Retries'] = String(retries);
    }
    if (callbackUrl) {
      reqHeaders['Upstash-Callback'] = callbackUrl;
    }
    if (failureCallbackUrl) {
      reqHeaders['Upstash-Failure-Callback'] = failureCallbackUrl;
    }
    if (deduplicationId) {
      reqHeaders['Upstash-Deduplication-Id'] = deduplicationId;
    }

    for (const [k, v] of Object.entries(headers)) {
      reqHeaders[`Upstash-Forward-${k}`] = v;
    }

    const payloadStr = typeof body === 'string' ? body : JSON.stringify(body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(targetEndpoint, {
        method: 'POST',
        headers: reqHeaders,
        body: payloadStr,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`QStash publish failed (HTTP ${res.status}): ${errText}`);
      }

      const json = (await res.json()) as any;
      return {
        messageId: json?.messageId || `msg_${Date.now().toString(36)}`,
        url: destinationUrl,
        deduplicated: Boolean(json?.deduplicated),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices, collectorEvents } from '@denaneya/database';
import { ApiError } from './errors';

export function formatPublicKeyPem(publicKey: string): string {
  if (publicKey.startsWith('-----BEGIN')) {
    return publicKey;
  }
  const isHex = /^[0-9a-fA-F]+$/.test(publicKey);
  const base64Key = isHex ? Buffer.from(publicKey, 'hex').toString('base64') : publicKey;
  const lines = base64Key.match(/.{1,64}/g) || [base64Key];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

export interface DevicePairingSession {
  rawToken: string;
  tokenHash: string;
  deviceId: string;
  expiresAt: Date;
  qrPayload: string;
}

export function createDevicePairingSession(
  merchantId: string,
  serverUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://api.denaneya.com'
): DevicePairingSession {
  const rawToken = 'pair_' + crypto.randomBytes(16).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const qrPayload = JSON.stringify({
    serverUrl,
    merchantId,
    deviceId,
    pairingToken: rawToken,
    expiresAt: expiresAt.toISOString(),
  });
  return { rawToken, tokenHash, deviceId, expiresAt, qrPayload };
}

export function buildCanonicalCollectorEnvelope(data: {
  deviceId: string;
  sequenceNumber: number;
  nonce: string;
  timestamp: number;
  eventType: string;
  payload: any;
}): string {
  return JSON.stringify({
    deviceId: data.deviceId,
    sequenceNumber: data.sequenceNumber,
    nonce: data.nonce,
    timestamp: data.timestamp,
    eventType: data.eventType,
    payload: data.payload,
  });
}

export function verifyDeviceSignature(
  canonicalEnvelope: string,
  publicKeyHexOrPem: string,
  signatureBase64: string
): boolean {
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonicalEnvelope);
    const publicKeyPem = formatPublicKeyPem(publicKeyHexOrPem);
    return verifier.verify(publicKeyPem, signatureBase64, 'base64');
  } catch {
    return false;
  }
}

export async function verifySignedCollectorPayload(
  rawPayload: any,
  expectedEventType: 'SMS_RECEIVED' | 'HEARTBEAT' | 'STATUS_UPDATE',
  requestId: string
) {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be a JSON object.', 422, requestId);
  }

  const { deviceId, sequenceNumber, nonce, timestamp, eventType, payload, signature } = rawPayload;

  if (!deviceId || sequenceNumber === undefined || !nonce || !timestamp || !signature || !payload) {
    throw new ApiError('VALIDATION_ERROR', 'Missing required collector envelope fields.', 422, requestId);
  }

  if (eventType !== expectedEventType) {
    throw new ApiError('VALIDATION_ERROR', `Expected eventType '${expectedEventType}' but received '${eventType}'.`, 422, requestId);
  }

  // 1. Freshness Check (±300 seconds / 5 minutes)
  const nowMs = Date.now();
  const eventTime = Number(timestamp);
  if (isNaN(eventTime) || Math.abs(nowMs - eventTime) > 300_000) {
    throw new ApiError('EVENT_REPLAY_DETECTED', 'Device event timestamp outside acceptable 5-minute window.', 409, requestId);
  }

  // 2. Fetch Device from DB
  let device: any = null;
  if (db) {
    const [dev] = await db
      .select()
      .from(collectorDevices)
      .where(eq(collectorDevices.deviceId, deviceId));
    device = dev;
  }

  if (!device || device.status !== 'ACTIVE') {
    throw new ApiError('UNAUTHORIZED', 'Device is unregistered or not active.', 401, requestId);
  }

  // 3. Monotonic Sequence Check
  if (BigInt(sequenceNumber) <= (device.sequenceNumber ?? 0n)) {
    throw new ApiError('EVENT_REPLAY_DETECTED', `Sequence number ${sequenceNumber} is not greater than current device sequence ${device.sequenceNumber}.`, 409, requestId);
  }

  // 4. Nonce Uniqueness Check (Replay Prevention)
  if (db) {
    const [existingEvent] = await db
      .select()
      .from(collectorEvents)
      .where(
        and(
          eq(collectorEvents.deviceId, device.id),
          eq(collectorEvents.nonce, nonce)
        )
      );

    if (existingEvent) {
      throw new ApiError('EVENT_REPLAY_DETECTED', `Duplicate event nonce '${nonce}' detected.`, 409, requestId);
    }
  }

  // 5. Verify ECDSA P-256 Signature over Canonical JSON
  const canonicalEnvelope = buildCanonicalCollectorEnvelope({
    deviceId,
    sequenceNumber,
    nonce,
    timestamp,
    eventType,
    payload,
  });

  const isValidSig = verifyDeviceSignature(canonicalEnvelope, device.publicKeyHex, signature);
  if (!isValidSig) {
    throw new ApiError('INVALID_DEVICE_SIGNATURE', 'Cryptographic signature verification failed for device.', 401, requestId);
  }

  return { device };
}

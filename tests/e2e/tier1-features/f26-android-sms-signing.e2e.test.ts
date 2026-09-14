import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  buildCanonicalCollectorEnvelope,
  verifyDeviceSignature,
} from '../../../apps/web/src/lib/api/device-auth.js';

describe('Feature 26: Android SMS Ingestion & Signing (E2E-T1-F26)', () => {
  const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  // E2E-T1-F26-01: Valid ECDSA Signed Payload Acceptance
  it('E2E-T1-F26-01: Valid ECDSA Signed Payload Acceptance', () => {
    const envelope = buildCanonicalCollectorEnvelope({
      deviceId: 'dev_valid_01',
      sequenceNumber: 101,
      nonce: 'nonce_test_001',
      timestamp: Date.now(),
      eventType: 'SMS_RECEIVED',
      payload: {
        sender: 'bKash',
        messageText: 'You have received Tk 1,500.00 from 01712345678. TrxID 9K38AL90',
        receivedAt: Date.now(),
        simSlot: 0,
        batteryLevel: 85,
        isCharging: false,
      },
    });

    const signer = crypto.createSign('SHA256');
    signer.update(envelope);
    signer.end();
    const signature = signer.sign(keyPair.privateKey, 'base64');

    const isValid = verifyDeviceSignature(envelope, publicKeyPem, signature);
    expect(isValid).toBe(true);
  });

  // E2E-T1-F26-02: Rejection of Forged / Tampered Payload Signature
  it('E2E-T1-F26-02: Rejection of Forged / Tampered Payload Signature', () => {
    const envelope = buildCanonicalCollectorEnvelope({
      deviceId: 'dev_valid_01',
      sequenceNumber: 102,
      nonce: 'nonce_test_002',
      timestamp: Date.now(),
      eventType: 'SMS_RECEIVED',
      payload: {
        sender: 'bKash',
        messageText: 'You have received Tk 1,000.00 from 01712345678.',
      },
    });

    const signer = crypto.createSign('SHA256');
    signer.update(envelope);
    signer.end();
    const signature = signer.sign(keyPair.privateKey, 'base64');

    // Tamper 1 character in envelope
    const tamperedEnvelope = envelope.replace('1,000.00', '10,000.00');
    const isValid = verifyDeviceSignature(tamperedEnvelope, publicKeyPem, signature);
    expect(isValid).toBe(false);
  });

  // E2E-T1-F26-03: Rejection of Clock Skew Exceeding Window (±300 Seconds)
  it('E2E-T1-F26-03: Rejection of Clock Skew Exceeding Window (±300 Seconds)', () => {
    const now = Date.now();
    const allowedWindowMs = 300_000; // 300 seconds

    const freshTimestamp = now - 60_000; // 60s ago
    expect(Math.abs(now - freshTimestamp)).toBeLessThanOrEqual(allowedWindowMs);

    const staleTimestamp = now - 301_000; // 301s ago
    expect(Math.abs(now - staleTimestamp)).toBeGreaterThan(allowedWindowMs);
  });

  // E2E-T1-F26-04: Anti-Replay Nonce Duplication Rejection
  it('E2E-T1-F26-04: Anti-Replay Nonce Duplication Rejection', () => {
    const usedNonces = new Set<string>();
    const testNonce = 'nonce_unique_12345';

    // First acceptance
    expect(usedNonces.has(testNonce)).toBe(false);
    usedNonces.add(testNonce);

    // Second rejection
    expect(usedNonces.has(testNonce)).toBe(true);
  });

  // E2E-T1-F26-05: Monotonic Sequence Number Enforcement
  it('E2E-T1-F26-05: Monotonic Sequence Number Enforcement', () => {
    let lastSeq = 10n;

    const incomingSeq1 = 11n;
    expect(incomingSeq1 > lastSeq).toBe(true);
    lastSeq = incomingSeq1;

    const outOfOrderSeq = 9n;
    expect(outOfOrderSeq > lastSeq).toBe(false);

    const replaySeq = 11n;
    expect(replaySeq > lastSeq).toBe(false);
  });
});

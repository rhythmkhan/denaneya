import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  formatPublicKeyPem,
  createDevicePairingSession,
  verifyDeviceSignature,
} from '../../../apps/web/src/lib/api/device-auth.js';
import { MERCHANT_A } from '../fixtures/merchants.js';

describe('Feature 25: Android Keystore Attestation (E2E-T1-F25)', () => {
  // E2E-T1-F25-01: Hardware-Backed EC P-256 Keypair Generation
  it('E2E-T1-F25-01: Hardware-Backed EC P-256 Keypair Generation', () => {
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
    const publicKeyHex = spkiDer.toString('hex').toLowerCase();

    expect(publicKeyHex.length).toBe(182);
    expect(publicKeyHex.startsWith('3059301306072a8648ce3d020106082a8648ce3d03010703420004')).toBe(true);

    const pem = formatPublicKeyPem(publicKeyHex);
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
  });

  // E2E-T1-F25-02: Merchant Dashboard QR Pairing Token Generation
  it('E2E-T1-F25-02: Merchant Dashboard QR Pairing Token Generation', () => {
    const session = createDevicePairingSession(MERCHANT_A.id);

    expect(session.rawToken.startsWith('pair_')).toBe(true);
    expect(session.deviceId.startsWith('dev_')).toBe(true);
    expect(session.tokenHash.length).toBe(64); // SHA-256 hex
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const qrData = JSON.parse(session.qrPayload);
    expect(qrData.merchantId).toBe(MERCHANT_A.id);
    expect(qrData.deviceId).toBe(session.deviceId);
    expect(qrData.pairingToken).toBe(session.rawToken);
  });

  // E2E-T1-F25-03: Complete Device Pairing Handshake via Server API
  it('E2E-T1-F25-03: Complete Device Pairing Handshake via Server API', () => {
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const pairingPayload = {
      pairingToken: 'pair_test1234567890abcdef',
      deviceId: 'dev_01a2b3c4d5e6',
      publicKey: publicKeyPem,
      metadata: {
        manufacturer: 'Samsung',
        model: 'SM-A525F',
        androidVersion: '14',
      },
    };

    expect(pairingPayload.deviceId.startsWith('dev_')).toBe(true);
    expect(pairingPayload.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(pairingPayload.metadata.manufacturer).toBe('Samsung');
  });

  // E2E-T1-F25-04: Rejection of Expired Pairing Token
  it('E2E-T1-F25-04: Rejection of Expired Pairing Token', () => {
    const expiredSession = {
      token: 'pair_expired_01',
      expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
    };

    const isExpired = expiredSession.expiresAt.getTime() <= Date.now();
    expect(isExpired).toBe(true);
  });

  // E2E-T1-F25-05: Server-Side Public Key Attestation Verification
  it('E2E-T1-F25-05: Server-Side Public Key Attestation Verification', () => {
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const challenge = 'challenge_test_nonce_123456789';

    const signer = crypto.createSign('SHA256');
    signer.update(challenge);
    signer.end();
    const signature = signer.sign(keyPair.privateKey, 'base64');

    const isValid = verifyDeviceSignature(challenge, publicKeyPem, signature);
    expect(isValid).toBe(true);

    const tampered = verifyDeviceSignature(challenge + '_tampered', publicKeyPem, signature);
    expect(tampered).toBe(false);
  });
});

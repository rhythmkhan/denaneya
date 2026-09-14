import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { parseMfsSms, BalanceChainEngine } from '@denaneya/sms-parser';
import { Paisa } from '@denaneya/payment-core';
import * as authModule from '../../src/lib/api/auth';
import {
  createDevicePairingSession,
  formatPublicKeyPem,
  buildCanonicalCollectorEnvelope,
  verifyDeviceSignature,
} from '../../src/lib/api/device-auth';
import { GET as devicesGet } from '../../src/app/api/v1/devices/route';
import { POST as smsPost } from '../../src/app/api/v1/devices/sms/route';
import { POST as heartbeatPost } from '../../src/app/api/v1/devices/heartbeat/route';

describe('Android Device Fleet, Hardware Signing & SMS Ingestion', () => {
  it('generates pairing tokens that expire strictly in 10 minutes via createDevicePairingSession', () => {
    const session = createDevicePairingSession('mch_test_123');

    expect(session.rawToken.startsWith('pair_')).toBe(true);
    expect(session.rawToken.length).toBeGreaterThan(32);
    expect(session.deviceId.startsWith('dev_')).toBe(true);

    const expectedHash = crypto.createHash('sha256').update(session.rawToken).digest('hex');
    expect(session.tokenHash).toBe(expectedHash);

    const diffMs = session.expiresAt.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(590_000);
    expect(diffMs).toBeLessThanOrEqual(600_000);

    const qrData = JSON.parse(session.qrPayload);
    expect(qrData.merchantId).toBe('mch_test_123');
    expect(qrData.deviceId).toBe(session.deviceId);
    expect(qrData.pairingToken).toBe(session.rawToken);
    expect(qrData.expiresAt).toBe(session.expiresAt.toISOString());
  });

  it('signs and verifies collector envelopes using hardware-grade EC P-256 ECDSA via device-auth helpers', () => {
    // Generate EC P-256 key pair simulating Android Hardware Keystore
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // Verify formatPublicKeyPem preserves PEM format
    expect(formatPublicKeyPem(publicKeyPem)).toBe(publicKeyPem);

    const envelopeData = {
      deviceId: 'dev_test_hw_p256',
      sequenceNumber: 42,
      nonce: crypto.randomUUID(),
      timestamp: 1718000000000,
      eventType: 'SMS_RECEIVED',
      payload: {
        sender: 'bKash',
        rawMessage: 'You have received Tk 1,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 25,430.00. TrxID 9K28JA821.',
      },
    };

    const canonicalEnvelope = buildCanonicalCollectorEnvelope(envelopeData);
    expect(canonicalEnvelope).toContain('"deviceId":"dev_test_hw_p256"');
    expect(canonicalEnvelope).toContain('"sequenceNumber":42');

    // Sign payload with private key
    const sign = crypto.createSign('SHA256');
    sign.update(canonicalEnvelope);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');

    // Verify using production verifyDeviceSignature
    const isValid = verifyDeviceSignature(canonicalEnvelope, publicKeyPem, signature);
    expect(isValid).toBe(true);

    // Tamper detection: modified envelope must fail verification
    const tamperedData = {
      ...envelopeData,
      payload: {
        ...envelopeData.payload,
        rawMessage: envelopeData.payload.rawMessage.replace('1,500.00', '15,000.00'),
      },
    };
    const tamperedEnvelope = buildCanonicalCollectorEnvelope(tamperedData);
    const isTamperedValid = verifyDeviceSignature(tamperedEnvelope, publicKeyPem, signature);
    expect(isTamperedValid).toBe(false);

    // Wrong public key must fail verification
    const otherKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const otherPublicKeyPem = otherKeyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const isOtherKeyValid = verifyDeviceSignature(canonicalEnvelope, otherPublicKeyPem, signature);
    expect(isOtherKeyValid).toBe(false);
  });

  it('verifies balance-chain continuity with BalanceChainEngine', () => {
    const prev = new Paisa(2393000n); // 23,930.00 BDT
    const incomingSms = {
      balancePaisa: new Paisa(2543000n), // 25,430.00 BDT
      amountPaisa: new Paisa(150000n),   // 1,500.00 BDT
      feePaisa: Paisa.zero(),
      type: 'PAYMENT_RECEIVED' as const,
    } as any;

    const verified = BalanceChainEngine.verify({
      walletId: 'wal_test_chain_1',
      incomingSms,
      previousBalancePaisa: prev,
    });

    expect(verified.status).toBe('VERIFIED');
    expect(verified.isDiscontinuity).toBe(false);
    expect(verified.reportedBalancePaisa?.amountPaisa).toBe(2543000n);

    // Tampered balance creates discontinuity
    const tamperedSms = {
      ...incomingSms,
      balancePaisa: new Paisa(2543100n), // 100 paisa extra
    };

    const discontinuity = BalanceChainEngine.verify({
      walletId: 'wal_test_chain_1',
      incomingSms: tamperedSms,
      previousBalancePaisa: prev,
    });

    expect(discontinuity.status).toBe('DISCONTINUITY_DETECTED');
    expect(discontinuity.isDiscontinuity).toBe(true);
  });

  it('parses genuine bKash, Nagad, and Rocket SMS via parseMfsSms', () => {
    // bKash
    const bkashText =
      'You have received Tk 2,000.00 from 01711223344. Fee Tk 0.00. Balance Tk 8,200.00. TrxID 9A8B7C6D at 13/09/2026 19:45';
    const bkashRes = parseMfsSms('bKash', bkashText);
    expect(bkashRes.status).toBe('SUCCESS');
    expect(bkashRes.provider).toBe('BKASH');
    expect(bkashRes.trxId).toBe('9A8B7C6D');
    expect(bkashRes.amountPaisa.amountPaisa).toBe(200000n);
    expect(bkashRes.deduplicationHash).toBeDefined();

    // Nagad
    const nagadText =
      'Merchant Pay. Amount: Tk 1,500.00. From: 01712345678. Ref: Invoice101. TxnID: 72N4A99X. Fee: Tk 0.00. Balance: Tk 24,500.00. Date: 13/09/2026 21:15';
    const nagadRes = parseMfsSms('NAGAD', nagadText);
    expect(nagadRes.status).toBe('SUCCESS');
    expect(nagadRes.provider).toBe('NAGAD');
    expect(nagadRes.trxId).toBe('72N4A99X');
    expect(nagadRes.amountPaisa.amountPaisa).toBe(150000n);
    expect(nagadRes.reference).toBe('Invoice101');

    // Rocket
    const rocketText =
      'Tk1,200.00 received from A/C: 017123456789. Fee Tk0.00. Balance: Tk15,400.00. TxnId: 2847192841. Date:13-SEP-26 21:30:15';
    const rocketRes = parseMfsSms('16216', rocketText);
    expect(rocketRes.status).toBe('SUCCESS');
    expect(rocketRes.provider).toBe('ROCKET');
    expect(rocketRes.trxId).toBe('2847192841');
    expect(rocketRes.amountPaisa.amountPaisa).toBe(120000n);
  });

  it('rejects device SMS and heartbeat requests with missing envelope fields with HTTP 422', async () => {
    const invalidSmsReq = new NextRequest('http://localhost/api/v1/devices/sms', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev_test_123' }), // missing sequence, nonce, timestamp, signature, payload
    });
    const smsRes = await smsPost(invalidSmsReq);
    expect(smsRes.status).toBe(422);
    const smsBody = await smsRes.json();
    expect(smsBody.error.code).toBe('VALIDATION_ERROR');

    const invalidHeartbeatReq = new NextRequest('http://localhost/api/v1/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev_test_123' }),
    });
    const heartbeatRes = await heartbeatPost(invalidHeartbeatReq);
    expect(heartbeatRes.status).toBe(422);
    const hbBody = await heartbeatRes.json();
    expect(hbBody.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects device events with expired timestamps outside the 5-minute window with HTTP 409', async () => {
    const staleHeartbeatReq = new NextRequest('http://localhost/api/v1/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev_test_123',
        sequenceNumber: 1,
        nonce: 'nonce_expired_1',
        timestamp: Date.now() - 600_000, // 10 minutes ago
        eventType: 'HEARTBEAT',
        signature: 'dummy_sig',
        payload: { batteryLevel: 90 },
      }),
    });
    const res = await heartbeatPost(staleHeartbeatReq);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('EVENT_REPLAY_DETECTED');
  });

  it('GET /api/v1/devices rejects unauthenticated requests with HTTP 401', async () => {
    const unauthReq = new NextRequest('http://localhost/api/v1/devices');
    const res = await devicesGet(unauthReq);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/devices returns list of devices for authenticated merchant with HTTP 200', async () => {
    const spy = vi.spyOn(authModule, 'authenticateApiKey').mockResolvedValue({
      merchant: {
        id: 'mch_test_123',
        name: 'Test Merchant',
        businessName: 'Test Merchant Ltd',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
        fixedFeePaisa: 0n,
        defaultCurrency: 'BDT',
      },
      apiKey: {
        id: 'key_devices_test',
        name: 'Test Key Devices',
        keyPrefix: 'dn_test_sec_',
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['devices:read'],
      },
      requestId: 'req_devices_test',
    });

    try {
      const authReq = new NextRequest('http://localhost/api/v1/devices', {
        headers: { authorization: 'Bearer dn_test_sec_12345678901234567890123456789012' },
      });
      const res = await devicesGet(authReq);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

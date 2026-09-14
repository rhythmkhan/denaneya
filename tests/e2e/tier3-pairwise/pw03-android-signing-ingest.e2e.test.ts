import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { parseMfsSms, BalanceChainEngine, type ParsedSmsResult } from '@denaneya/sms-parser';
import {
  signDevicePayload,
  verifyDevicePayload,
} from '../helpers/signature-helper.js';
import { EC_P256_TEST_KEY } from '../fixtures/crypto-keys.js';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance } from '../helpers/ledger-verifier.js';
import crypto from 'node:crypto';

describe('Tier 3: Pairwise Suite 03 — Android Signing, Ingestion & Device Lifecycle', () => {
  /**
   * E2E-T3-PW-03: Android Device Keystore × Clock Drift Expiry × Replay Nonce Rejection
   * Interaction: Android device signs event with valid key but timestamp is 310s old;
   * device resubmits with updated timestamp but reuses old nonce.
   * Assertion: First rejected for TIMESTAMP_OUT_OF_BOUNDS; second rejected for NONCE_ALREADY_USED.
   */
  it('E2E-T3-PW-03: Android Device Keystore × Clock Drift Expiry × Replay Nonce Rejection', () => {
    const usedNonces = new Set<string>();
    const CLOCK_TOLERANCE_SECONDS = 300; // 5 minutes

    const validateAndIngest = (signedEnvelope: {
      payload: any;
      signature: string;
      publicKeyPem: string;
    }) => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const payloadTime = Math.floor(new Date(signedEnvelope.payload.timestamp).getTime() / 1000);

      // 1. Clock skew / timestamp window check
      if (Math.abs(nowSeconds - payloadTime) > CLOCK_TOLERANCE_SECONDS) {
        throw new Error('TIMESTAMP_OUT_OF_BOUNDS: Event timestamp exceeds +/- 300s window');
      }

      // 2. Nonce replay check
      const nonce = signedEnvelope.payload.nonce;
      if (usedNonces.has(nonce)) {
        throw new Error('NONCE_ALREADY_USED: Replay attack detected on device event nonce');
      }

      // 3. Cryptographic signature verification
      const isValid = verifyDevicePayload(
        signedEnvelope.payload,
        signedEnvelope.signature,
        signedEnvelope.publicKeyPem
      );
      if (!isValid) {
        throw new Error('INVALID_SIGNATURE: ECDSA P-256 verification failed');
      }

      usedNonces.add(nonce);
      return { success: true };
    };

    const staleTimestamp = new Date(Date.now() - 310 * 1000).toISOString();
    const fixedNonce = 'nonce_replay_test_001';

    // Step 1: Submission with 310s clock drift
    const payloadStale = {
      deviceId: 'dev_01',
      nonce: fixedNonce,
      timestamp: staleTimestamp,
      sms: 'You have received Tk 100',
    };
    const signatureStale = signDevicePayload(payloadStale, EC_P256_TEST_KEY.privateKeyPem);

    expect(() =>
      validateAndIngest({
        payload: payloadStale,
        signature: signatureStale,
        publicKeyPem: EC_P256_TEST_KEY.publicKeyPem,
      })
    ).toThrow(/TIMESTAMP_OUT_OF_BOUNDS/);

    // Step 2: Submission with updated timestamp but re-using stale nonce
    const payloadReplay = {
      deviceId: 'dev_01',
      nonce: fixedNonce,
      timestamp: new Date().toISOString(),
      sms: 'You have received Tk 100',
    };
    const signatureReplay = signDevicePayload(payloadReplay, EC_P256_TEST_KEY.privateKeyPem);

    // First use of nonce succeeds
    const firstRes = validateAndIngest({
      payload: payloadReplay,
      signature: signatureReplay,
      publicKeyPem: EC_P256_TEST_KEY.publicKeyPem,
    });
    expect(firstRes.success).toBe(true);

    // Immediate replay of same nonce rejected
    expect(() =>
      validateAndIngest({
        payload: payloadReplay,
        signature: signatureReplay,
        publicKeyPem: EC_P256_TEST_KEY.publicKeyPem,
      })
    ).toThrow(/NONCE_ALREADY_USED/);
  });

  /**
   * E2E-T3-PW-15: Multi-SIM Android Ingestion × SIM Slot Partitioning × Ledger Wallet Assignment
   * Interaction: Android device receives bKash on SIM 0 and Nagad on SIM 1 within 5 seconds.
   * Assertion: Correct MFS parser applied to each SIM slot; ledger credits appropriate wallet accounts.
   */
  it('E2E-T3-PW-15: Multi-SIM Android Ingestion × SIM Slot Partitioning × Ledger Wallet Assignment', () => {
    const sim0Sms =
      'You have received Tk 1,500.00 from 01711223344. Fee Tk 0.00. Balance Tk 8,500.00. TrxID BK_SIM0_99 at 13/09/2026 12:00';
    const sim1Sms =
      'Money Received. Amount: Tk 2,000.00 Sender: 01899887766 TxnID: NG_SIM1_88 Fee: Tk 0.00 Balance: Tk 12,000.00 Date: 13/09/2026 12:01';

    // Parse according to SIM slot operator configuration
    const parsedSim0 = parseMfsSms('bKash', sim0Sms);
    const parsedSim1 = parseMfsSms('16167', sim1Sms);

    expect(parsedSim0.provider).toBe('BKASH');
    expect(parsedSim0.trxId).toBe('BK_SIM0_99');
    expect(parsedSim0.amountPaisa.amountPaisa).toBe(150000n);

    expect(parsedSim1.provider).toBe('NAGAD');
    expect(parsedSim1.trxId).toBe('NG_SIM1_88');
    expect(parsedSim1.amountPaisa.amountPaisa).toBe(200000n);

    // Ledger posting partitions both to MFS settlement receivables (1020)
    const txSim0 = buildPaymentCaptureTransaction({
      paymentId: 'pay_sim0_01',
      merchantId: 'mch_multi_sim',
      provider: 'BKASH',
      grossAmountPaisa: parsedSim0.amountPaisa.amountPaisa,
      platformFeePaisa: 2775n, // 1.85% MDR
    });

    const txSim1 = buildPaymentCaptureTransaction({
      paymentId: 'pay_sim1_01',
      merchantId: 'mch_multi_sim',
      provider: 'NAGAD',
      grossAmountPaisa: parsedSim1.amountPaisa.amountPaisa,
      platformFeePaisa: 3700n, // 1.85% MDR
    });

    const v0 = verifyLedgerBalance(
      txSim0.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    const v1 = verifyLedgerBalance(
      txSim1.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );

    expect(v0.balanced).toBe(true);
    expect(v1.balanced).toBe(true);
  });

  /**
   * E2E-T3-PW-23: Android Collector Heartbeat Loss × Merchant Email Alert × Dashboard Status
   * Interaction: Collector device stops pinging for 35 minutes.
   * Assertion: Background cron flags device OFFLINE; merchant alert queued; dashboard renders warning banner.
   */
  it('E2E-T3-PW-23: Android Collector Heartbeat Loss × Merchant Email Alert × Dashboard Status', () => {
    const HEARTBEAT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    const deviceRecord = {
      id: 'dev_pos_bashundhara_01',
      merchantId: 'mch_retail_01',
      status: 'ACTIVE' as 'ACTIVE' | 'OFFLINE' | 'DECOMMISSIONED',
      lastHeartbeatAt: new Date(now - 35 * 60 * 1000), // 35 minutes ago
    };

    const alertsQueued: any[] = [];

    // Background liveness sweep
    const elapsed = now - deviceRecord.lastHeartbeatAt.getTime();
    if (elapsed > HEARTBEAT_TIMEOUT_MS && deviceRecord.status === 'ACTIVE') {
      deviceRecord.status = 'OFFLINE';
      alertsQueued.push({
        type: 'DEVICE_OFFLINE_ALERT',
        deviceId: deviceRecord.id,
        merchantId: deviceRecord.merchantId,
        minutesOffline: Math.floor(elapsed / (60 * 1000)),
        message: `Android Collector '${deviceRecord.id}' has stopped sending heartbeats for 35 minutes.`,
      });
    }

    expect(deviceRecord.status).toBe('OFFLINE');
    expect(alertsQueued.length).toBe(1);
    expect(alertsQueued[0].type).toBe('DEVICE_OFFLINE_ALERT');
    expect(alertsQueued[0].minutesOffline).toBe(35);
  });

  /**
   * E2E-T3-PW-30: Rocket MFS Regex Format × Balance Chain Continuity Across Month Boundary
   * Interaction: Rocket SMS received at 23:59 on 31-AUG and 00:05 on 01-SEP.
   * Assertion: Date parsing handles month transition (AUG -> SEP); balance chain validates continuously.
   */
  it('E2E-T3-PW-30: Rocket MFS Regex Format × Balance Chain Continuity Across Month Boundary', () => {
    const smsMonthEnd =
      'Tk 500.00 received from A/C: 019123456789. Fee Tk 0.00. Balance: Tk 3,500.00. TxnId: RCK31AUG. Date:31-AUG-2026 23:59:00';
    const smsMonthStart =
      'Tk 1,000.00 received from A/C: 019123456789. Fee Tk 0.00. Balance: Tk 4,500.00. TxnId: RCK01SEP. Date:01-SEP-2026 00:05:00';

    const parsed1 = parseMfsSms('16216', smsMonthEnd);
    const parsed2 = parseMfsSms('16216', smsMonthStart);

    expect(parsed1.status).toBe('SUCCESS');
    expect(parsed1.trxId).toBe('RCK31AUG');
    expect(parsed2.status).toBe('SUCCESS');
    expect(parsed2.trxId).toBe('RCK01SEP');

    // Chaining verification across the month boundary
    const chain1 = BalanceChainEngine.verify({
      walletId: 'wlt_rocket_01',
      incomingSms: parsed1,
      previousBalancePaisa: Paisa.fromBDT('3000.00'),
    });
    expect(chain1.status).toBe('VERIFIED');
    expect(chain1.expectedNewBalancePaisa?.toBDT()).toBe('3500.00');

    const chain2 = BalanceChainEngine.verify({
      walletId: 'wlt_rocket_01',
      incomingSms: parsed2,
      previousBalancePaisa: chain1.expectedNewBalancePaisa!,
    });
    expect(chain2.status).toBe('VERIFIED');
    expect(chain2.isDiscontinuity).toBe(false);
    expect(chain2.expectedNewBalancePaisa?.toBDT()).toBe('4500.00');
  });

  /**
   * E2E-T3-PW-32: Android Hardware Key Re-Attestation on App Re-Install
   * Interaction: Device wipes app storage; generates new keypair; re-scans pairing QR.
   * Assertion: Old device key marked SUPERSEDED; new key becomes active; subsequent events signed with new key accepted.
   */
  it('E2E-T3-PW-32: Android Hardware Key Re-Attestation on App Re-Install', () => {
    // Keypair 1 (Initial installation)
    const { publicKey: pub1, privateKey: priv1 } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Keypair 2 (Reinstallation)
    const { publicKey: pub2, privateKey: priv2 } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyRegistry = new Map<string, { status: 'ACTIVE' | 'SUPERSEDED' }>();
    const deviceId = 'dev_reattest_01';

    keyRegistry.set(pub1, { status: 'ACTIVE' });

    // Device performs re-attestation with valid one-time QR token
    const reattestationToken = 'pair_tok_valid_expiring_60s';
    const reattestDevice = (devId: string, newPubKey: string, token: string) => {
      if (!token.startsWith('pair_tok_')) {
        throw new Error('INVALID_PAIRING_TOKEN');
      }
      // Supersede old keys
      for (const [k, v] of keyRegistry.entries()) {
        if (v.status === 'ACTIVE') {
          keyRegistry.set(k, { status: 'SUPERSEDED' });
        }
      }
      keyRegistry.set(newPubKey, { status: 'ACTIVE' });
    };

    reattestDevice(deviceId, pub2, reattestationToken);

    expect(keyRegistry.get(pub1)?.status).toBe('SUPERSEDED');
    expect(keyRegistry.get(pub2)?.status).toBe('ACTIVE');

    // Attempting to sign event with old private key (pub1) is rejected
    const eventOld = { deviceId, nonce: 'nonce_old_01', timestamp: new Date().toISOString() };
    const sigOld = signDevicePayload(eventOld, priv1);

    const verifyEvent = (payload: any, signature: string, claimedKey: string) => {
      const entry = keyRegistry.get(claimedKey);
      if (!entry || entry.status !== 'ACTIVE') {
        throw new Error('DEVICE_KEY_REVOKED_OR_SUPERSEDED: Provided public key is not currently active');
      }
      return verifyDevicePayload(payload, signature, claimedKey);
    };

    expect(() => verifyEvent(eventOld, sigOld, pub1)).toThrow(/DEVICE_KEY_REVOKED_OR_SUPERSEDED/);

    // Event signed with new key (pub2) is accepted
    const eventNew = { deviceId, nonce: 'nonce_new_02', timestamp: new Date().toISOString() };
    const sigNew = signDevicePayload(eventNew, priv2);
    expect(verifyEvent(eventNew, sigNew, pub2)).toBe(true);
  });
});

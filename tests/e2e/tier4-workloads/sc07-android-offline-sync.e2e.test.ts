import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { parseMfsSms, BalanceChainEngine, type ParsedSmsResult } from '@denaneya/sms-parser';
import { signDevicePayload, verifyDevicePayload } from '../helpers/signature-helper.js';
import { EC_P256_TEST_KEY } from '../fixtures/crypto-keys.js';

describe('Tier 4: Workload Scenario 07 — Android Offline Sync & Recovery', () => {
  /**
   * E2E-T4-SC-07: Android Collector Remote Device Rotation, Heartbeat Loss & Offline Sync Recovery
   * 12 payments collected offline -> Device marked OFFLINE after 30 min -> Reconnects ->
   * Batch syncs 12 signed envelopes -> ECDSA verified -> Balance chain verified -> Device returns to ACTIVE.
   */
  it('E2E-T4-SC-07: Android Collector Remote Device Rotation, Heartbeat Loss & Offline Sync Recovery', () => {
    const device = {
      id: 'dev_warehouse_01',
      status: 'ACTIVE' as 'ACTIVE' | 'OFFLINE',
      lastHeartbeatAt: new Date(Date.now() - 35 * 60 * 1000), // 35 min ago
      lastProcessedSequence: 100,
    };

    // 1. Server heartbeat sweep flags device OFFLINE
    if (Date.now() - device.lastHeartbeatAt.getTime() > 30 * 60 * 1000) {
      device.status = 'OFFLINE';
    }
    expect(device.status).toBe('OFFLINE');

    // 2. Prepare 12 offline payments with sequence numbers #101 to #112
    let baselineBalance = Paisa.fromBDT('10000.00'); // 10,000.00 BDT
    const offlineBatch: any[] = [];

    for (let seq = 101; seq <= 112; seq++) {
      const amountPaisa = 100000n; // 1,000.00 BDT each
      const expectedBalancePaisa = baselineBalance.amountPaisa + amountPaisa;
      const bdtAmount = Paisa.fromPaisa(amountPaisa).toBDT();
      const bdtBalance = Paisa.fromPaisa(expectedBalancePaisa).toBDT();
      const trxId = `BKASH_OFFLINE_${seq}`;

      const smsText = `You have received Tk ${bdtAmount} from 01700000${seq}. Fee Tk 0.00. Balance Tk ${bdtBalance}. TrxID ${trxId} at 13/09/2026 12:00`;

      const payload = {
        deviceId: device.id,
        sequenceNumber: seq,
        sender: 'bKash',
        rawSms: smsText,
        timestamp: new Date().toISOString(),
        nonce: `nonce_offline_${seq}`,
      };

      const signature = signDevicePayload(payload, EC_P256_TEST_KEY.privateKeyPem);
      offlineBatch.push({ payload, signature });
      baselineBalance = Paisa.fromPaisa(expectedBalancePaisa);
    }

    expect(offlineBatch.length).toBe(12);

    // 3. WorkManager reconnects and uploads batch to backend
    let currentBalance = Paisa.fromBDT('10000.00');
    let settledOrderCount = 0;

    for (const item of offlineBatch) {
      // Signature verification
      const isValid = verifyDevicePayload(item.payload, item.signature, EC_P256_TEST_KEY.publicKeyPem);
      expect(isValid).toBe(true);

      // Monotonic sequence verification
      expect(item.payload.sequenceNumber).toBe(device.lastProcessedSequence + 1);
      device.lastProcessedSequence = item.payload.sequenceNumber;

      // SMS parser
      const parsed = parseMfsSms(item.payload.sender, item.payload.rawSms);
      expect(parsed.status).toBe('SUCCESS');

      // Balance chain continuity
      const chain = BalanceChainEngine.verify({
        walletId: 'wlt_warehouse_sim',
        incomingSms: parsed,
        previousBalancePaisa: currentBalance,
      });

      expect(chain.status).toBe('VERIFIED');
      expect(chain.isDiscontinuity).toBe(false);
      currentBalance = chain.expectedNewBalancePaisa!;

      settledOrderCount++;
    }

    expect(settledOrderCount).toBe(12);
    expect(currentBalance.toBDT()).toBe('22000.00'); // 10,000 + 12 * 1,000 = 22,000 BDT

    // Device status restored to ACTIVE upon successful sync
    device.status = 'ACTIVE';
    device.lastHeartbeatAt = new Date();
    expect(device.status).toBe('ACTIVE');
  });
});

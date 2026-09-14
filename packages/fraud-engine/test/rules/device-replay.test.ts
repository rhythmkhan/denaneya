import { describe, it, expect } from 'vitest';
import { RuleDeviceReplay } from '../../src/rules/device-replay.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleDeviceReplay', () => {
  const rule = new RuleDeviceReplay();

  it('triggers when Android device signature is invalid', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      device: {
        deviceId: 'dev_01',
        sequenceNumber: 10n,
        lastSequenceNumber: 9n,
        nonce: 'nonce_1',
        timestamp: 1726000000000n,
        serverTimestamp: 1726000001000n,
        signatureValid: false, // Invalid!
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(90);
    expect(result.reason).toContain('signature verification failed');
  });

  it('triggers when sequence number is not strictly monotonic', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      device: {
        deviceId: 'dev_01',
        sequenceNumber: 9n, // Replay: <= lastSequenceNumber
        lastSequenceNumber: 9n,
        nonce: 'nonce_2',
        timestamp: 1726000000000n,
        serverTimestamp: 1726000001000n,
        signatureValid: true,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('Non-monotonic sequence number');
  });

  it('triggers when clock drift exceeds 300 seconds (5 minutes)', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      device: {
        deviceId: 'dev_01',
        sequenceNumber: 10n,
        lastSequenceNumber: 9n,
        nonce: 'nonce_3',
        timestamp: 1000000n,
        serverTimestamp: 1000000n + 350000n, // 350 seconds skew!
        signatureValid: true,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('Clock drift exceeded limit');
  });

  it('triggers when device nonce is reused', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_04',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      device: {
        deviceId: 'dev_01',
        sequenceNumber: 10n,
        lastSequenceNumber: 9n,
        nonce: 'reused_nonce_123',
        timestamp: 1000000n,
        serverTimestamp: 1001000n,
        signatureValid: true,
      },
      dataProvider: {
        isTrxIdConsumed: async () => false,
        isSmsHashSeen: async () => false,
        isNonceSeen: async (devId, nonce) => nonce === 'reused_nonce_123',
        getIpRecentAttemptCount: async () => 0,
        getMerchantRecentTxCount: async () => 0,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('Device nonce');
  });

  it('does not trigger when all device parameters are valid', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_05',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      device: {
        deviceId: 'dev_01',
        sequenceNumber: 15n,
        lastSequenceNumber: 14n,
        nonce: 'clean_nonce_999',
        timestamp: 1726000000000n,
        serverTimestamp: 1726000002000n, // 2s drift
        signatureValid: true,
      },
      dataProvider: {
        isTrxIdConsumed: async () => false,
        isSmsHashSeen: async () => false,
        isNonceSeen: async () => false,
        getIpRecentAttemptCount: async () => 0,
        getMerchantRecentTxCount: async () => 0,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

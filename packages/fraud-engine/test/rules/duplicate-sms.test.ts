import { describe, it, expect } from 'vitest';
import { RuleDuplicateSms } from '../../src/rules/duplicate-sms.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleDuplicateSms', () => {
  const rule = new RuleDuplicateSms();

  it('triggers when SMS hash has already been seen', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Payment received',
        hash: 'hash_dup_123',
        receivedAt: new Date(),
      },
      dataProvider: {
        isTrxIdConsumed: async () => false,
        isSmsHashSeen: async (hash) => hash === 'hash_dup_123',
        isNonceSeen: async () => false,
        getIpRecentAttemptCount: async () => 0,
        getMerchantRecentTxCount: async () => 0,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(95);
    expect(result.reason).toContain('Duplicate SMS detected');
  });

  it('does not trigger on new unique SMS hash', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Payment received',
        hash: 'hash_fresh_999',
        receivedAt: new Date(),
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

  it('does not trigger when no SMS context is provided', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

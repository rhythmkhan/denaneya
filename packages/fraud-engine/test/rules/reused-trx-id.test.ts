import { describe, it, expect } from 'vitest';
import { RuleReusedTrxId } from '../../src/rules/reused-trx-id.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleReusedTrxId', () => {
  const rule = new RuleReusedTrxId();

  it('triggers instant block when TrxID is flagged as reused in metadata', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
        provider: 'BKASH',
        providerTrxId: 'TRX12345',
        metadata: { isTrxIdReused: true },
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.instantBlock).toBe(true);
    expect(result.weight).toBe(100);
    expect(result.reason).toContain('has already been consumed');
  });

  it('triggers when dataProvider returns isTrxIdConsumed = true', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
        provider: 'NAGAD',
        providerTrxId: 'NGD9999',
      },
      dataProvider: {
        isTrxIdConsumed: async () => true,
        isSmsHashSeen: async () => false,
        isNonceSeen: async () => false,
        getIpRecentAttemptCount: async () => 0,
        getMerchantRecentTxCount: async () => 0,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.instantBlock).toBe(true);
  });

  it('does not trigger on new unique TrxID', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
        provider: 'BKASH',
        providerTrxId: 'NEW_TRX_999',
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

  it('does not trigger when no TrxID is present', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_04',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

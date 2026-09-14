import { describe, it, expect } from 'vitest';
import { RuleBalanceChainDiscontinuity } from '../../src/rules/balance-chain-discontinuity.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleBalanceChainDiscontinuity', () => {
  const rule = new RuleBalanceChainDiscontinuity();

  it('triggers when reported rolling balance does not match previous + received - fee', () => {
    // Previous: 10,000, Received: 5,000, Fee: 0 -> Expected: 15,000, Reported: 12,000 (discontinuity!)
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 500000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Payment received',
        hash: 'h_1',
        previousBalancePaisa: 1000000n,
        amountPaisa: 500000n,
        feePaisa: 0n,
        rollingBalancePaisa: 1200000n, // Discontinuity!
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(80);
    expect(result.reason).toContain('Balance-chain break');
  });

  it('does not trigger when balance chain continuity holds', () => {
    // Previous: 10,000, Received: 5,000, Fee: 100 -> Expected: 14,900, Reported: 14,900
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 500000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Payment received',
        hash: 'h_2',
        previousBalancePaisa: 1000000n,
        amountPaisa: 500000n,
        feePaisa: 10000n,
        rollingBalancePaisa: 1490000n,
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

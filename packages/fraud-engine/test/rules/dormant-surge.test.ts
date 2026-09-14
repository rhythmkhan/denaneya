import { describe, it, expect } from 'vitest';
import { RuleDormantSurge } from '../../src/rules/dormant-surge.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleDormantSurge', () => {
  const rule = new RuleDormantSurge();

  it('triggers when merchant has been inactive for >= 30 days and suddenly processes transactions', () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_dormant_01',
        amountPaisa: 100000n,
        currency: 'BDT',
      },
      merchantHistory: {
        lastActiveAt: fortyDaysAgo,
        recentTxCount1h: 5,
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(45);
    expect(result.reason).toContain('Dormant merchant account');
  });

  it('does not trigger for actively trading merchant', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_active_01',
        amountPaisa: 100000n,
        currency: 'BDT',
      },
      merchantHistory: {
        lastActiveAt: twoDaysAgo,
        recentTxCount1h: 5,
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

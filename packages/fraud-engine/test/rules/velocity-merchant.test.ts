import { describe, it, expect } from 'vitest';
import { RuleVelocityMerchant } from '../../src/rules/velocity-merchant.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleVelocityMerchant', () => {
  const rule = new RuleVelocityMerchant();

  it('triggers when merchant volume surges (> 300% of baseline and > 20 tx/hr)', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_surge_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      merchantHistory: {
        baselineTxCount1h: 10,
        recentTxCount1h: 35, // 35 > max(10 * 3, 20) = 30
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(50);
    expect(result.reason).toContain('transaction volume surged to 35 tx/hr');
  });

  it('does not trigger when recent volume is within surge threshold', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_normal_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      merchantHistory: {
        baselineTxCount1h: 10,
        recentTxCount1h: 15,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

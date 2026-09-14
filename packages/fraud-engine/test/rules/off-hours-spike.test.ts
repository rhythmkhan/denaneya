import { describe, it, expect } from 'vitest';
import { RuleOffHoursSpike } from '../../src/rules/off-hours-spike.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleOffHoursSpike', () => {
  const rule = new RuleOffHoursSpike();

  it('triggers when transaction occurs during 02:00 to 05:00 BST (21:00 to 23:00 UTC)', () => {
    // 21:30 UTC = 03:30 BST (middle of off-hours)
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
        createdAt: new Date('2026-09-13T21:30:00Z'),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(25);
    expect(result.reason).toContain('unusual off-hours');
  });

  it('does not trigger during daytime business hours (e.g. 14:00 BST / 08:00 UTC)', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
        createdAt: new Date('2026-09-13T08:00:00Z'), // 14:00 BST
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

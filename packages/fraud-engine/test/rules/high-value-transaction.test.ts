import { describe, it, expect } from 'vitest';
import { RuleHighValueTransaction } from '../../src/rules/high-value-transaction.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleHighValueTransaction', () => {
  const rule = new RuleHighValueTransaction();

  it('triggers when payment amount exceeds 50,000 BDT (5,000,000 paisa)', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 5000001n, // 50,000.01 BDT
        currency: 'BDT',
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(40);
    expect(result.reason).toContain('exceeds high-value threshold');
  });

  it('triggers when payment exceeds 5x merchant 30-day average', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 2000000n, // 20,000 BDT
        currency: 'BDT',
      },
      merchantHistory: {
        averageTxAmountPaisa: 300000n, // 3,000 BDT (20,000 > 5 * 3,000 = 15,000)
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('greater than 5x merchant average');
  });

  it('does not trigger for normal transaction amount', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 50000n, // 500 BDT
        currency: 'BDT',
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

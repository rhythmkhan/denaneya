import { describe, it, expect } from 'vitest';
import { RuleAmountMismatch } from '../../src/rules/amount-mismatch.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleAmountMismatch', () => {
  const rule = new RuleAmountMismatch();

  it('triggers when expected amount does not match SMS amount', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 100000n, // 1,000 BDT
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Received Tk 500.00',
        amountPaisa: 50000n, // 500 BDT (mismatch!)
        hash: 'h_1',
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(85);
    expect(result.reason).toContain('Amount mismatch');
  });

  it('does not trigger when amounts match exactly', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 100000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Received Tk 1,000.00',
        amountPaisa: 100000n,
        hash: 'h_2',
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });

  it('does not trigger when actual captured amount is undefined', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 100000n,
        currency: 'BDT',
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

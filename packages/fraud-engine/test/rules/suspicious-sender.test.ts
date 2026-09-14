import { describe, it, expect } from 'vitest';
import { RuleSuspiciousSender } from '../../src/rules/suspicious-sender.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleSuspiciousSender', () => {
  const rule = new RuleSuspiciousSender();

  it('triggers when SMS sender is a customer personal MSISDN instead of provider mask', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: '01712345678', // Personal number spoofing bKash!
        text: 'You have received Tk 500.00',
        hash: 'h_spoof',
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(75);
    expect(result.reason).toContain('unauthorized sender');
  });

  it('does not trigger for official whitelisted sender masks', () => {
    const validSenders: Array<[string, string]> = [
      ['BKASH', 'bKash'],
      ['BKASH', '16247'],
      ['NAGAD', 'NAGAD'],
      ['NAGAD', '16167'],
      ['ROCKET', '16216'],
      ['ROCKET', 'DBBL'],
      ['UPAY', '16268'],
    ];

    for (const [provider, sender] of validSenders) {
      const context: FraudRuleContext = {
        payment: {
          id: 'pay_02',
          merchantId: 'mer_01',
          amountPaisa: 50000n,
          currency: 'BDT',
        },
        sms: {
          provider,
          sender,
          text: 'Payment received',
          hash: 'h_valid',
          receivedAt: new Date(),
        },
      };

      const result = rule.evaluate(context);
      expect(result.triggered).toBe(false);
    }
  });

  it('triggers for unrecognized sender string', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      sms: {
        provider: 'BKASH',
        sender: 'SCAM_SENDER',
        text: 'Fake bKash',
        hash: 'h_scam',
        receivedAt: new Date(),
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
  });
});

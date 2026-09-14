import { describe, it, expect } from 'vitest';
import { RuleVelocityIp } from '../../src/rules/velocity-ip.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleVelocityIp', () => {
  const rule = new RuleVelocityIp(5);

  it('triggers when IP recent attempts exceed threshold (> 5/hr)', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
        customerIp: '192.168.1.100',
      },
      ipContext: {
        ip: '192.168.1.100',
        recentAttempts1h: 6, // Exceeds threshold of 5
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(50);
    expect(result.reason).toContain('recorded 6 attempts');
  });

  it('does not trigger when IP attempts are within threshold (<= 5/hr)', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
        customerIp: '192.168.1.100',
      },
      ipContext: {
        ip: '192.168.1.100',
        recentAttempts1h: 4,
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });

  it('does not trigger when customer IP is missing', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 10000n,
        currency: 'BDT',
      },
    };

    const result = await rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

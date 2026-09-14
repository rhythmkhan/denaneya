import { describe, it, expect } from 'vitest';
import { RuleIpCountryMismatch } from '../../src/rules/ip-country-mismatch.js';
import type { FraudRuleContext } from '../../src/types.js';

describe('RuleIpCountryMismatch', () => {
  const rule = new RuleIpCountryMismatch();

  it('triggers when IP country is outside Bangladesh (countryCode !== "BD")', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      ipContext: {
        ip: '45.33.32.156',
        countryCode: 'US', // United States
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.weight).toBe(35);
    expect(result.reason).toContain('foreign IP country');
  });

  it('triggers when IP is detected as Tor exit node or proxy', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_02',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      ipContext: {
        ip: '185.220.101.5',
        countryCode: 'BD',
        isTor: true,
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('anonymizing proxy');
  });

  it('does not trigger for legitimate Bangladesh domestic IP', () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_03',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
      },
      ipContext: {
        ip: '103.100.100.1',
        countryCode: 'BD',
        isTor: false,
        isVpnOrProxy: false,
        isDatacenter: false,
      },
    };

    const result = rule.evaluate(context);
    expect(result.triggered).toBe(false);
  });
});

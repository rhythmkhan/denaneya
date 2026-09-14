import { describe, it, expect } from 'vitest';
import { FraudEvaluator } from '../src/evaluator.js';
import type { FraudRuleContext } from '../src/types.js';

describe('FraudEvaluator', () => {
  const evaluator = new FraudEvaluator();

  it('evaluates clean payment with LOW risk and ALLOW action', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_clean_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n, // 500 BDT
        currency: 'BDT',
        provider: 'BKASH',
        providerTrxId: '9K76TRX01',
        customerPhone: '01712345678',
        customerIp: '103.100.100.1',
        createdAt: new Date('2026-09-13T10:00:00Z'), // 16:00 BST
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Payment received',
        amountPaisa: 50000n,
        trxId: '9K76TRX01',
        hash: 'hash_clean_01',
        rollingBalancePaisa: 150000n,
        previousBalancePaisa: 100000n,
        feePaisa: 0n,
        receivedAt: new Date(),
      },
      ipContext: {
        ip: '103.100.100.1',
        countryCode: 'BD',
        isTor: false,
        isVpnOrProxy: false,
        recentAttempts1h: 1,
      },
      merchantHistory: {
        isDormant: false,
        recentTxCount1h: 5,
        baselineTxCount1h: 10,
        averageTxAmountPaisa: 50000n,
      },
    };

    const result = await evaluator.evaluate(context);
    expect(result.riskScore).toBe(0);
    expect(result.classification).toBe('LOW');
    expect(result.actionTaken).toBe('ALLOW');
    expect(result.triggeredRules).toHaveLength(0);
  });

  it('triggers instant block on reused TrxID with score 100 and BLOCK action', async () => {
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_reused_01',
        merchantId: 'mer_01',
        amountPaisa: 50000n,
        currency: 'BDT',
        provider: 'BKASH',
        providerTrxId: '9K76TRX01',
        metadata: { isTrxIdReused: true },
      },
    };

    const result = await evaluator.evaluate(context);
    expect(result.riskScore).toBe(100);
    expect(result.classification).toBe('CRITICAL');
    expect(result.actionTaken).toBe('BLOCK');
    expect(result.triggeredRules.some((r) => r.ruleId === 'RULE_REUSED_TRX_ID')).toBe(true);
  });

  it('caps accumulated scores at 100', async () => {
    // Duplicate SMS (95) + Amount Mismatch (85) = 180 -> capped at 100
    const context: FraudRuleContext = {
      payment: {
        id: 'pay_multi_01',
        merchantId: 'mer_01',
        amountPaisa: 100000n,
        currency: 'BDT',
        metadata: { isDuplicateSms: true },
      },
      sms: {
        provider: 'BKASH',
        sender: 'bKash',
        text: 'Text',
        amountPaisa: 50000n, // Mismatch!
        hash: 'dup_hash',
        receivedAt: new Date(),
      },
    };

    const result = await evaluator.evaluate(context);
    expect(result.riskScore).toBe(100);
    expect(result.classification).toBe('CRITICAL');
    expect(result.actionTaken).toBe('BLOCK');
  });

  it('classifies thresholds accurately: LOW(0-29), MEDIUM(30-59), HIGH(60-84), CRITICAL(85-100)', () => {
    expect(FraudEvaluator.classifyScore(0)).toEqual({ classification: 'LOW', action: 'ALLOW' });
    expect(FraudEvaluator.classifyScore(29)).toEqual({ classification: 'LOW', action: 'ALLOW' });
    expect(FraudEvaluator.classifyScore(30)).toEqual({ classification: 'MEDIUM', action: 'CHALLENGE' });
    expect(FraudEvaluator.classifyScore(59)).toEqual({ classification: 'MEDIUM', action: 'CHALLENGE' });
    expect(FraudEvaluator.classifyScore(60)).toEqual({ classification: 'HIGH', action: 'UNDER_REVIEW' });
    expect(FraudEvaluator.classifyScore(84)).toEqual({ classification: 'HIGH', action: 'UNDER_REVIEW' });
    expect(FraudEvaluator.classifyScore(85)).toEqual({ classification: 'CRITICAL', action: 'BLOCK' });
    expect(FraudEvaluator.classifyScore(100)).toEqual({ classification: 'CRITICAL', action: 'BLOCK' });

    expect(() => FraudEvaluator.classifyScore(-1)).toThrow(RangeError);
    expect(() => FraudEvaluator.classifyScore(101)).toThrow(RangeError);
  });
});

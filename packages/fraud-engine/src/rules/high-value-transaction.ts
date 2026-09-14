import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleHighValueTransaction implements FraudRule {
  readonly id = 'RULE_HIGH_VALUE_TRANSACTION';
  readonly name = 'High Value Transaction Anomaly';
  readonly weight = 40;
  readonly defaultCeilingPaisa = 5_000_000n; // 50,000 BDT in paisa

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const amount = context.payment.amountPaisa;
    const threshold =
      context.merchantHistory?.highValueThresholdPaisa ?? this.defaultCeilingPaisa;
    const avg = context.merchantHistory?.averageTxAmountPaisa;

    // Trigger if exceeding absolute ceiling
    if (amount > threshold) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Transaction amount ${amount} paisa exceeds high-value threshold ${threshold} paisa.`,
        metadata: { amountPaisa: amount.toString(), thresholdPaisa: threshold.toString() },
      };
    }

    // Trigger if exceeding 5x rolling average (minimum 1,000,000 paisa / 10,000 BDT)
    if (avg !== undefined && avg > 0n && amount >= 1_000_000n && amount > avg * 5n) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Transaction amount ${amount} paisa is greater than 5x merchant average (${avg} paisa).`,
        metadata: { amountPaisa: amount.toString(), averagePaisa: avg.toString() },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Transaction amount is within normal parameters.',
    };
  }
}

import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleOffHoursSpike implements FraudRule {
  readonly id = 'RULE_OFF_HOURS_SPIKE';
  readonly name = 'Off-Hours Anomaly';
  readonly weight = 25;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const timestamp = context.payment.createdAt ?? new Date();

    // Bangladesh Standard Time is UTC+6
    const utcHours = timestamp.getUTCHours();
    const bstHours = (utcHours + 6) % 24;

    // Off-hours defined as 02:00 to 05:00 BST (local hours 2, 3, 4)
    const isOffHours = bstHours >= 2 && bstHours < 5;

    if (isOffHours) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Transaction occurred during unusual off-hours (${bstHours.toString().padStart(2, '0')}:00 BST).`,
        metadata: { bstHours, utcHours, timestamp: timestamp.toISOString() },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Transaction occurred during normal operational hours.',
    };
  }
}

import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleAmountMismatch implements FraudRule {
  readonly id = 'RULE_AMOUNT_MISMATCH';
  readonly name = 'Payment Amount Mismatch';
  readonly weight = 85;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const expectedPaisa = context.payment.amountPaisa;
    const actualPaisa =
      context.sms?.amountPaisa ??
      (context.payment.metadata?.actualAmountPaisa as bigint | undefined);

    if (actualPaisa === undefined) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'Actual captured amount not available for comparison.',
      };
    }

    if (expectedPaisa !== actualPaisa) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Amount mismatch: Expected ${expectedPaisa} paisa, but captured ${actualPaisa} paisa.`,
        metadata: {
          expectedPaisa: expectedPaisa.toString(),
          actualPaisa: actualPaisa.toString(),
          differencePaisa: (expectedPaisa - actualPaisa).toString(),
        },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Captured amount matches expected amount exactly.',
    };
  }
}

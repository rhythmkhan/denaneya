import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleDormantSurge implements FraudRule {
  readonly id = 'RULE_DORMANT_SURGE';
  readonly name = 'Dormant Account Sudden Surge';
  readonly weight = 45;
  readonly dormantDaysThreshold = 30;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const history = context.merchantHistory;
    if (!history) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No merchant history context provided.',
      };
    }

    let isDormant = history.isDormant ?? false;

    if (!isDormant && history.lastActiveAt) {
      const now = (context.payment.createdAt ?? new Date()).getTime();
      const lastActive = history.lastActiveAt.getTime();
      const diffDays = (now - lastActive) / (1000 * 60 * 60 * 24);
      if (diffDays >= this.dormantDaysThreshold) {
        isDormant = true;
      }
    }

    if (isDormant) {
      const recentTx = history.recentTxCount1h ?? 1;
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Dormant merchant account (inactive >= 30 days) suddenly processed activity.`,
        metadata: {
          isDormant,
          lastActiveAt: history.lastActiveAt?.toISOString(),
          recentTxCount1h: recentTx,
        },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Merchant account is active with regular activity history.',
    };
  }
}

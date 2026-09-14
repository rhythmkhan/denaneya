import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleVelocityMerchant implements FraudRule {
  readonly id = 'RULE_VELOCITY_MERCHANT';
  readonly name = 'Merchant Volume Velocity Surge';
  readonly weight = 50;

  async evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> {
    const merchantId = context.payment.merchantId;
    let recentTx = context.merchantHistory?.recentTxCount1h;
    const baseline = context.merchantHistory?.baselineTxCount1h ?? 10;

    if (recentTx === undefined && context.dataProvider) {
      recentTx = await context.dataProvider.getMerchantRecentTxCount(merchantId, 60 * 60 * 1000);
    }

    if (recentTx !== undefined) {
      // Trigger if recent transactions exceed 300% of baseline AND minimum 20 transactions
      const surgeThreshold = Math.max(baseline * 3, 20);
      if (recentTx > surgeThreshold) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          weight: this.weight,
          reason: `Merchant ${merchantId} transaction volume surged to ${recentTx} tx/hr (baseline: ${baseline}, threshold: ${surgeThreshold}).`,
          metadata: { merchantId, recentTx, baseline, surgeThreshold },
        };
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Merchant transaction velocity is normal.',
    };
  }
}

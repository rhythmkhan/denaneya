import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleVelocityIp implements FraudRule {
  readonly id = 'RULE_VELOCITY_IP';
  readonly name = 'IP Address Velocity Exceeded';
  readonly weight = 50;
  readonly threshold1h: number;

  constructor(threshold1h = 5) {
    this.threshold1h = threshold1h;
  }

  async evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> {
    const ip = context.payment.customerIp || context.ipContext?.ip;
    if (!ip) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No customer IP address present.',
      };
    }

    let attempts = context.ipContext?.recentAttempts1h;
    if (attempts === undefined && context.dataProvider) {
      attempts = await context.dataProvider.getIpRecentAttemptCount(ip, 60 * 60 * 1000);
    }

    if (attempts !== undefined && attempts > this.threshold1h) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `IP address ${ip} recorded ${attempts} attempts in 1 hour (limit: ${this.threshold1h}).`,
        metadata: { ip, attempts, threshold: this.threshold1h },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'IP velocity is within acceptable limits.',
    };
  }
}

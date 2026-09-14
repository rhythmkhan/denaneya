import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleDuplicateSms implements FraudRule {
  readonly id = 'RULE_DUPLICATE_SMS';
  readonly name = 'Duplicate SMS Hash or Payload';
  readonly weight = 95;

  async evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> {
    if (!context.sms) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No SMS context provided.',
      };
    }

    let isDuplicate = false;
    if (context.dataProvider && context.sms.hash) {
      isDuplicate = await context.dataProvider.isSmsHashSeen(context.sms.hash);
    } else if (context.sms.hash && context.payment.metadata?.isDuplicateSms === true) {
      isDuplicate = true;
    }

    if (isDuplicate) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Duplicate SMS detected with cryptographic hash '${context.sms.hash}'.`,
        metadata: { hash: context.sms.hash, provider: context.sms.provider },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'SMS hash is unique.',
    };
  }
}

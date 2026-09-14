import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

const WHITELISTED_SENDERS: Record<string, string[]> = {
  BKASH: ['BKASH', '16247'],
  NAGAD: ['NAGAD', '16167'],
  ROCKET: ['ROCKET', '16216', 'DBBL'],
  UPAY: ['UPAY', '16268'],
};

export class RuleSuspiciousSender implements FraudRule {
  readonly id = 'RULE_SUSPICIOUS_SENDER';
  readonly name = 'Suspicious SMS Sender Mask';
  readonly weight = 75;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    if (!context.sms) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No SMS context provided.',
      };
    }

    const providerKey = context.sms.provider.toUpperCase();
    const allowed = WHITELISTED_SENDERS[providerKey];
    const normalizedSender = context.sms.sender.trim().toUpperCase();

    // Check if sender is a personal MSISDN (e.g. starts with +8801 or 01)
    const isPersonalNumber = /^(?:\+?88)?01[3-9]\d{8}$/.test(context.sms.sender.trim());

    if (!allowed || !allowed.includes(normalizedSender) || isPersonalNumber) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `SMS claims to be from '${context.sms.provider}' but originates from unauthorized sender '${context.sms.sender}'.`,
        metadata: {
          claimedProvider: context.sms.provider,
          actualSender: context.sms.sender,
          isPersonalNumber,
        },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'SMS sender is an authenticated official MFS mask/shortcode.',
    };
  }
}

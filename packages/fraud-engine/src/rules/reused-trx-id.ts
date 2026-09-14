import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleReusedTrxId implements FraudRule {
  readonly id = 'RULE_REUSED_TRX_ID';
  readonly name = 'Reused Provider Transaction ID';
  readonly weight = 100;
  readonly instantBlock = true;

  async evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> {
    const trxId = context.payment.providerTrxId || context.sms?.trxId;
    const provider = context.payment.provider || context.sms?.provider;

    if (!trxId || !provider) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        instantBlock: this.instantBlock,
        reason: 'No provider transaction ID present to evaluate.',
      };
    }

    const normalizedTrxId = trxId.trim().toUpperCase();

    // Check data provider if available
    let isReused = false;
    if (context.dataProvider) {
      isReused = await context.dataProvider.isTrxIdConsumed(
        provider,
        normalizedTrxId,
        context.payment.id
      );
    } else if (context.payment.metadata?.isTrxIdReused === true) {
      isReused = true;
    }

    if (isReused) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        instantBlock: this.instantBlock,
        reason: `Provider transaction ID '${normalizedTrxId}' for provider '${provider}' has already been consumed by another payment.`,
        metadata: { provider, trxId: normalizedTrxId },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      instantBlock: this.instantBlock,
      reason: 'Transaction ID is unique.',
    };
  }
}

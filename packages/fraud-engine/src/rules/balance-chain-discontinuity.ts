import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleBalanceChainDiscontinuity implements FraudRule {
  readonly id = 'RULE_BALANCE_CHAIN_DISCONTINUITY';
  readonly name = 'SIM Wallet Balance Chain Discontinuity';
  readonly weight = 80;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const sms = context.sms;
    if (
      !sms ||
      sms.previousBalancePaisa === undefined ||
      sms.rollingBalancePaisa === undefined ||
      sms.amountPaisa === undefined
    ) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'Insufficient balance chain data (initial transaction or missing rolling balance).',
      };
    }

    const fee = sms.feePaisa ?? 0n;
    const expectedBalance = sms.previousBalancePaisa + sms.amountPaisa - fee;

    if (sms.rollingBalancePaisa !== expectedBalance) {
      const delta = sms.rollingBalancePaisa - expectedBalance;
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Balance-chain break: Expected balance ${expectedBalance} paisa, but reported balance is ${sms.rollingBalancePaisa} paisa (discontinuity delta: ${delta} paisa).`,
        metadata: {
          previousBalancePaisa: sms.previousBalancePaisa.toString(),
          receivedAmountPaisa: sms.amountPaisa.toString(),
          feePaisa: fee.toString(),
          expectedBalancePaisa: expectedBalance.toString(),
          reportedBalancePaisa: sms.rollingBalancePaisa.toString(),
          deltaPaisa: delta.toString(),
        },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Balance chain continuity verified.',
    };
  }
}

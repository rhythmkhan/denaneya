import type { FraudRuleContext, RuleEvaluationResult, FraudRuleId } from '../types.js';

export interface FraudRule {
  readonly id: FraudRuleId;
  readonly name: string;
  readonly weight: number;
  readonly instantBlock?: boolean;
  evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> | RuleEvaluationResult;
}

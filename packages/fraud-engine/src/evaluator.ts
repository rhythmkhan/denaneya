import type {
  FraudRuleContext,
  FraudEvaluationOutput,
  RiskClassification,
  RiskAction,
} from './types.js';
import type { FraudRule } from './rules/base.js';
import { createDefaultRules } from './rules/index.js';

export interface EvaluatorOptions {
  rules?: FraudRule[];
}

export class FraudEvaluator {
  private readonly rules: FraudRule[];

  constructor(options: EvaluatorOptions = {}) {
    this.rules = options.rules ?? createDefaultRules();
  }

  static classifyScore(score: number): {
    classification: RiskClassification;
    action: RiskAction;
  } {
    if (score < 0 || score > 100) {
      throw new RangeError(`Risk score must be between 0 and 100, received ${score}`);
    }

    if (score <= 29) {
      return { classification: 'LOW', action: 'ALLOW' };
    }
    if (score <= 59) {
      return { classification: 'MEDIUM', action: 'CHALLENGE' };
    }
    if (score <= 84) {
      return { classification: 'HIGH', action: 'UNDER_REVIEW' };
    }
    return { classification: 'CRITICAL', action: 'BLOCK' };
  }

  async evaluate(context: FraudRuleContext): Promise<FraudEvaluationOutput> {
    const results = await Promise.all(this.rules.map((rule) => rule.evaluate(context)));

    const triggeredRules = results.filter((r) => r.triggered);
    const hasInstantBlock = triggeredRules.some((r) => r.instantBlock);

    let riskScore: number;
    let classification: RiskClassification;
    let actionTaken: RiskAction;

    if (hasInstantBlock) {
      riskScore = 100;
      classification = 'CRITICAL';
      actionTaken = 'BLOCK';
    } else {
      const rawScore = triggeredRules.reduce((sum, r) => sum + r.weight, 0);
      riskScore = Math.min(100, Math.max(0, rawScore));
      const mapped = FraudEvaluator.classifyScore(riskScore);
      classification = mapped.classification;
      actionTaken = mapped.action;
    }

    return {
      paymentId: context.payment.id,
      merchantId: context.payment.merchantId,
      riskScore,
      classification,
      actionTaken,
      triggeredRules: triggeredRules.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        weight: r.weight,
        reason: r.reason,
        instantBlock: r.instantBlock,
        metadata: r.metadata,
      })),
      evaluatedAt: new Date(),
    };
  }
}

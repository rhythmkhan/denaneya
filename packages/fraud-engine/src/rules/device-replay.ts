import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleDeviceReplay implements FraudRule {
  readonly id = 'RULE_DEVICE_REPLAY';
  readonly name = 'Device Event Replay or Tamper';
  readonly weight = 90;
  readonly maxClockSkewMs = 300_000; // ±5 minutes (300 seconds)

  async evaluate(context: FraudRuleContext): Promise<RuleEvaluationResult> {
    const dev = context.device;
    if (!dev) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No hardware collector device context provided.',
      };
    }

    // 1. Signature check
    if (dev.signatureValid === false) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Android collector signature verification failed for device ${dev.deviceId}.`,
        metadata: { deviceId: dev.deviceId, failure: 'INVALID_SIGNATURE' },
      };
    }

    // 2. Monotonic sequence check
    if (dev.lastSequenceNumber !== undefined && dev.sequenceNumber <= dev.lastSequenceNumber) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Non-monotonic sequence number detected (received: ${dev.sequenceNumber}, last seen: ${dev.lastSequenceNumber}). Potential replay attack.`,
        metadata: {
          deviceId: dev.deviceId,
          sequenceNumber: dev.sequenceNumber.toString(),
          lastSequenceNumber: dev.lastSequenceNumber.toString(),
        },
      };
    }

    // 3. Clock drift check
    const timeDelta = Math.abs(Number(dev.serverTimestamp - dev.timestamp));
    if (timeDelta > this.maxClockSkewMs) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Clock drift exceeded limit: ${timeDelta}ms (max allowed: ${this.maxClockSkewMs}ms).`,
        metadata: { deviceId: dev.deviceId, timeDeltaMs: timeDelta },
      };
    }

    // 4. Nonce reuse check
    let nonceSeen = false;
    if (context.dataProvider) {
      nonceSeen = await context.dataProvider.isNonceSeen(dev.deviceId, dev.nonce);
    } else if (context.payment.metadata?.isNonceReused === true) {
      nonceSeen = true;
    }

    if (nonceSeen) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Device nonce '${dev.nonce}' has already been processed. Replay attack blocked.`,
        metadata: { deviceId: dev.deviceId, nonce: dev.nonce },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'Device signature, sequence number, timestamp, and nonce are verified.',
    };
  }
}

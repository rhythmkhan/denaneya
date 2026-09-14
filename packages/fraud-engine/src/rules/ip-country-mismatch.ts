import type { FraudRule } from './base.js';
import type { FraudRuleContext, RuleEvaluationResult } from '../types.js';

export class RuleIpCountryMismatch implements FraudRule {
  readonly id = 'RULE_IP_COUNTRY_MISMATCH';
  readonly name = 'IP Country Mismatch or Proxy';
  readonly weight = 35;

  evaluate(context: FraudRuleContext): RuleEvaluationResult {
    const ipCtx = context.ipContext;
    if (!ipCtx) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: false,
        weight: this.weight,
        reason: 'No IP geolocation or proxy context provided.',
      };
    }

    // Flag Tor exit nodes, VPNs, or datacenter proxies
    if (ipCtx.isTor || ipCtx.isVpnOrProxy || ipCtx.isDatacenter) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Request IP ${ipCtx.ip} detected as an anonymizing proxy, Tor exit node, or datacenter.`,
        metadata: {
          ip: ipCtx.ip,
          isTor: ipCtx.isTor,
          isVpnOrProxy: ipCtx.isVpnOrProxy,
          isDatacenter: ipCtx.isDatacenter,
        },
      };
    }

    // Flag non-domestic IP for domestic MFS checkout
    if (ipCtx.countryCode && ipCtx.countryCode.toUpperCase() !== 'BD') {
      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        weight: this.weight,
        reason: `Domestic payment initiated from foreign IP country '${ipCtx.countryCode}'. Expected 'BD'.`,
        metadata: { ip: ipCtx.ip, countryCode: ipCtx.countryCode },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      triggered: false,
      weight: this.weight,
      reason: 'IP originates from verified Bangladesh domestic network.',
    };
  }
}

export * from './base.js';
export * from './reused-trx-id.js';
export * from './duplicate-sms.js';
export * from './amount-mismatch.js';
export * from './suspicious-sender.js';
export * from './velocity-ip.js';
export * from './velocity-merchant.js';
export * from './device-replay.js';
export * from './balance-chain-discontinuity.js';
export * from './high-value-transaction.js';
export * from './off-hours-spike.js';
export * from './ip-country-mismatch.js';
export * from './dormant-surge.js';

import type { FraudRule } from './base.js';
import { RuleReusedTrxId } from './reused-trx-id.js';
import { RuleDuplicateSms } from './duplicate-sms.js';
import { RuleAmountMismatch } from './amount-mismatch.js';
import { RuleSuspiciousSender } from './suspicious-sender.js';
import { RuleVelocityIp } from './velocity-ip.js';
import { RuleVelocityMerchant } from './velocity-merchant.js';
import { RuleDeviceReplay } from './device-replay.js';
import { RuleBalanceChainDiscontinuity } from './balance-chain-discontinuity.js';
import { RuleHighValueTransaction } from './high-value-transaction.js';
import { RuleOffHoursSpike } from './off-hours-spike.js';
import { RuleIpCountryMismatch } from './ip-country-mismatch.js';
import { RuleDormantSurge } from './dormant-surge.js';

export function createDefaultRules(): FraudRule[] {
  return [
    new RuleReusedTrxId(),
    new RuleDuplicateSms(),
    new RuleAmountMismatch(),
    new RuleSuspiciousSender(),
    new RuleVelocityIp(),
    new RuleVelocityMerchant(),
    new RuleDeviceReplay(),
    new RuleBalanceChainDiscontinuity(),
    new RuleHighValueTransaction(),
    new RuleOffHoursSpike(),
    new RuleIpCountryMismatch(),
    new RuleDormantSurge(),
  ];
}

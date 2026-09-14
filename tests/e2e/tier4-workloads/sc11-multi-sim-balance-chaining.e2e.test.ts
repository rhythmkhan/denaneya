import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { BalanceChainEngine, type ParsedSmsResult } from '@denaneya/sms-parser';

describe('Tier 4: Workload Scenario 11 — Multi-Operator MFS Balance Chaining (1,000 Transactions)', () => {
  /**
   * E2E-T4-SC-11: Multi-Operator MFS Balance Chaining Across 1,000 Consecutive Transactions
   * 1,000 transactions across 4 operators: bKash (400), Nagad (300), Rocket (200), Upay (100) ->
   * At #742 simulated 500 BDT jump -> Discontinuity flagged -> Subsequent continuity maintained.
   */
  it('E2E-T4-SC-11: Multi-Operator MFS Balance Chaining Across 1,000 Consecutive Transactions', () => {
    const SIM_CONFIGS = {
      BKASH: { count: 400, startingBalancePaisa: 5000000n, walletId: 'wlt_sim_bkash' },
      NAGAD: { count: 300, startingBalancePaisa: 3000000n, walletId: 'wlt_sim_nagad' },
      ROCKET: { count: 200, startingBalancePaisa: 2000000n, walletId: 'wlt_sim_rocket' },
      UPAY: { count: 100, startingBalancePaisa: 1000000n, walletId: 'wlt_sim_upay' },
    };

    // Track running balance per provider
    const runningBalances: Record<string, Paisa> = {
      BKASH: Paisa.fromPaisa(SIM_CONFIGS.BKASH.startingBalancePaisa),
      NAGAD: Paisa.fromPaisa(SIM_CONFIGS.NAGAD.startingBalancePaisa),
      ROCKET: Paisa.fromPaisa(SIM_CONFIGS.ROCKET.startingBalancePaisa),
      UPAY: Paisa.fromPaisa(SIM_CONFIGS.UPAY.startingBalancePaisa),
    };

    let totalProcessed = 0;
    let discontinuityDetectedAt: number | null = null;

    // Execute 1,000 sequential transactions
    for (let globalTx = 1; globalTx <= 1000; globalTx++) {
      totalProcessed++;
      let provider: 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY';

      if (globalTx <= 400) provider = 'BKASH';
      else if (globalTx <= 700) provider = 'NAGAD';
      else if (globalTx <= 900) provider = 'ROCKET';
      else provider = 'UPAY';

      const prevBal = runningBalances[provider]!;
      const amountPaisa = 10000n; // 100.00 BDT per payment
      let reportedBalancePaisa = prevBal.amountPaisa + amountPaisa;

      // Inject intentional discontinuity at transaction #742 (Nagad)
      if (globalTx === 742) {
        reportedBalancePaisa += 50000n; // 500.00 BDT gap
      }

      const mockSms: ParsedSmsResult = {
        provider,
        type: 'PAYMENT_RECEIVED',
        trxId: `TRX_MFS_${globalTx}`,
        amountPaisa: Paisa.fromPaisa(amountPaisa),
        feePaisa: Paisa.zero(),
        counterparty: '01700000000',
        balancePaisa: Paisa.fromPaisa(reportedBalancePaisa),
        reference: null,
        timestamp: new Date(),
        rawSms: '',
        smsHash: `hash_${globalTx}`,
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS',
        isSenderVerified: true,
      };

      const result = BalanceChainEngine.verify({
        walletId: `wlt_${provider.toLowerCase()}`,
        incomingSms: mockSms,
        previousBalancePaisa: prevBal,
      });

      if (globalTx === 742) {
        expect(result.status).toBe('DISCONTINUITY_DETECTED');
        expect(result.isDiscontinuity).toBe(true);
        expect(result.deltaPaisa?.amountPaisa).toBe(50000n);
        discontinuityDetectedAt = globalTx;
        // Re-establish baseline at reported balance to test subsequent continuity
        runningBalances[provider] = Paisa.fromPaisa(reportedBalancePaisa);
      } else {
        expect(result.status).toBe('VERIFIED');
        expect(result.isDiscontinuity).toBe(false);
        runningBalances[provider] = result.expectedNewBalancePaisa!;
      }
    }

    expect(totalProcessed).toBe(1000);
    expect(discontinuityDetectedAt).toBe(742);
  });
});

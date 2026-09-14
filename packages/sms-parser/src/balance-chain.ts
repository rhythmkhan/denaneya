import { Paisa } from '@denaneya/payment-core';
import type {
  BalanceChainStatus,
  BalanceChainVerificationInput,
  BalanceChainVerificationResult,
  DiscontinuityType,
  ParsedSmsResult,
} from './types.js';

export class BalanceChainEngine {
  /**
   * Verifies an incoming parsed SMS against the previous known wallet balance.
   */
  static verify(input: BalanceChainVerificationInput): BalanceChainVerificationResult {
    const { walletId, incomingSms, previousBalancePaisa, history } = input;
    const reportedBalance = incomingSms.balancePaisa;

    // 1. If SMS does not report a balance, we cannot verify or update the chain
    if (!reportedBalance) {
      return {
        status: 'UNKNOWN_BASELINE',
        walletId,
        previousBalancePaisa: previousBalancePaisa ?? null,
        expectedNewBalancePaisa: null,
        reportedBalancePaisa: null,
        deltaPaisa: null,
        isDiscontinuity: false,
        discontinuityType: 'NONE',
        message: 'SMS message does not report rolling balance; balance chain cannot be updated.',
      };
    }

    // 2. If no previous balance baseline exists, bootstrap baseline
    if (!previousBalancePaisa) {
      return {
        status: 'UNKNOWN_BASELINE',
        walletId,
        previousBalancePaisa: null,
        expectedNewBalancePaisa: reportedBalance,
        reportedBalancePaisa: reportedBalance,
        deltaPaisa: Paisa.zero(),
        isDiscontinuity: false,
        discontinuityType: 'NONE',
        message: `Initial baseline established at ${reportedBalance.toBDT()} BDT for wallet ${walletId}.`,
      };
    }

    // 3. Compute Expected Balance based on transaction type
    const amount = incomingSms.amountPaisa;
    const fee = incomingSms.feePaisa ?? Paisa.zero();
    let expectedBalance: Paisa;

    if (incomingSms.type === 'CASH_OUT' || incomingSms.type === 'SEND_MONEY') {
      expectedBalance = previousBalancePaisa.subtract(amount.add(fee), true);
    } else {
      expectedBalance = previousBalancePaisa.add(amount).subtract(fee, true);
    }

    // 4. Compare Reported vs Expected
    const reportedPaisa = reportedBalance.amountPaisa;
    const expectedPaisa = expectedBalance.amountPaisa;
    const deltaBigInt = reportedPaisa - expectedPaisa;
    const deltaPaisa = new Paisa(deltaBigInt);

    if (deltaBigInt === 0n) {
      return {
        status: 'VERIFIED',
        walletId,
        previousBalancePaisa,
        expectedNewBalancePaisa: expectedBalance,
        reportedBalancePaisa: reportedBalance,
        deltaPaisa: Paisa.zero(),
        isDiscontinuity: false,
        discontinuityType: 'NONE',
        message: `Balance chain continuity verified at ${reportedBalance.toBDT()} BDT.`,
      };
    }

    // 5. If direct comparison fails and history is provided, attempt out-of-order resolution
    if (history && history.length > 0) {
      const oooResult = BalanceChainEngine.resolveOutOfOrder(
        walletId,
        incomingSms,
        history
      );
      if (oooResult.status === 'VERIFIED') {
        return oooResult;
      }
    }

    // 6. Diagnose Discontinuity Type
    let discontinuityType: DiscontinuityType = 'TAMPERING';
    if (deltaBigInt > 0n) {
      discontinuityType = 'SKIPPED_CREDIT_SMS';
    } else if (deltaBigInt < 0n) {
      const absDelta = -deltaBigInt;
      if (fee.amountPaisa > 0n && absDelta === fee.amountPaisa) {
        discontinuityType = 'FEE_MISMATCH';
      } else {
        discontinuityType = 'SKIPPED_DEBIT_TRANSACTION';
      }
    }

    return {
      status: 'DISCONTINUITY_DETECTED',
      walletId,
      previousBalancePaisa,
      expectedNewBalancePaisa: expectedBalance,
      reportedBalancePaisa: reportedBalance,
      deltaPaisa,
      isDiscontinuity: true,
      discontinuityType,
      message: `Balance chain discontinuity detected! Expected ${expectedBalance.toBDT()} BDT, but SMS reported ${reportedBalance.toBDT()} BDT (delta: ${deltaPaisa.toBDT()} BDT).`,
      metadata: {
        discontinuityDeltaPaisa: deltaBigInt.toString(),
        suspectedCause: discontinuityType,
      },
    };
  }

  /**
   * Resequences history chronologically to resolve out-of-order SMS delivery.
   */
  private static resolveOutOfOrder(
    walletId: string,
    incoming: ParsedSmsResult,
    history: readonly ParsedSmsResult[]
  ): BalanceChainVerificationResult {
    // Filter history for messages with reported balances and sort chronologically
    const validHistory = history
      .filter((m) => m.balancePaisa !== null)
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Locate immediately preceding transaction before incoming SMS
    let prevTx: ParsedSmsResult | null = null;
    let nextTx: ParsedSmsResult | null = null;

    for (let i = 0; i < validHistory.length; i++) {
      const tx = validHistory[i]!;
      if (tx.timestamp.getTime() <= incoming.timestamp.getTime()) {
        prevTx = tx;
      } else if (!nextTx && tx.timestamp.getTime() > incoming.timestamp.getTime()) {
        nextTx = tx;
      }
    }

    if (!prevTx || !prevTx.balancePaisa || !incoming.balancePaisa) {
      return {
        status: 'DISCONTINUITY_DETECTED',
        walletId,
        previousBalancePaisa: null,
        expectedNewBalancePaisa: null,
        reportedBalancePaisa: incoming.balancePaisa,
        deltaPaisa: null,
        isDiscontinuity: true,
        discontinuityType: 'OUT_OF_ORDER',
        message: 'Could not resolve out-of-order delivery: baseline transaction not found in window.',
      };
    }

    // Step A: Verify (prevTx -> incoming)
    const prevBal = prevTx.balancePaisa;
    const fee = incoming.feePaisa ?? Paisa.zero();
    let expectedIncoming: Paisa;

    if (incoming.type === 'CASH_OUT' || incoming.type === 'SEND_MONEY') {
      expectedIncoming = prevBal.subtract(incoming.amountPaisa.add(fee), true);
    } else {
      expectedIncoming = prevBal.add(incoming.amountPaisa).subtract(fee, true);
    }

    const matchesPrev = expectedIncoming.equals(incoming.balancePaisa);

    // Step B: Verify (incoming -> nextTx) if nextTx exists
    let matchesNext = true;
    if (nextTx && nextTx.balancePaisa) {
      const nextFee = nextTx.feePaisa ?? Paisa.zero();
      let expectedNext: Paisa;
      if (nextTx.type === 'CASH_OUT' || nextTx.type === 'SEND_MONEY') {
        expectedNext = incoming.balancePaisa.subtract(nextTx.amountPaisa.add(nextFee), true);
      } else {
        expectedNext = incoming.balancePaisa.add(nextTx.amountPaisa).subtract(nextFee, true);
      }
      matchesNext = expectedNext.equals(nextTx.balancePaisa);
    }

    if (matchesPrev && matchesNext) {
      return {
        status: 'VERIFIED',
        walletId,
        previousBalancePaisa: prevBal,
        expectedNewBalancePaisa: expectedIncoming,
        reportedBalancePaisa: incoming.balancePaisa,
        deltaPaisa: Paisa.zero(),
        isDiscontinuity: false,
        discontinuityType: 'NONE',
        resolvedOutOfOrder: true,
        message: `Out-of-order SMS successfully reconciled within chronological window between ${prevTx.trxId} and ${nextTx?.trxId ?? 'latest'}.`,
      };
    }

    return {
      status: 'DISCONTINUITY_DETECTED',
      walletId,
      previousBalancePaisa: prevBal,
      expectedNewBalancePaisa: expectedIncoming,
      reportedBalancePaisa: incoming.balancePaisa,
      deltaPaisa: new Paisa(incoming.balancePaisa.amountPaisa - expectedIncoming.amountPaisa),
      isDiscontinuity: true,
      discontinuityType: 'OUT_OF_ORDER',
      message: 'Out-of-order insertion failed: chronological balance does not align with adjacent transactions.',
    };
  }
}
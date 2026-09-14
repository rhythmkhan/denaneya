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

    // 2. If no previous balance baseline exists, attempt out-of-order resolution if history exists, or bootstrap baseline
    if (!previousBalancePaisa) {
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
    if (incomingSms.type === 'UNKNOWN') {
      return {
        status: 'DISCONTINUITY_DETECTED',
        walletId,
        previousBalancePaisa,
        expectedNewBalancePaisa: null,
        reportedBalancePaisa: reportedBalance,
        deltaPaisa: null,
        isDiscontinuity: true,
        discontinuityType: 'TAMPERING',
        message: 'Cannot verify balance chain for transaction of UNKNOWN type.',
      };
    }

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
   * Resequences history chronologically to resolve out-of-order SMS delivery across month boundaries.
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

    if (!incoming.balancePaisa) {
      return {
        status: 'UNKNOWN_BASELINE',
        walletId,
        previousBalancePaisa: null,
        expectedNewBalancePaisa: null,
        reportedBalancePaisa: null,
        deltaPaisa: null,
        isDiscontinuity: false,
        discontinuityType: 'NONE',
        message: 'Incoming SMS does not report rolling balance; cannot resolve out-of-order chain.',
      };
    }

    // Locate immediately preceding transaction before incoming SMS and next transaction
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

    // Special Case: Incoming transaction precedes the entire history window (e.g. across month boundary)
    if (!prevTx && nextTx && nextTx.balancePaisa) {
      const nextFee = nextTx.feePaisa ?? Paisa.zero();
      let expectedNext: Paisa;
      if (nextTx.type === 'CASH_OUT' || nextTx.type === 'SEND_MONEY') {
        expectedNext = incoming.balancePaisa.subtract(nextTx.amountPaisa.add(nextFee), true);
      } else {
        expectedNext = incoming.balancePaisa.add(nextTx.amountPaisa).subtract(nextFee, true);
      }

      if (expectedNext.equals(nextTx.balancePaisa)) {
        return {
          status: 'VERIFIED',
          walletId,
          previousBalancePaisa: null,
          expectedNewBalancePaisa: incoming.balancePaisa,
          reportedBalancePaisa: incoming.balancePaisa,
          deltaPaisa: Paisa.zero(),
          isDiscontinuity: false,
          discontinuityType: 'NONE',
          resolvedOutOfOrder: true,
          message: `Out-of-order SMS preceding monthly baseline successfully reconciled against ${nextTx.trxId}.`,
        };
      }
    }

    if (!prevTx || !prevTx.balancePaisa) {
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

    let matchesPrev = expectedIncoming.equals(incoming.balancePaisa);

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

    // Handle timestamp tie-breaking: If timestamps are identical, also test if incoming happened before prevTx
    if (!matchesPrev && prevTx.timestamp.getTime() === incoming.timestamp.getTime()) {
      const prevFee = prevTx.feePaisa ?? Paisa.zero();
      let expectedPrevBal: Paisa;
      if (prevTx.type === 'CASH_OUT' || prevTx.type === 'SEND_MONEY') {
        expectedPrevBal = incoming.balancePaisa.subtract(prevTx.amountPaisa.add(prevFee), true);
      } else {
        expectedPrevBal = incoming.balancePaisa.add(prevTx.amountPaisa).subtract(prevFee, true);
      }
      if (expectedPrevBal.equals(prevTx.balancePaisa)) {
        matchesPrev = true;
        matchesNext = true;
        expectedIncoming = incoming.balancePaisa;
      }
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
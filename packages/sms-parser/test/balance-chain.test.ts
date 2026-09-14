import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { BalanceChainEngine } from '../src/balance-chain.js';
import { parseMfsSms } from '../src/parser.js';

describe('BalanceChainEngine', () => {
  const walletId = 'BKASH:01712345678';

  it('bootstraps UNKNOWN_BASELINE on first transaction when no previous balance exists', () => {
    const sms = parseMfsSms(
      'bKash',
      'Payment Tk 1,000.00 received from 01711223344. Fee Tk 0.00. Balance Tk 10,000.00. TrxID TXN001 at 13/09/2026 10:00'
    );

    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: sms,
      previousBalancePaisa: null,
    });

    expect(result.status).toBe('UNKNOWN_BASELINE');
    expect(result.isDiscontinuity).toBe(false);
    expect(result.expectedNewBalancePaisa?.toBDT()).toBe('10000.00');
    expect(result.reportedBalancePaisa?.toBDT()).toBe('10000.00');
  });

  it('verifies exact continuity for consecutive credit transactions', () => {
    const prevBalance = Paisa.fromBDT('10000.00');
    const sms = parseMfsSms(
      'bKash',
      'Payment Tk 2,500.00 received from 01711223344. Fee Tk 0.00. Balance Tk 12,500.00. TrxID TXN002 at 13/09/2026 10:30'
    );

    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: sms,
      previousBalancePaisa: prevBalance,
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.isDiscontinuity).toBe(false);
    expect(result.deltaPaisa?.isZero()).toBe(true);
    expect(result.reportedBalancePaisa?.toBDT()).toBe('12500.00');
  });

  it('verifies exact continuity for debit transactions (Cash Out)', () => {
    const prevBalance = Paisa.fromBDT('12500.00');
    const sms = parseMfsSms(
      'bKash',
      'Cash Out Tk 2,000.00 to 01799887766. Fee Tk 37.00. Balance Tk 10,463.00. TrxID TXN003 at 13/09/2026 11:00'
    );

    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: sms,
      previousBalancePaisa: prevBalance,
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.isDiscontinuity).toBe(false);
    expect(result.reportedBalancePaisa?.toBDT()).toBe('10463.00');
  });

  it('diagnoses SKIPPED_CREDIT_SMS when reported balance is higher than expected', () => {
    const prevBalance = Paisa.fromBDT('10000.00');
    // Expected: 10,000 + 500 = 10,500. Reported: 11,500 (Jumped by +1,000 BDT)
    const sms = parseMfsSms(
      'bKash',
      'Payment Tk 500.00 received from 01711223344. Fee Tk 0.00. Balance Tk 11,500.00. TrxID TXN004 at 13/09/2026 12:00'
    );

    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: sms,
      previousBalancePaisa: prevBalance,
    });

    expect(result.status).toBe('DISCONTINUITY_DETECTED');
    expect(result.isDiscontinuity).toBe(true);
    expect(result.discontinuityType).toBe('SKIPPED_CREDIT_SMS');
    expect(result.deltaPaisa?.toBDT()).toBe('1000.00');
  });

  it('diagnoses SKIPPED_DEBIT_TRANSACTION when reported balance is lower than expected', () => {
    const prevBalance = Paisa.fromBDT('10000.00');
    // Expected: 10,000 + 1,000 = 11,000. Reported: 9,500 (Lower by 1,500 BDT)
    const sms = parseMfsSms(
      'bKash',
      'Payment Tk 1,000.00 received from 01711223344. Fee Tk 0.00. Balance Tk 9,500.00. TrxID TXN005 at 13/09/2026 13:00'
    );

    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: sms,
      previousBalancePaisa: prevBalance,
    });

    expect(result.status).toBe('DISCONTINUITY_DETECTED');
    expect(result.isDiscontinuity).toBe(true);
    expect(result.discontinuityType).toBe('SKIPPED_DEBIT_TRANSACTION');
  });

  it('resolves out-of-order SMS delivery using chronological history window', () => {
    // History: TXN_A at 10:00 (bal 5,000), TXN_C at 12:00 (bal 7,000)
    // Incoming: TXN_B at 11:00 (amount 1,000, fee 0, reported bal 6,000)
    const txA = parseMfsSms(
      'bKash',
      'Payment Tk 1,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 5,000.00. TrxID TXN_A at 13/09/2026 10:00'
    );
    const txC = parseMfsSms(
      'bKash',
      'Payment Tk 1,000.00 received from 01700333333. Fee Tk 0.00. Balance Tk 7,000.00. TrxID TXN_C at 13/09/2026 12:00'
    );

    // TXN_B arrives late
    const txB = parseMfsSms(
      'bKash',
      'Payment Tk 1,000.00 received from 01700222222. Fee Tk 0.00. Balance Tk 6,000.00. TrxID TXN_B at 13/09/2026 11:00'
    );

    // Verifying txB against txC balance would fail directly, but with history window it resolves:
    const result = BalanceChainEngine.verify({
      walletId,
      incomingSms: txB,
      previousBalancePaisa: txC.balancePaisa, // out of order current pointer
      history: [txA, txC],
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.resolvedOutOfOrder).toBe(true);
    expect(result.isDiscontinuity).toBe(false);
  });
});
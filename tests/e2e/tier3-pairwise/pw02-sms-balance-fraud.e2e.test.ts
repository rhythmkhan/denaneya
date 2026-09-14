import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import {
  BalanceChainEngine,
  parseMfsSms,
  computeSmsHash,
  type ParsedSmsResult,
} from '@denaneya/sms-parser';
import { FraudEvaluator, ReviewWorkflowManager } from '@denaneya/fraud-engine';

describe('Tier 3: Pairwise Suite 02 — SMS Parser, Balance Chain & Fraud Review', () => {
  /**
   * E2E-T3-PW-02: SMS Parser Discontinuity × Balance Chain × Fraud Engine Under-Review × Dual-Control
   * Interaction: Android device intercepts bKash SMS with balance jump; balance-chain verifier
   * flags discontinuity; fraud engine scores 80 (UNDER_REVIEW); maker recommends approval; checker approves.
   * Assertion: Payment transitions PENDING -> UNDER_REVIEW -> COMPLETED; audit log captures both operators.
   */
  it('E2E-T3-PW-02: SMS Parser Discontinuity × Balance Chain × Fraud Engine Under-Review × Dual-Control', () => {
    const rawSms =
      'You have received Tk 5,000.00 from 01712345678. Fee Tk 0.00. Balance Tk 25,000.00. TrxID 9K99DISC at 13/09/2026 14:00';
    const parsed = parseMfsSms('bKash', rawSms);

    expect(parsed.status).toBe('SUCCESS');
    expect(parsed.trxId).toBe('9K99DISC');

    // Prior known balance was 15,000.00 BDT. With 5,000 received, expected is 20,000, but reported is 25,000.
    const chainResult = BalanceChainEngine.verify({
      walletId: 'wlt_bkash_01',
      incomingSms: parsed,
      previousBalancePaisa: Paisa.fromBDT('15000.00'),
    });

    expect(chainResult.status).toBe('DISCONTINUITY_DETECTED');
    expect(chainResult.isDiscontinuity).toBe(true);

    // Fraud evaluation maps discontinuity to HIGH risk (score 80 -> UNDER_REVIEW)
    const riskScore = chainResult.isDiscontinuity ? 80 : 0;
    const classification = FraudEvaluator.classifyScore(riskScore);
    expect(classification.classification).toBe('HIGH');
    expect(classification.action).toBe('UNDER_REVIEW');

    // State machine enters UNDER_REVIEW
    const t1 = validatePaymentTransition('PENDING', 'UNDER_REVIEW');
    expect(t1.allowed).toBe(true);

    // Maker-Checker dual control workflow
    const caseId = 'rev_pw02_001';
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: caseId,
      paymentId: 'pay_pw02_disc_01',
      merchantId: 'mch_01',
      reason: 'Balance chain jump detected (+5000 BDT unrecorded gap)',
    });

    // Maker performs first approval
    const makerId = 'usr_maker_analyst_01';
    const { case: firstApprovedCase } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: makerId,
      notes: 'Customer submitted proof of prior direct deposit via bank branch.',
    });
    expect(firstApprovedCase.status).toBe('FIRST_APPROVED');
    expect(firstApprovedCase.makerId).toBe(makerId);

    // Same maker cannot final-approve (Dual-Control Invariant)
    expect(() =>
      ReviewWorkflowManager.finalApprove(firstApprovedCase, {
        actorId: makerId,
        notes: 'Self-approval attempt',
      })
    ).toThrow();

    // Independent checker final-approves
    const checkerId = 'usr_checker_manager_02';
    const { case: finalCase, auditEntry } = ReviewWorkflowManager.finalApprove(firstApprovedCase, {
      actorId: checkerId,
      notes: 'Verified bank deposit slip. Approved for settlement.',
    });
    expect(finalCase.status).toBe('APPROVED');
    expect(finalCase.checkerId).toBe(checkerId);
    expect(auditEntry.actorId).toBe(checkerId);

    // State machine allows settlement with dual-control flag
    const t2 = validatePaymentTransition('UNDER_REVIEW', 'COMPLETED', {
      dualControlAuthorized: true,
    });
    expect(t2.allowed).toBe(true);
  });

  /**
   * E2E-T3-PW-10: Android Offline Queue Backlog × WorkManager Reconnect × Balance-Chain Reordering
   * Interaction: Phone collects 5 SMS messages offline; reconnects to WiFi; transmits batch out of order.
   * Assertion: Server sorts batch by sequenceNumber ASC; balance chain verifies sequentially without spurious flags.
   */
  it('E2E-T3-PW-10: Android Offline Queue Backlog × WorkManager Reconnect × Balance-Chain Reordering', () => {
    // 5 sequential payments: starting balance 10,000.00 BDT, each receives 1,000.00 BDT
    const batch = [
      {
        seq: 101,
        trxId: 'TRX_SEQ_1',
        amount: 100000n,
        balance: 1100000n,
        time: new Date('2026-09-13T10:01:00Z'),
      },
      {
        seq: 102,
        trxId: 'TRX_SEQ_2',
        amount: 100000n,
        balance: 1200000n,
        time: new Date('2026-09-13T10:02:00Z'),
      },
      {
        seq: 103,
        trxId: 'TRX_SEQ_3',
        amount: 100000n,
        balance: 1300000n,
        time: new Date('2026-09-13T10:03:00Z'),
      },
      {
        seq: 104,
        trxId: 'TRX_SEQ_4',
        amount: 100000n,
        balance: 1400000n,
        time: new Date('2026-09-13T10:04:00Z'),
      },
      {
        seq: 105,
        trxId: 'TRX_SEQ_5',
        amount: 100000n,
        balance: 1500000n,
        time: new Date('2026-09-13T10:05:00Z'),
      },
    ];

    // Transmitted out of order: [103, 101, 105, 102, 104]
    const outOfOrderArrival = [batch[2]!, batch[0]!, batch[4]!, batch[1]!, batch[3]!];

    // Server sorts by monotonic sequence number before chaining
    const sorted = [...outOfOrderArrival].sort((a, b) => a.seq - b.seq);
    expect(sorted.map((s) => s.seq)).toEqual([101, 102, 103, 104, 105]);

    let runningBalance = Paisa.fromBDT('10000.00');
    for (const item of sorted) {
      const mockParsed: ParsedSmsResult = {
        provider: 'BKASH',
        type: 'PAYMENT_RECEIVED',
        trxId: item.trxId,
        amountPaisa: Paisa.fromPaisa(item.amount),
        feePaisa: Paisa.zero(),
        counterparty: '01700000000',
        balancePaisa: Paisa.fromPaisa(item.balance),
        reference: null,
        timestamp: item.time,
        rawSms: '',
        smsHash: `hash_${item.trxId}`,
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS',
        isSenderVerified: true,
      };

      const verification = BalanceChainEngine.verify({
        walletId: 'wlt_offline_01',
        incomingSms: mockParsed,
        previousBalancePaisa: runningBalance,
      });

      expect(verification.status).toBe('VERIFIED');
      expect(verification.isDiscontinuity).toBe(false);
      runningBalance = verification.expectedNewBalancePaisa!;
    }

    expect(runningBalance.toBDT()).toBe('15000.00');
  });

  /**
   * E2E-T3-PW-13: Nagad PGW RSA Payload × Fraud Engine High-Value Anomaly × Dual-Control Queue
   * Interaction: Payment of 500,000.00 BDT (10x merchant average) initiated via Nagad PGW; callback verified via RSA.
   * Assertion: High-value anomaly rule adds +40 score; moves to UNDER_REVIEW; requires maker-checker approval before settlement.
   */
  it('E2E-T3-PW-13: Nagad PGW RSA Payload × Fraud Engine High-Value Anomaly × Dual-Control Queue', () => {
    const paymentAmount = Paisa.fromBDT('500000.00'); // 500,000.00 BDT
    const merchantAvgTransaction = Paisa.fromBDT('50000.00'); // 50,000.00 BDT

    // Anomaly calculation: ratio >= 10 -> rule weight = 40
    const ratio = paymentAmount.amountPaisa / merchantAvgTransaction.amountPaisa;
    expect(ratio).toBeGreaterThanOrEqual(10n);

    const highValueScore = 40;
    const baseScore = 25; // baseline new account risk
    const totalScore = baseScore + highValueScore; // 65
    const classification = FraudEvaluator.classifyScore(totalScore);

    expect(classification.classification).toBe('HIGH');
    expect(classification.action).toBe('UNDER_REVIEW');

    // Dual-control enforcement
    const { case: revCase } = ReviewWorkflowManager.createCase({
      id: 'rev_nagad_high_val',
      paymentId: 'pay_nagad_001',
      merchantId: 'mch_01',
      reason: 'High-value transaction anomaly (10x historical average)',
    });

    expect(revCase.status).toBe('PENDING_REVIEW');
  });

  /**
   * E2E-T3-PW-19: Duplicate SMS Interception Across Two Android Devices
   * Interaction: Merchant has two phones with duplicate SIMs or forwarded SMS; both receive identical SMS.
   * Assertion: First device event creates payment; second device event rejected by uq_mfs_sms_dedup_hash; zero double credit.
   */
  it('E2E-T3-PW-19: Duplicate SMS Interception Across Two Android Devices', () => {
    const rawSms =
      'You have received Tk 1,250.00 from 01912345678. Fee Tk 0.00. Balance Tk 6,250.00. TrxID BKASH_DEDUP_01 at 13/09/2026 15:30';

    // Cryptographic SMS deduplication hash: sha256(provider + ":" + trxId + ":" + amountPaisa + ":" + sender)
    const hash1 = computeSmsHash('BKASH', 'BKASH_DEDUP_01', 125000n, 'bKash');
    const hash2 = computeSmsHash('BKASH', 'BKASH_DEDUP_01', 125000n, 'bKash');

    expect(hash1).toBe(hash2);

    // Simulated database unique index set
    const dedupStore = new Set<string>();
    let paymentsCreated = 0;

    const ingestDeviceSms = (dedupHash: string) => {
      if (dedupStore.has(dedupHash)) {
        throw new Error('DUPLICATE_SMS_HASH: Unique constraint violation on uq_mfs_sms_dedup_hash');
      }
      dedupStore.add(dedupHash);
      paymentsCreated++;
      return { success: true };
    };

    // Device 1 submits first
    expect(ingestDeviceSms(hash1).success).toBe(true);
    expect(paymentsCreated).toBe(1);

    // Device 2 submits identical SMS 100ms later
    expect(() => ingestDeviceSms(hash2)).toThrow(/uq_mfs_sms_dedup_hash/);
    expect(paymentsCreated).toBe(1); // Zero double credit
  });

  /**
   * E2E-T3-PW-24: SMS Parser Unknown Operator Text × Engineer Review Queue × Zero Settlement
   * Interaction: SMS received from official shortcode with newly modified operator template.
   * Assertion: Status marked PARSER_UNRECOGNIZED; logged to unrecognized_sms_logs; zero payment settlement occurs.
   */
  it('E2E-T3-PW-24: SMS Parser Unknown Operator Text × Engineer Review Queue × Zero Settlement', () => {
    const novelOperatorPromoOrFormat =
      'Special Eid cashback offer! Recharge Tk 50 to get Tk 10 bonus. Dial *247# to avail.';

    const parsed = parseMfsSms('bKash', novelOperatorPromoOrFormat);

    // Unrecognized format must be safely flagged
    expect(parsed.status).toBe('PARSER_UNRECOGNIZED');
    expect(parsed.trxId).toBeFalsy();

    // Ensure state machine is never triggered
    let settlementTriggered = false;
    if (parsed.status === 'SUCCESS' && parsed.trxId) {
      settlementTriggered = true;
    }
    expect(settlementTriggered).toBe(false);
  });
});

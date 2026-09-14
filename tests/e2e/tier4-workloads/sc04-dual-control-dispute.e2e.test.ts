import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { FraudEvaluator, ReviewWorkflowManager } from '@denaneya/fraud-engine';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance } from '../helpers/ledger-verifier.js';

describe('Tier 4: Workload Scenario 04 — Dual-Control High-Risk Dispute & Resolution', () => {
  /**
   * E2E-T4-SC-04: Dual-Control Maker-Checker High-Risk Payment Dispute & Resolution
   * High risk payment -> Anti-fraud score 75 (UNDER_REVIEW) -> Maker reviews and recommends approve ->
   * Checker confirms (maker != checker) -> State machine COMPLETED -> Ledger posted.
   */
  it('E2E-T4-SC-04: Dual-Control Maker-Checker High-Risk Payment Dispute & Resolution', () => {
    const grossPaisa = 4500000n; // 45,000.00 BDT
    const payment = {
      id: 'pay_high_risk_45k',
      merchantId: 'mch_01',
      amountPaisa: grossPaisa,
      status: 'PENDING' as any,
    };

    // 1. Anti-fraud rule evaluation: GEO_IP_ANOMALOUS_PROXY (+35) + HIGH_VALUE_ANOMALY (+40) = 75
    const riskScore = 35 + 40;
    const classification = FraudEvaluator.classifyScore(riskScore);

    expect(classification.classification).toBe('HIGH');
    expect(classification.action).toBe('UNDER_REVIEW');

    // 2. State machine transitions PENDING -> UNDER_REVIEW
    const tReview = validatePaymentTransition(payment.status, 'UNDER_REVIEW');
    expect(tReview.allowed).toBe(true);
    payment.status = 'UNDER_REVIEW';

    // 3. Case enters Admin Review Queue
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: 'case_risk_45k',
      paymentId: payment.id,
      merchantId: payment.merchantId,
      reason: 'GEO_IP_ANOMALOUS_PROXY (+35) and HIGH_VALUE_ANOMALY (+40)',
    });

    // 4. Fraud Analyst (Maker) recommends approval after phone verification
    const makerId = 'usr_analyst_tariq';
    const { case: makerCase } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: makerId,
      notes: 'Customer verified phone and address via callback.',
    });

    expect(makerCase.status).toBe('FIRST_APPROVED');
    expect(makerCase.makerId).toBe(makerId);

    // 5. Invariant check: Maker cannot approve their own recommendation
    expect(() =>
      ReviewWorkflowManager.finalApprove(makerCase, {
        actorId: makerId,
        notes: 'Self approval attempt',
      })
    ).toThrow();

    // 6. Risk Manager (Checker) inspects and provides final approval
    const checkerId = 'usr_manager_nasrin';
    const { case: approvedCase, auditEntry } = ReviewWorkflowManager.finalApprove(makerCase, {
      actorId: checkerId,
      notes: 'Customer ID and call log reviewed. Approved.',
    });

    expect(approvedCase.status).toBe('APPROVED');
    expect(approvedCase.checkerId).toBe(checkerId);
    expect(approvedCase.makerId).not.toBe(approvedCase.checkerId);
    expect(auditEntry.action).toBe('FINAL_APPROVAL');

    // 7. State machine executes UNDER_REVIEW -> COMPLETED with dual-control authorization
    const tComplete = validatePaymentTransition(payment.status, 'COMPLETED', {
      dualControlAuthorized: true,
    });
    expect(tComplete.allowed).toBe(true);
    payment.status = 'COMPLETED';

    // 8. Atomic ledger settlement
    const ledgerTx = buildPaymentCaptureTransaction({
      paymentId: payment.id,
      merchantId: payment.merchantId,
      provider: 'SSLCOMMERZ',
      grossAmountPaisa: payment.amountPaisa,
      platformFeePaisa: 83250n, // 1.85% MDR = 832.50 BDT
    });

    const v = verifyLedgerBalance(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(v.balanced).toBe(true);
    expect(v.totalDebitsPaisa).toBe(grossPaisa);
  });
});

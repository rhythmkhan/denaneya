import { describe, it, expect } from 'vitest';
import {
  ReviewWorkflowManager,
  DualControlViolationError,
  InvalidReviewStateTransitionError,
} from '@denaneya/fraud-engine';
import { validatePaymentTransition } from '@denaneya/payment-core';

describe('Feature 09: Dual-Control Review Workflow (E2E-T1-F09)', () => {
  // E2E-T1-F09-01: Payment Enqueue to UNDER_REVIEW Moderation Queue
  it('E2E-T1-F09-01: Payment Enqueue to UNDER_REVIEW Moderation Queue', () => {
    const { case: reviewCase, auditEntry } = ReviewWorkflowManager.createCase({
      paymentId: 'pay_rev_f09_001',
      merchantId: 'mer_standard_01',
      riskScore: 75,
      reason: 'High risk velocity score detected by fraud engine',
    });

    expect(reviewCase.status).toBe('PENDING_REVIEW');
    expect(reviewCase.paymentId).toBe('pay_rev_f09_001');
    expect(reviewCase.reason).toContain('High risk velocity score');
    expect(reviewCase.makerId).toBeFalsy();
    expect(reviewCase.checkerId).toBeFalsy();

    expect(auditEntry.action).toBe('CASE_CREATED');
    expect(auditEntry.toStatus).toBe('PENDING_REVIEW');
  });

  // E2E-T1-F09-02: Maker Submission of Approval Recommendation
  it('E2E-T1-F09-02: Maker Submission of Approval Recommendation', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      paymentId: 'pay_rev_f09_002',
      merchantId: 'mer_standard_01',
      riskScore: 75,
      reason: 'Score 75 requiring dual approval',
    });

    const { case: firstApprovedCase, auditEntry } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'usr_maker_operator_01',
      actorRole: 'MAKER',
      notes: 'Verified customer invoice and KYC documents match transaction',
    });

    expect(firstApprovedCase.status).toBe('FIRST_APPROVED');
    expect(firstApprovedCase.makerId).toBe('usr_maker_operator_01');
    expect(firstApprovedCase.makerRecommendation).toBe('APPROVE');
    expect(firstApprovedCase.makerNotes).toContain('Verified customer invoice');
    expect(auditEntry.fromStatus).toBe('PENDING_REVIEW');
    expect(auditEntry.toStatus).toBe('FIRST_APPROVED');
  });

  // E2E-T1-F09-03: Checker Final Approval & Transition to COMPLETED
  it('E2E-T1-F09-03: Checker Final Approval & Transition to COMPLETED', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      paymentId: 'pay_rev_f09_003',
      merchantId: 'mer_standard_01',
      riskScore: 75,
      reason: 'High risk transaction requiring checker approval',
    });

    const { case: firstApprovedCase } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'usr_maker_01',
      actorRole: 'MAKER',
      notes: 'Maker recommends approval',
    });

    const { case: finalApprovedCase, auditEntry } = ReviewWorkflowManager.finalApprove(firstApprovedCase, {
      actorId: 'usr_checker_supervisor_02',
      actorRole: 'CHECKER',
      notes: 'Supervisor checker confirmed bank receipt and authorized settlement',
    });

    expect(finalApprovedCase.status).toBe('APPROVED');
    expect(finalApprovedCase.checkerId).toBe('usr_checker_supervisor_02');
    expect(finalApprovedCase.checkerDecision).toBe('APPROVE');
    expect(auditEntry.fromStatus).toBe('FIRST_APPROVED');
    expect(auditEntry.toStatus).toBe('APPROVED');

    // Verify payment state machine allows transition from UNDER_REVIEW to COMPLETED
    const transitionCheck = validatePaymentTransition('UNDER_REVIEW', 'COMPLETED');
    expect(transitionCheck.allowed).toBe(true);
  });

  // E2E-T1-F09-04: Dual-Control Separation of Duties Enforcement (Maker != Checker)
  it('E2E-T1-F09-04: Dual-Control Separation of Duties Enforcement (Maker != Checker)', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      paymentId: 'pay_rev_f09_004',
      merchantId: 'mer_standard_01',
      riskScore: 80,
      reason: 'Flagged for dual control review',
    });

    const { case: firstApprovedCase } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'usr_rogue_operator_01',
      actorRole: 'MAKER',
      notes: 'Self-recommendation',
    });

    // Maker attempting to also act as Checker must throw DualControlViolationError
    expect(() => {
      ReviewWorkflowManager.finalApprove(firstApprovedCase, {
        actorId: 'usr_rogue_operator_01',
        actorRole: 'CHECKER',
        notes: 'Attempted self-approval',
      });
    }).toThrow(DualControlViolationError);
  });

  // E2E-T1-F09-05: Checker Final Rejection & Transition to FAILED
  it('E2E-T1-F09-05: Checker Final Rejection & Transition to FAILED', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      paymentId: 'pay_rev_f09_005',
      merchantId: 'mer_standard_01',
      riskScore: 82,
      reason: 'Suspicious transaction pattern',
    });

    const { case: firstApprovedCase } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'usr_maker_01',
      actorRole: 'MAKER',
      notes: 'Submitted for supervisor review',
    });

    const { case: rejectedCase, auditEntry } = ReviewWorkflowManager.reject(firstApprovedCase, {
      actorId: 'usr_checker_supervisor_02',
      actorRole: 'CHECKER',
      reason: 'Unverified SMS and spoofed originator header detected',
    });

    expect(rejectedCase.status).toBe('REJECTED');
    expect(rejectedCase.checkerId).toBe('usr_checker_supervisor_02');
    expect(rejectedCase.checkerDecision).toBe('REJECT');
    expect(auditEntry.toStatus).toBe('REJECTED');

    // Verify payment state machine allows transition from UNDER_REVIEW to FAILED
    const transitionCheck = validatePaymentTransition('UNDER_REVIEW', 'FAILED');
    expect(transitionCheck.allowed).toBe(true);
  });
});

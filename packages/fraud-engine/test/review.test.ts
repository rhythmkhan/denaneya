import { describe, it, expect } from 'vitest';
import { ReviewWorkflowManager } from '../src/review.js';
import {
  DualControlViolationError,
  InvalidReviewStateTransitionError,
} from '../src/errors.js';

describe('ReviewWorkflowManager', () => {
  it('executes full maker-checker approval lifecycle', () => {
    const { case: initialCase, auditEntry: audit1 } = ReviewWorkflowManager.createCase({
      id: 'rcs_01',
      paymentId: 'pay_01',
      merchantId: 'mer_01',
      reason: 'Balance chain discontinuity hold',
    });

    expect(initialCase.status).toBe('PENDING_REVIEW');
    expect(audit1.action).toBe('CASE_CREATED');

    // Maker approves
    const { case: firstApproved, auditEntry: audit2 } = ReviewWorkflowManager.firstApprove(
      initialCase,
      { actorId: 'user_maker_01', notes: 'Verified bank slip with merchant' }
    );
    expect(firstApproved.status).toBe('FIRST_APPROVED');
    expect(firstApproved.makerId).toBe('user_maker_01');
    expect(audit2.action).toBe('FIRST_APPROVAL');

    // Checker approves (different user)
    const { case: approvedCase, auditEntry: audit3 } = ReviewWorkflowManager.finalApprove(
      firstApproved,
      { actorId: 'user_checker_02', notes: 'Confirmed ledger adjustment; authorized' }
    );
    expect(approvedCase.status).toBe('APPROVED');
    expect(approvedCase.checkerId).toBe('user_checker_02');
    expect(audit3.action).toBe('FINAL_APPROVAL');
  });

  it('strictly rejects when Checker is identical to Maker (Dual-Control Invariant)', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: 'rcs_02',
      paymentId: 'pay_02',
      merchantId: 'mer_01',
      reason: 'High risk score',
    });

    const { case: firstApproved } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'user_admin_01',
      notes: 'Initial check',
    });

    // Attempting self-approval
    expect(() => {
      ReviewWorkflowManager.finalApprove(firstApproved, {
        actorId: 'user_admin_01', // Same user!
        notes: 'Final check by myself',
      });
    }).toThrow(DualControlViolationError);
  });

  it('allows rejection from PENDING_REVIEW', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: 'rcs_03',
      paymentId: 'pay_03',
      merchantId: 'mer_01',
      reason: 'Fraud risk',
    });

    const { case: rejectedCase, auditEntry } = ReviewWorkflowManager.reject(initialCase, {
      actorId: 'user_maker_01',
      notes: 'Fraud confirmed by customer',
    });

    expect(rejectedCase.status).toBe('REJECTED');
    expect(auditEntry.action).toBe('REJECTION');
  });

  it('allows rejection from FIRST_APPROVED', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: 'rcs_04',
      paymentId: 'pay_04',
      merchantId: 'mer_01',
      reason: 'Fraud risk',
    });

    const { case: firstApproved } = ReviewWorkflowManager.firstApprove(initialCase, {
      actorId: 'user_maker_01',
      notes: 'Initial check looks okay',
    });

    const { case: rejectedCase, auditEntry } = ReviewWorkflowManager.reject(firstApproved, {
      actorId: 'user_checker_02',
      notes: 'Discovered suspicious chargeback history; rejecting',
    });

    expect(rejectedCase.status).toBe('REJECTED');
    expect(rejectedCase.checkerId).toBe('user_checker_02');
    expect(auditEntry.action).toBe('REJECTION');
  });

  it('rejects illegal state transitions', () => {
    const { case: initialCase } = ReviewWorkflowManager.createCase({
      id: 'rcs_05',
      paymentId: 'pay_05',
      merchantId: 'mer_01',
      reason: 'Under review',
    });

    // Skipping FIRST_APPROVE to FINAL_APPROVE is forbidden
    expect(() => {
      ReviewWorkflowManager.finalApprove(initialCase, {
        actorId: 'user_checker_02',
        notes: 'Trying to skip maker step',
      });
    }).toThrow(InvalidReviewStateTransitionError);
  });
});

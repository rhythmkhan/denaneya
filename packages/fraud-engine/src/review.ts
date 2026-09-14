import { randomBytes } from 'node:crypto';
import type {
  ReviewCase,
  ReviewAuditEntry,
} from './types.js';
import {
  DualControlViolationError,
  InvalidReviewStateTransitionError,
} from './errors.js';

export interface CreateReviewCaseParams {
  id: string;
  paymentId: string;
  merchantId: string;
  reason: string;
}

export interface ReviewActionParams {
  actorId: string;
  notes: string;
  metadata?: Record<string, unknown>;
}

export class ReviewWorkflowManager {
  private static generateAuditId(): string {
    return 'raud_' + Date.now().toString(36) + '_' + randomBytes(4).toString('hex');
  }

  static createCase(params: CreateReviewCaseParams): {
    case: ReviewCase;
    auditEntry: ReviewAuditEntry;
  } {
    const now = new Date();
    const reviewCase: ReviewCase = {
      id: params.id,
      paymentId: params.paymentId,
      merchantId: params.merchantId,
      status: 'PENDING_REVIEW',
      reason: params.reason,
      makerId: null,
      makerRecommendation: null,
      makerNotes: null,
      makerDecidedAt: null,
      checkerId: null,
      checkerDecision: null,
      checkerNotes: null,
      checkerDecidedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const auditEntry: ReviewAuditEntry = {
      id: this.generateAuditId(),
      caseId: reviewCase.id,
      paymentId: reviewCase.paymentId,
      merchantId: reviewCase.merchantId,
      actorId: 'SYSTEM',
      action: 'CASE_CREATED',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'PENDING_REVIEW',
      reason: params.reason,
      timestamp: now,
    };

    return { case: reviewCase, auditEntry };
  }

  static firstApprove(
    currentCase: ReviewCase,
    params: ReviewActionParams
  ): { case: ReviewCase; auditEntry: ReviewAuditEntry } {
    if (currentCase.status !== 'PENDING_REVIEW') {
      throw new InvalidReviewStateTransitionError(currentCase.status, 'FIRST_APPROVE');
    }

    const now = new Date();
    const updatedCase: ReviewCase = {
      ...currentCase,
      status: 'FIRST_APPROVED',
      makerId: params.actorId,
      makerRecommendation: 'APPROVE',
      makerNotes: params.notes,
      makerDecidedAt: now,
      updatedAt: now,
    };

    const auditEntry: ReviewAuditEntry = {
      id: this.generateAuditId(),
      caseId: updatedCase.id,
      paymentId: updatedCase.paymentId,
      merchantId: updatedCase.merchantId,
      actorId: params.actorId,
      action: 'FIRST_APPROVAL',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'FIRST_APPROVED',
      reason: params.notes,
      metadata: params.metadata,
      timestamp: now,
    };

    return { case: updatedCase, auditEntry };
  }

  static finalApprove(
    currentCase: ReviewCase,
    params: ReviewActionParams
  ): { case: ReviewCase; auditEntry: ReviewAuditEntry } {
    if (currentCase.status !== 'FIRST_APPROVED') {
      throw new InvalidReviewStateTransitionError(currentCase.status, 'FINAL_APPROVE');
    }

    // Strict Maker-Checker Dual-Control Invariant Enforcement
    if (!currentCase.makerId || currentCase.makerId === params.actorId) {
      throw new DualControlViolationError(currentCase.makerId ?? 'UNKNOWN', params.actorId);
    }

    const now = new Date();
    const updatedCase: ReviewCase = {
      ...currentCase,
      status: 'APPROVED',
      checkerId: params.actorId,
      checkerDecision: 'APPROVE',
      checkerNotes: params.notes,
      checkerDecidedAt: now,
      updatedAt: now,
    };

    const auditEntry: ReviewAuditEntry = {
      id: this.generateAuditId(),
      caseId: updatedCase.id,
      paymentId: updatedCase.paymentId,
      merchantId: updatedCase.merchantId,
      actorId: params.actorId,
      action: 'FINAL_APPROVAL',
      fromStatus: 'FIRST_APPROVED',
      toStatus: 'APPROVED',
      reason: params.notes,
      metadata: params.metadata,
      timestamp: now,
    };

    return { case: updatedCase, auditEntry };
  }

  static reject(
    currentCase: ReviewCase,
    params: ReviewActionParams
  ): { case: ReviewCase; auditEntry: ReviewAuditEntry } {
    if (currentCase.status !== 'PENDING_REVIEW' && currentCase.status !== 'FIRST_APPROVED') {
      throw new InvalidReviewStateTransitionError(currentCase.status, 'REJECT');
    }

    const now = new Date();
    const fromStatus = currentCase.status;

    let updatedCase: ReviewCase;
    if (fromStatus === 'PENDING_REVIEW') {
      updatedCase = {
        ...currentCase,
        status: 'REJECTED',
        makerId: params.actorId,
        makerRecommendation: 'REJECT',
        makerNotes: params.notes,
        makerDecidedAt: now,
        updatedAt: now,
      };
    } else {
      updatedCase = {
        ...currentCase,
        status: 'REJECTED',
        checkerId: params.actorId,
        checkerDecision: 'REJECT',
        checkerNotes: params.notes,
        checkerDecidedAt: now,
        updatedAt: now,
      };
    }

    const auditEntry: ReviewAuditEntry = {
      id: this.generateAuditId(),
      caseId: updatedCase.id,
      paymentId: updatedCase.paymentId,
      merchantId: updatedCase.merchantId,
      actorId: params.actorId,
      action: 'REJECTION',
      fromStatus,
      toStatus: 'REJECTED',
      reason: params.notes,
      metadata: params.metadata,
      timestamp: now,
    };

    return { case: updatedCase, auditEntry };
  }
}

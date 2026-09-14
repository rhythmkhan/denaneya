/**
 * DenaNeya 11-State Payment State Machine Engine
 * Strictly aligns with PostgreSQL trigger `trg_enforce_payment_transition`
 */

import {
  DualControlViolationError,
  InvalidStateTransitionError,
  OptimisticLockError,
  RefundExceedsCapturedAmountError,
  TerminalStateError,
} from './errors.js';
import type {
  PaymentRecord,
  PaymentState,
  PaymentTransitionContext,
  TerminalPaymentState,
  TransitionValidationResult,
} from './types.js';
import { TERMINAL_STATES } from './types.js';

/**
 * Authoritative 11x11 Valid Payment Transition Matrix
 */
export const VALID_PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ['REQUIRES_ACTION', 'PENDING', 'PROCESSING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  REQUIRES_ACTION: ['PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['PROCESSING', 'UNDER_REVIEW', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['UNDER_REVIEW', 'COMPLETED', 'FAILED'],
  UNDER_REVIEW: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  // Terminal States (Zero outgoing transitions)
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
} as const;

/**
 * Checks whether a given state is terminal.
 */
export function isTerminalState(state: PaymentState): state is TerminalPaymentState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/**
 * Returns allowed next states from the current state.
 */
export function getAllowedTransitions(currentState: PaymentState): readonly PaymentState[] {
  return VALID_PAYMENT_TRANSITIONS[currentState] ?? [];
}

/**
 * Fast boolean check if a transition is syntactically allowed.
 */
export function canTransition(currentState: PaymentState, targetState: PaymentState): boolean {
  if (currentState === targetState) {
    // Self-transition is only valid for PARTIALLY_REFUNDED (subsequent partial refund)
    return currentState === 'PARTIALLY_REFUNDED';
  }
  const allowed = VALID_PAYMENT_TRANSITIONS[currentState];
  return allowed ? allowed.includes(targetState) : false;
}

/**
 * Validates a transition against both the transition matrix and contextual guards:
 * 1. Terminal state immutability
 * 2. Matrix topology validity
 * 3. Dual-control Maker-Checker review guard
 * 4. Refund bounds and captured balance invariants
 */
export function validatePaymentTransition(
  currentState: PaymentState,
  targetState: PaymentState,
  context?: Partial<PaymentTransitionContext>
): TransitionValidationResult {
  // 1. Terminal State Immutability Guard
  if (isTerminalState(currentState)) {
    return {
      allowed: false,
      errorCode: 'TERMINAL_STATE_IMMUTABLE',
      error: `Current state '${currentState}' is terminal and cannot transition to '${targetState}'.`,
    };
  }

  // 2. Matrix Topology Check
  if (!canTransition(currentState, targetState)) {
    return {
      allowed: false,
      errorCode: 'INVALID_STATE_TRANSITION',
      error: `Transition from '${currentState}' to '${targetState}' is not permitted in the 11-state transition matrix.`,
    };
  }

  // 3. Dual-Control Review Guard (UNDER_REVIEW -> COMPLETED)
  if (currentState === 'UNDER_REVIEW' && targetState === 'COMPLETED') {
    if (context?.makerId && context?.checkerId) {
      if (context.makerId === context.checkerId) {
        return {
          allowed: false,
          errorCode: 'DUAL_CONTROL_VIOLATION',
          error: `Dual-control review violation: maker (${context.makerId}) cannot be identical to checker.`,
        };
      }
    }
  }

  // 4. Financial Refund Guards (COMPLETED / PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED / REFUNDED)
  if (targetState === 'PARTIALLY_REFUNDED' || targetState === 'REFUNDED') {
    if (
      context?.capturedAmountPaisa !== undefined &&
      context?.existingRefundedAmountPaisa !== undefined &&
      context?.newRefundAmountPaisa !== undefined
    ) {
      const captured = context.capturedAmountPaisa;
      const existingRefunded = context.existingRefundedAmountPaisa;
      const newRefund = context.newRefundAmountPaisa;

      if (newRefund <= 0n) {
        return {
          allowed: false,
          errorCode: 'INVALID_MONEY_AMOUNT',
          error: `Refund amount must be strictly greater than 0 paisa (received ${newRefund}).`,
        };
      }

      const totalRefunded = existingRefunded + newRefund;
      if (totalRefunded > captured) {
        return {
          allowed: false,
          errorCode: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
          error: `Cumulative refund (${totalRefunded} paisa) exceeds captured amount (${captured} paisa).`,
        };
      }

      if (targetState === 'REFUNDED' && totalRefunded !== captured) {
        return {
          allowed: false,
          errorCode: 'INVALID_STATE_TRANSITION',
          error: `State 'REFUNDED' requires total refund (${totalRefunded}) to exactly equal captured amount (${captured}).`,
        };
      }

      if (targetState === 'PARTIALLY_REFUNDED' && totalRefunded >= captured) {
        return {
          allowed: false,
          errorCode: 'INVALID_STATE_TRANSITION',
          error: `State 'PARTIALLY_REFUNDED' requires total refund (${totalRefunded}) to be strictly less than captured amount (${captured}).`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Asserts that a transition is valid; throws a typed domain error if invalid.
 */
export function assertValidPaymentTransition(
  currentState: PaymentState,
  targetState: PaymentState,
  context?: Partial<PaymentTransitionContext>
): void {
  const result = validatePaymentTransition(currentState, targetState, context);
  if (!result.allowed) {
    if (result.errorCode === 'TERMINAL_STATE_IMMUTABLE') {
      throw new TerminalStateError(currentState, targetState, { context });
    }
    if (result.errorCode === 'DUAL_CONTROL_VIOLATION') {
      throw new DualControlViolationError(context?.makerId ?? 'unknown', { context });
    }
    if (result.errorCode === 'REFUND_EXCEEDS_CAPTURED_AMOUNT') {
      const req = context?.newRefundAmountPaisa ?? 0n;
      const existing = context?.existingRefundedAmountPaisa ?? 0n;
      const cap = context?.capturedAmountPaisa ?? 0n;
      throw new RefundExceedsCapturedAmountError(req, cap - existing, cap, { context });
    }
    throw new InvalidStateTransitionError(currentState, targetState, result.error, { context });
  }
}

/**
 * Applies a state transition to a PaymentRecord with Optimistic Concurrency Control (OCC).
 * Validates version, increments version (version + 1), updates timestamp, and returns the modified record.
 */
export function applyPaymentTransition<T extends PaymentRecord>(
  payment: T,
  targetState: PaymentState,
  context?: Partial<PaymentTransitionContext> & { expectedVersion?: number }
): T {
  // 1. Optimistic Concurrency Lock Verification
  if (context?.expectedVersion !== undefined && payment.version !== context.expectedVersion) {
    throw new OptimisticLockError(context.expectedVersion, payment.version, payment.id);
  }

  // 2. Validate Transition
  const mergedContext: Partial<PaymentTransitionContext> = {
    paymentId: payment.id,
    currentState: payment.status,
    targetState,
    amountPaisa: payment.amountPaisa,
    capturedAmountPaisa: payment.amountPaisa,
    existingRefundedAmountPaisa: payment.refundedAmountPaisa,
    ...context,
  };

  assertValidPaymentTransition(payment.status, targetState, mergedContext);

  // 3. Compute new refunded amount if this is a refund transition
  let newRefundedAmount = payment.refundedAmountPaisa;
  if (context?.newRefundAmountPaisa) {
    newRefundedAmount += context.newRefundAmountPaisa;
  }

  // 4. Return new state with incremented version
  return {
    ...payment,
    status: targetState,
    refundedAmountPaisa: newRefundedAmount,
    version: payment.version + 1,
    updatedAt: new Date(),
  };
}

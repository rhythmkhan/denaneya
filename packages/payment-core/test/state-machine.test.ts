import { describe, it, expect } from 'vitest';
import {
  VALID_PAYMENT_TRANSITIONS,
  isTerminalState,
  getAllowedTransitions,
  canTransition,
  validatePaymentTransition,
  assertValidPaymentTransition,
  applyPaymentTransition,
} from '../src/state-machine.js';
import {
  DualControlViolationError,
  InvalidStateTransitionError,
  OptimisticLockError,
  RefundExceedsCapturedAmountError,
  TerminalStateError,
} from '../src/errors.js';
import type { PaymentRecord, PaymentState } from '../src/types.js';

describe('Payment State Machine (11-State Engine)', () => {
  describe('Transition Matrix & Topology', () => {
    it('verifies allowed transitions from CREATED', () => {
      const allowed = getAllowedTransitions('CREATED');
      expect(allowed).toEqual([
        'REQUIRES_ACTION',
        'PENDING',
        'PROCESSING',
        'CANCELLED',
        'EXPIRED',
        'FAILED',
      ]);
      expect(canTransition('CREATED', 'PENDING')).toBe(true);
      expect(canTransition('CREATED', 'COMPLETED')).toBe(false);
    });

    it('verifies allowed transitions from COMPLETED', () => {
      const allowed = getAllowedTransitions('COMPLETED');
      expect(allowed).toEqual(['PARTIALLY_REFUNDED', 'REFUNDED']);
      expect(canTransition('COMPLETED', 'PENDING')).toBe(false);
      expect(canTransition('COMPLETED', 'FAILED')).toBe(false);
    });

    it('verifies PARTIALLY_REFUNDED can transition to PARTIALLY_REFUNDED and REFUNDED', () => {
      expect(canTransition('PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED')).toBe(true);
      expect(canTransition('PARTIALLY_REFUNDED', 'REFUNDED')).toBe(true);
      expect(canTransition('PARTIALLY_REFUNDED', 'COMPLETED')).toBe(false);
    });

    it('verifies terminal states have zero outgoing transitions', () => {
      const terminalStates: PaymentState[] = ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
      for (const st of terminalStates) {
        expect(isTerminalState(st)).toBe(true);
        expect(getAllowedTransitions(st)).toEqual([]);
        expect(canTransition(st, 'COMPLETED')).toBe(false);
        expect(canTransition(st, 'PENDING')).toBe(false);
      }
    });

    it('rejects invalid transitions with InvalidStateTransitionError', () => {
      expect(() => assertValidPaymentTransition('CREATED', 'COMPLETED')).toThrow(
        InvalidStateTransitionError
      );
      expect(() => assertValidPaymentTransition('COMPLETED', 'PENDING')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('rejects transitions from terminal states with TerminalStateError', () => {
      expect(() => assertValidPaymentTransition('FAILED', 'CREATED')).toThrow(TerminalStateError);
      expect(() => assertValidPaymentTransition('CANCELLED', 'PROCESSING')).toThrow(
        TerminalStateError
      );
      expect(() => assertValidPaymentTransition('REFUNDED', 'COMPLETED')).toThrow(
        TerminalStateError
      );
      expect(() => assertValidPaymentTransition('EXPIRED', 'PENDING')).toThrow(TerminalStateError);
    });
  });

  describe('Dual-Control Review Guard', () => {
    it('allows transition from UNDER_REVIEW to COMPLETED when maker != checker', () => {
      expect(() =>
        assertValidPaymentTransition('UNDER_REVIEW', 'COMPLETED', {
          makerId: 'maker_user_1',
          checkerId: 'checker_user_2',
        })
      ).not.toThrow();
    });

    it('rejects transition from UNDER_REVIEW to COMPLETED when maker == checker', () => {
      expect(() =>
        assertValidPaymentTransition('UNDER_REVIEW', 'COMPLETED', {
          makerId: 'same_user',
          checkerId: 'same_user',
        })
      ).toThrow(DualControlViolationError);
    });
  });

  describe('Refund Financial Bounds & Guards', () => {
    it('validates full refund matches captured amount exactly', () => {
      const result = validatePaymentTransition('COMPLETED', 'REFUNDED', {
        capturedAmountPaisa: 10000n,
        existingRefundedAmountPaisa: 0n,
        newRefundAmountPaisa: 10000n,
      });
      expect(result.allowed).toBe(true);
    });

    it('validates partial refund strictly less than captured amount', () => {
      const result = validatePaymentTransition('COMPLETED', 'PARTIALLY_REFUNDED', {
        capturedAmountPaisa: 10000n,
        existingRefundedAmountPaisa: 0n,
        newRefundAmountPaisa: 4000n,
      });
      expect(result.allowed).toBe(true);
    });

    it('rejects refund exceeding captured amount', () => {
      expect(() =>
        assertValidPaymentTransition('COMPLETED', 'PARTIALLY_REFUNDED', {
          capturedAmountPaisa: 10000n,
          existingRefundedAmountPaisa: 3000n,
          newRefundAmountPaisa: 8000n, // 3000 + 8000 = 11000 > 10000
        })
      ).toThrow(RefundExceedsCapturedAmountError);
    });

    it('rejects REFUNDED when total refund does not equal captured amount', () => {
      const result = validatePaymentTransition('COMPLETED', 'REFUNDED', {
        capturedAmountPaisa: 10000n,
        existingRefundedAmountPaisa: 0n,
        newRefundAmountPaisa: 5000n,
      });
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('applyPaymentTransition & Optimistic Concurrency Control', () => {
    const mockPayment: PaymentRecord = {
      id: 'pay_test_01',
      merchantId: 'mer_test_01',
      amountPaisa: 10000n,
      currency: 'BDT',
      status: 'PENDING',
      feePaisa: 150n,
      refundedAmountPaisa: 0n,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('applies valid transition and increments version', () => {
      const updated = applyPaymentTransition(mockPayment, 'PROCESSING', {
        expectedVersion: 1,
      });

      expect(updated.status).toBe('PROCESSING');
      expect(updated.version).toBe(2);
    });

    it('throws OptimisticLockError when version mismatch occurs', () => {
      expect(() =>
        applyPaymentTransition(mockPayment, 'PROCESSING', {
          expectedVersion: 99, // Stale version!
        })
      ).toThrow(OptimisticLockError);
    });

    it('accumulates refundedAmountPaisa on refund transitions', () => {
      const completedPayment: PaymentRecord = {
        ...mockPayment,
        status: 'COMPLETED',
        version: 3,
      };

      const partialRefunded = applyPaymentTransition(completedPayment, 'PARTIALLY_REFUNDED', {
        expectedVersion: 3,
        newRefundAmountPaisa: 3000n,
        existingRefundedAmountPaisa: 0n,
        capturedAmountPaisa: 10000n,
      });

      expect(partialRefunded.status).toBe('PARTIALLY_REFUNDED');
      expect(partialRefunded.refundedAmountPaisa).toBe(3000n);
      expect(partialRefunded.version).toBe(4);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  PaymentCoreError,
  InvalidMoneyAmountError,
  NegativeAmountError,
  FloatingPointArithmeticError,
  InvalidCurrencyError,
  InvalidStateTransitionError,
  TerminalStateError,
  OptimisticLockError,
  RefundExceedsCapturedAmountError,
  DualControlViolationError,
  ValidationError,
} from '../src/errors.js';

describe('Payment Core Error Taxonomy', () => {
  it('PaymentCoreError formats JSON with structured payload', () => {
    const err = new PaymentCoreError(
      'VALIDATION_ERROR',
      'Test error message',
      400,
      { field: 'amount' }
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PaymentCoreError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.httpStatus).toBe(400);

    const json = err.toJSON();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Test error message');
    expect(json.error.details).toEqual({ field: 'amount' });
    expect(typeof json.error.timestamp).toBe('string');
  });

  it('all specific domain errors inherit properly with correct codes and status codes', () => {
    const invMoney = new InvalidMoneyAmountError('Bad money');
    expect(invMoney.code).toBe('INVALID_MONEY_AMOUNT');
    expect(invMoney.httpStatus).toBe(400);

    const negAmt = new NegativeAmountError();
    expect(negAmt.code).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(negAmt.httpStatus).toBe(400);

    const floatErr = new FloatingPointArithmeticError();
    expect(floatErr.code).toBe('FLOATING_POINT_ARITHMETIC_PROHIBITED');
    expect(floatErr.httpStatus).toBe(400);

    const currErr = new InvalidCurrencyError('USD');
    expect(currErr.code).toBe('INVALID_CURRENCY');
    expect(currErr.httpStatus).toBe(400);

    const transErr = new InvalidStateTransitionError('CREATED', 'COMPLETED');
    expect(transErr.code).toBe('INVALID_STATE_TRANSITION');
    expect(transErr.httpStatus).toBe(409);

    const termErr = new TerminalStateError('FAILED', 'PENDING');
    expect(termErr.code).toBe('TERMINAL_STATE_IMMUTABLE');
    expect(termErr.httpStatus).toBe(409);

    const optLock = new OptimisticLockError(1, 2, 'pay_01');
    expect(optLock.code).toBe('CONCURRENCY_CONFLICT_VERSION_MISMATCH');
    expect(optLock.httpStatus).toBe(409);

    const refExceed = new RefundExceedsCapturedAmountError(150n, 100n, 100n);
    expect(refExceed.code).toBe('REFUND_EXCEEDS_CAPTURED_AMOUNT');
    expect(refExceed.httpStatus).toBe(422);

    const dualControl = new DualControlViolationError('user_01');
    expect(dualControl.code).toBe('DUAL_CONTROL_VIOLATION');
    expect(dualControl.httpStatus).toBe(403);

    const valErr = new ValidationError('Bad input');
    expect(valErr.code).toBe('VALIDATION_ERROR');
    expect(valErr.httpStatus).toBe(400);
  });
});

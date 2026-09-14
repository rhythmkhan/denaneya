/**
 * DenaNeya Financial Domain Error Taxonomy
 */

export type PaymentCoreErrorCode =
  | 'INVALID_MONEY_AMOUNT'
  | 'NEGATIVE_AMOUNT_NOT_ALLOWED'
  | 'FLOATING_POINT_ARITHMETIC_PROHIBITED'
  | 'INVALID_CURRENCY'
  | 'INVALID_STATE_TRANSITION'
  | 'TERMINAL_STATE_IMMUTABLE'
  | 'CONCURRENCY_CONFLICT_VERSION_MISMATCH'
  | 'REFUND_EXCEEDS_CAPTURED_AMOUNT'
  | 'DUAL_CONTROL_VIOLATION'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_CANCELLED'
  | 'VALIDATION_ERROR';

export interface PaymentCoreErrorDetails {
  [key: string]: unknown;
}

export class PaymentCoreError extends Error {
  readonly code: PaymentCoreErrorCode;
  readonly httpStatus: number;
  readonly details?: PaymentCoreErrorDetails;
  readonly timestamp: string;

  constructor(
    code: PaymentCoreErrorCode,
    message: string,
    httpStatus = 400,
    details?: PaymentCoreErrorDetails
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        code: this.code,
        message: this.message,
        httpStatus: this.httpStatus,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

export class InvalidMoneyAmountError extends PaymentCoreError {
  constructor(message: string, details?: PaymentCoreErrorDetails) {
    super('INVALID_MONEY_AMOUNT', message, 400, details);
  }
}

export class NegativeAmountError extends PaymentCoreError {
  constructor(
    message = 'Negative monetary amounts are not permitted in this context',
    details?: PaymentCoreErrorDetails
  ) {
    super('NEGATIVE_AMOUNT_NOT_ALLOWED', message, 400, details);
  }
}

export class FloatingPointArithmeticError extends PaymentCoreError {
  constructor(
    message = 'Floating-point arithmetic is strictly prohibited. Pass integer paisa (bigint) or exact decimal string.',
    details?: PaymentCoreErrorDetails
  ) {
    super('FLOATING_POINT_ARITHMETIC_PROHIBITED', message, 400, details);
  }
}

export class InvalidCurrencyError extends PaymentCoreError {
  constructor(currency: string, details?: PaymentCoreErrorDetails) {
    super(
      'INVALID_CURRENCY',
      `Unsupported currency '${currency}'. DenaNeya exclusively operates in 'BDT'.`,
      400,
      { currency, ...details }
    );
  }
}

export class InvalidStateTransitionError extends PaymentCoreError {
  constructor(
    fromState: string,
    toState: string,
    reason?: string,
    details?: PaymentCoreErrorDetails
  ) {
    const msg = `Illegal payment transition from '${fromState}' to '${toState}'${reason ? `: ${reason}` : ''}.`;
    super('INVALID_STATE_TRANSITION', msg, 409, { fromState, toState, reason, ...details });
  }
}

export class TerminalStateError extends PaymentCoreError {
  constructor(currentState: string, attemptedTarget: string, details?: PaymentCoreErrorDetails) {
    const msg = `State '${currentState}' is terminal and cannot transition to '${attemptedTarget}'.`;
    super('TERMINAL_STATE_IMMUTABLE', msg, 409, { currentState, attemptedTarget, ...details });
  }
}

export class OptimisticLockError extends PaymentCoreError {
  constructor(
    expectedVersion: number,
    actualVersion: number,
    paymentId: string,
    details?: PaymentCoreErrorDetails
  ) {
    const msg = `Optimistic concurrency conflict on payment '${paymentId}': expected version ${expectedVersion}, found ${actualVersion}.`;
    super('CONCURRENCY_CONFLICT_VERSION_MISMATCH', msg, 409, {
      expectedVersion,
      actualVersion,
      paymentId,
      ...details,
    });
  }
}

export class RefundExceedsCapturedAmountError extends PaymentCoreError {
  constructor(
    requestedPaisa: bigint,
    availablePaisa: bigint,
    capturedPaisa: bigint,
    details?: PaymentCoreErrorDetails
  ) {
    const msg = `Refund amount (${requestedPaisa} paisa) exceeds available refundable balance (${availablePaisa} of ${capturedPaisa} captured paisa).`;
    super('REFUND_EXCEEDS_CAPTURED_AMOUNT', msg, 422, {
      requestedPaisa: requestedPaisa.toString(),
      availablePaisa: availablePaisa.toString(),
      capturedPaisa: capturedPaisa.toString(),
      ...details,
    });
  }
}

export class DualControlViolationError extends PaymentCoreError {
  constructor(operatorId: string, details?: PaymentCoreErrorDetails) {
    const msg = `Maker-Checker dual-control violation: operator '${operatorId}' cannot approve their own review case.`;
    super('DUAL_CONTROL_VIOLATION', msg, 403, { operatorId, ...details });
  }
}

export class ValidationError extends PaymentCoreError {
  constructor(message: string, details?: PaymentCoreErrorDetails) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

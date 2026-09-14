/**
 * DenaNeya Ledger Financial Domain Error Taxonomy
 */

export class LedgerError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnbalancedLedgerEntryError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_UNBALANCED_ENTRY', context);
  }
}

export class InvalidLedgerAmountError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_INVALID_AMOUNT', context);
  }
}

export class InvalidLedgerEntryError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_INVALID_ENTRY', context);
  }
}

export class AccountNotFoundError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_ACCOUNT_NOT_FOUND', context);
  }
}

export class InsufficientBalanceError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_INSUFFICIENT_BALANCE', context);
  }
}

export class PaymentNotFoundError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SETTLEMENT_PAYMENT_NOT_FOUND', context);
  }
}

export class InvalidPaymentStateTransitionError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SETTLEMENT_INVALID_STATE_TRANSITION', context);
  }
}

export class ProviderTransactionAlreadyConsumedError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SETTLEMENT_PROVIDER_TX_ALREADY_CONSUMED', context);
  }
}

export class PaymentAlreadySettledConflictError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SETTLEMENT_ALREADY_SETTLED_CONFLICT', context);
  }
}

export class DuplicateTransactionError extends LedgerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LEDGER_DUPLICATE_TRANSACTION', context);
  }
}

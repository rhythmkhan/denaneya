export class ReconciliationError extends Error {
  constructor(message: string, public readonly code: string = 'RECONCILIATION_ERROR') {
    super(message);
    this.name = 'ReconciliationError';
  }
}

export class StatementParsingError extends ReconciliationError {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message, 'STATEMENT_PARSING_ERROR');
    this.name = 'StatementParsingError';
  }
}

export class AutoHealError extends ReconciliationError {
  constructor(message: string, public readonly paymentId?: string) {
    super(message, 'AUTO_HEAL_ERROR');
    this.name = 'AutoHealError';
  }
}

/**
 * DenaNeya Fraud Engine Domain Error Taxonomy
 */

export class FraudEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DualControlViolationError extends FraudEngineError {
  constructor(
    public readonly makerId: string,
    public readonly checkerId: string
  ) {
    super(
      `Dual-control invariant violated: Approver 2 (checker: ${checkerId}) cannot be the same user as Approver 1 (maker: ${makerId})`
    );
  }
}

export class InvalidReviewStateTransitionError extends FraudEngineError {
  constructor(
    public readonly currentState: string,
    public readonly attemptedAction: string
  ) {
    super(
      `Invalid review state transition: Cannot perform action '${attemptedAction}' when case is in state '${currentState}'`
    );
  }
}

export class InstantBlockError extends FraudEngineError {
  constructor(
    public readonly ruleId: string,
    message: string
  ) {
    super(`Instant block triggered by rule '${ruleId}': ${message}`);
  }
}

export class UnauthorizedReviewerError extends FraudEngineError {
  constructor(
    public readonly actorId: string,
    message = 'Actor is not authorized to review this case'
  ) {
    super(`Unauthorized reviewer '${actorId}': ${message}`);
  }
}

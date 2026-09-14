/**
 * @denaneya/payment-core Public API
 */

// Money & Currency
export { Paisa } from './money.js';

// State Machine & Transition Guards
export {
  VALID_PAYMENT_TRANSITIONS,
  isTerminalState,
  getAllowedTransitions,
  canTransition,
  validatePaymentTransition,
  assertValidPaymentTransition,
  applyPaymentTransition,
} from './state-machine.js';

// Zod Schemas & Inputs
export {
  bdPhoneRegex,
  phoneSchema,
  amountPaisaSchema,
  currencySchema,
  metadataSchema,
  paymentStatusSchema,
  providerEnumSchema,
  customerAddressSchema,
  customerSchema,
  createPaymentSchema,
  type CreatePaymentInput,
  createRefundSchema,
  type CreateRefundInput,
  createPaymentLinkSchema,
  type CreatePaymentLinkInput,
  invoiceItemSchema,
  createInvoiceSchema,
  type CreateInvoiceInput,
} from './schemas.js';

// Financial Domain Error Taxonomy
export {
  PaymentCoreError,
  type PaymentCoreErrorCode,
  type PaymentCoreErrorDetails,
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
} from './errors.js';

// Types & Contracts
export type {
  Currency,
  PaymentState,
  TerminalPaymentState,
  PaymentTransitionContext,
  TransitionValidationResult,
  PaymentRecord,
  FormattedBDTOptions,
} from './types.js';

export { PAYMENT_STATES, TERMINAL_STATES } from './types.js';

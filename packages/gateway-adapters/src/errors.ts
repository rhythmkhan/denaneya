import type { GatewayProvider } from './types.js';
import { sanitizeCredentials, sanitizeString } from './utils/sanitize.js';

export const GATEWAY_ERROR_CODES = [
  'AUTHENTICATION_FAILED',
  'INVALID_REQUEST',
  'PAYMENT_DECLINED',
  'INSUFFICIENT_FUNDS',
  'EXPIRED_SESSION',
  'TRANSACTION_NOT_FOUND',
  'DUPLICATE_TRANSACTION',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'SIGNATURE_VERIFICATION_FAILED',
  'REFUND_EXCEEDS_AMOUNT',
  'REFUND_NOT_ALLOWED',
  'NETWORK_TIMEOUT',
  'GATEWAY_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_GATEWAY_ERROR',
  'CONFIGURATION_ERROR',
] as const;

export type GatewayErrorCode = (typeof GATEWAY_ERROR_CODES)[number];

export interface GatewayErrorOptions {
  provider: GatewayProvider;
  code: GatewayErrorCode;
  message: string;
  httpStatus?: number;
  rawResponse?: unknown;
  isRetryable?: boolean;
  cause?: Error;
}

export class GatewayError extends Error {
  readonly provider: GatewayProvider;
  readonly code: GatewayErrorCode;
  readonly httpStatus: number;
  readonly rawResponse?: unknown;
  readonly isRetryable: boolean;

  constructor(options: GatewayErrorOptions) {
    const sanitizedMsg = sanitizeString(options.message);
    super(`[${options.provider}] ${options.code}: ${sanitizedMsg}`);
    this.name = 'GatewayError';
    this.provider = options.provider;
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? this.defaultHttpStatus(options.code);
    this.rawResponse =
      options.rawResponse !== undefined ? sanitizeCredentials(options.rawResponse) : undefined;
    this.isRetryable = options.isRetryable ?? this.determineRetryable(options.code);
    if (options.cause) {
      (this as any).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toSanitizedJSON(): Record<string, unknown> {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      isRetryable: this.isRetryable,
      rawResponse: this.rawResponse,
    };
  }

  private determineRetryable(code: GatewayErrorCode): boolean {
    return (
      code === 'NETWORK_TIMEOUT' ||
      code === 'GATEWAY_UNAVAILABLE' ||
      code === 'RATE_LIMIT_EXCEEDED' ||
      code === 'INTERNAL_GATEWAY_ERROR'
    );
  }

  private defaultHttpStatus(code: GatewayErrorCode): number {
    switch (code) {
      case 'AUTHENTICATION_FAILED':
      case 'CONFIGURATION_ERROR':
        return 500;
      case 'INVALID_REQUEST':
      case 'AMOUNT_MISMATCH':
      case 'CURRENCY_MISMATCH':
      case 'REFUND_EXCEEDS_AMOUNT':
      case 'REFUND_NOT_ALLOWED':
        return 400;
      case 'SIGNATURE_VERIFICATION_FAILED':
        return 401;
      case 'PAYMENT_DECLINED':
      case 'INSUFFICIENT_FUNDS':
      case 'EXPIRED_SESSION':
      case 'DUPLICATE_TRANSACTION':
        return 422;
      case 'TRANSACTION_NOT_FOUND':
        return 404;
      case 'RATE_LIMIT_EXCEEDED':
        return 429;
      case 'NETWORK_TIMEOUT':
        return 504;
      case 'GATEWAY_UNAVAILABLE':
        return 503;
      case 'INTERNAL_GATEWAY_ERROR':
      default:
        return 502;
    }
  }
}
import { describe, it, expect } from 'vitest';
import { GatewayError, GATEWAY_ERROR_CODES, type GatewayErrorCode } from '../src/errors.js';
import { sanitizeCredentials } from '../src/utils/sanitize.js';

describe('Gateway Errors & Error Taxonomy', () => {
  it('instantiates GatewayError with correct properties and default retryable flags', () => {
    const timeoutErr = new GatewayError({
      provider: 'SSLCOMMERZ',
      code: 'NETWORK_TIMEOUT',
      message: 'Request timed out after 15000ms',
    });

    expect(timeoutErr.provider).toBe('SSLCOMMERZ');
    expect(timeoutErr.code).toBe('NETWORK_TIMEOUT');
    expect(timeoutErr.httpStatus).toBe(504);
    expect(timeoutErr.isRetryable).toBe(true);
    expect(timeoutErr.message).toContain('NETWORK_TIMEOUT: Request timed out');

    const authErr = new GatewayError({
      provider: 'BKASH',
      code: 'AUTHENTICATION_FAILED',
      message: 'Invalid app secret',
    });

    expect(authErr.isRetryable).toBe(false);
    expect(authErr.httpStatus).toBe(500);

    const declinedErr = new GatewayError({
      provider: 'NAGAD',
      code: 'PAYMENT_DECLINED',
      message: 'Insufficient balance',
    });

    expect(declinedErr.isRetryable).toBe(false);
    expect(declinedErr.httpStatus).toBe(422);

    const rateLimitErr = new GatewayError({
      provider: 'SHURJOPAY',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit hit',
    });
    expect(rateLimitErr.isRetryable).toBe(true);
    expect(rateLimitErr.httpStatus).toBe(429);

    const refundNotAllowedErr = new GatewayError({
      provider: 'AAMARPAY',
      code: 'REFUND_NOT_ALLOWED',
      message: 'No refund API',
    });
    expect(refundNotAllowedErr.isRetryable).toBe(false);
    expect(refundNotAllowedErr.httpStatus).toBe(400);

    // Cause propagation
    const originalError = new Error('Underlying error');
    const causedErr = new GatewayError({
      provider: 'MOCK',
      code: 'INTERNAL_GATEWAY_ERROR',
      message: 'Internal error',
      cause: originalError,
    });
    expect((causedErr as any).cause).toBe(originalError);
    expect(causedErr.isRetryable).toBe(true);
    expect(causedErr.httpStatus).toBe(502);
  });

  it('covers all error codes in taxonomy with their default HTTP statuses and retryability', () => {
    expect(GATEWAY_ERROR_CODES.length).toBe(17);

    const expectedStatuses: Record<GatewayErrorCode, number> = {
      AUTHENTICATION_FAILED: 500,
      CONFIGURATION_ERROR: 500,
      INVALID_REQUEST: 400,
      AMOUNT_MISMATCH: 400,
      CURRENCY_MISMATCH: 400,
      REFUND_EXCEEDS_AMOUNT: 400,
      REFUND_NOT_ALLOWED: 400,
      SIGNATURE_VERIFICATION_FAILED: 401,
      PAYMENT_DECLINED: 422,
      INSUFFICIENT_FUNDS: 422,
      EXPIRED_SESSION: 422,
      DUPLICATE_TRANSACTION: 422,
      TRANSACTION_NOT_FOUND: 404,
      RATE_LIMIT_EXCEEDED: 429,
      NETWORK_TIMEOUT: 504,
      GATEWAY_UNAVAILABLE: 503,
      INTERNAL_GATEWAY_ERROR: 502,
    };

    for (const code of GATEWAY_ERROR_CODES) {
      const err = new GatewayError({
        provider: 'MOCK',
        code,
        message: `Testing code ${code}`,
      });
      expect(err.httpStatus).toBe(expectedStatuses[code]);
    }
  });

  it('redacts sensitive credentials from objects, arrays, and primitives', () => {
    // Null / non-objects
    expect(sanitizeCredentials(null)).toBeNull();
    expect(sanitizeCredentials(undefined)).toBeUndefined();
    expect(sanitizeCredentials('plain-string')).toBe('plain-string');
    expect(sanitizeCredentials(12345)).toBe(12345);

    // Array of objects
    const arrayInput = [
      { password: 'secret_password_1', id: '1' },
      { id_token: 'jwt_token_123', name: 'user' },
    ];
    const sanitizedArray = sanitizeCredentials(arrayInput);
    expect(sanitizedArray[0].password).toBe('***REDACTED***');
    expect(sanitizedArray[0].id).toBe('1');
    expect(sanitizedArray[1].id_token).toBe('***REDACTED***');
    expect(sanitizedArray[1].name).toBe('user');

    // Deeply nested objects
    const raw = {
      storeId: 'test_store',
      storePassword: 'super_secret_password',
      appSecret: 'secret_123',
      nested: {
        token: 'bearer_token_abc',
        publicField: 'safe_value',
        deeper: {
          authorization: 'Bearer xyz',
          other: 999,
        },
      },
    };

    const sanitized = sanitizeCredentials(raw);
    expect(sanitized.storeId).toBe('test_store');
    expect(sanitized.storePassword).toBe('***REDACTED***');
    expect(sanitized.appSecret).toBe('***REDACTED***');
    expect(sanitized.nested.token).toBe('***REDACTED***');
    expect(sanitized.nested.publicField).toBe('safe_value');
    expect(sanitized.nested.deeper.authorization).toBe('***REDACTED***');
    expect(sanitized.nested.deeper.other).toBe(999);
  });
});
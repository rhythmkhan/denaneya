import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { jsonResponse } from './response';
import { PaymentCoreError } from '@denaneya/payment-core';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly requestId: string = 'req_unknown',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleRouteError(err: unknown, requestId: string): NextResponse {
  // 1. Explicit ApiError
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {
      'X-Request-Id': err.requestId || requestId,
    };

    if (err.statusCode === 429) {
      const retryAfter = err.details?.retryAfterSeconds;
      headers['Retry-After'] = retryAfter !== undefined ? String(retryAfter) : '60';
    }

    return jsonResponse(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId: err.requestId || requestId,
        },
      },
      {
        status: err.statusCode,
        headers,
      }
    );
  }

  // 1b. PostgreSQL 23505 Unique Constraint on Idempotency Key
  const errCode = (err as any)?.code;
  const errMsg = String((err as any)?.message || '');
  if (
    errCode === '23505' ||
    errMsg.includes('idx_payments_merchant_idempotency') ||
    errMsg.includes('idx_refunds_merchant_idempotency') ||
    errMsg.includes('duplicate key value violates unique constraint')
  ) {
    return jsonResponse(
      {
        idempotencyConflict: true,
        message: 'Concurrent request conflict resolved via idempotency key.',
      },
      {
        status: 200,
        headers: {
          'Idempotent-Replayed': 'true',
          'X-Request-Id': requestId,
        },
      }
    );
  }

  // 2. Zod Schema Validation Errors
  if (err instanceof ZodError) {
    return jsonResponse(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload schema.',
          details: {
            issues: err.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          requestId,
        },
      },
      { status: 422 }
    );
  }

  // 3. Domain Errors from @denaneya/payment-core
  if (err instanceof PaymentCoreError) {
    return jsonResponse(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details as Record<string, unknown>,
          requestId,
        },
      },
      { status: 422 }
    );
  }

  // 4. Fallback Internal Server Error
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  return jsonResponse(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
        requestId,
      },
    },
    { status: 500 }
  );
}

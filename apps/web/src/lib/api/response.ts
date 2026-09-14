import { NextResponse } from 'next/server';
import { jsonReplacer } from '@denaneya/observability';

/**
 * Creates a standard JSON response that safely serializes BigInt primitives as strings.
 */
export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, jsonReplacer);
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new NextResponse(body, {
    ...init,
    headers,
  });
}

import { NextRequest } from 'next/server';
import { defaultRateLimiter, RATE_LIMIT_RULES, type RateLimitRule } from '@denaneya/security';
import { ApiError } from './errors';

export async function checkRateLimit(
  request: NextRequest,
  identifier: string,
  rule: RateLimitRule = RATE_LIMIT_RULES.PAYMENT_API
): Promise<Record<string, string>> {
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '127.0.0.1';
  const key = `ratelimit:${rule.name}:${identifier || clientIp}`;

  const result = await defaultRateLimiter.check(key, rule);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
    const requestId = request.headers.get('x-request-id') || 'req_ratelimit';
    throw new ApiError(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded. Please retry in ${result.retryAfterSeconds} seconds.`,
      429,
      requestId,
      { retryAfterSeconds: result.retryAfterSeconds, penaltyMultiplier: result.penaltyMultiplier }
    );
  }

  return headers;
}

export function getRateLimiter() {
  return defaultRateLimiter;
}

export async function resetRateLimit(
  identifier: string,
  rule: RateLimitRule = RATE_LIMIT_RULES.PAYMENT_API
): Promise<void> {
  const key = `ratelimit:${rule.name}:${identifier}`;
  await defaultRateLimiter.reset(key);
}

import { GatewayError } from '../errors.js';
import type { GatewayProvider } from '../types.js';

export interface HttpRequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Robust fetch wrapper with timeout, 5xx error interception, and standardized GatewayError handling.
 */
export async function fetchWithTimeout(
  url: string,
  options: HttpRequestOptions,
  provider: GatewayProvider
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    // 1. Upstream gateway timeout (HTTP 504)
    if (response.status === 504) {
      throw new GatewayError({
        provider,
        code: 'NETWORK_TIMEOUT',
        message: `Upstream gateway ${provider} gateway timeout (HTTP 504) on ${url}`,
        httpStatus: 504,
        isRetryable: true,
      });
    }

    // 2. Upstream gateway server errors (HTTP 500, 502, 503, etc.)
    if (response.status >= 500) {
      throw new GatewayError({
        provider,
        code: 'GATEWAY_UNAVAILABLE',
        message: `Upstream gateway ${provider} returned HTTP ${response.status} on ${url}`,
        httpStatus: 502,
        isRetryable: true,
      });
    }

    // 3. Upstream rate limit (HTTP 429)
    if (response.status === 429) {
      throw new GatewayError({
        provider,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Upstream gateway ${provider} rate limited request (HTTP 429) on ${url}`,
        httpStatus: 429,
        isRetryable: true,
      });
    }

    return response;
  } catch (err: any) {
    if (err instanceof GatewayError) {
      throw err;
    }

    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new GatewayError({
        provider,
        code: 'NETWORK_TIMEOUT',
        message: `HTTP request to ${url} timed out after ${timeoutMs}ms`,
        httpStatus: 504,
        isRetryable: true,
        cause: err,
      });
    }

    throw new GatewayError({
      provider,
      code: 'GATEWAY_UNAVAILABLE',
      message: `Failed to connect to gateway upstream (${url}): ${err.message}`,
      httpStatus: 502,
      isRetryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses JSON response safely. If upstream returned HTML or malformed/truncated JSON,
 * throws a retryable GatewayError (or returns optional fallback if specified).
 */
export async function parseJsonResponse<T = any>(
  response: Response,
  provider: GatewayProvider,
  fallback?: T
): Promise<T> {
  const text = await response.text();

  // Detect HTML error or maintenance pages
  const isHtml =
    text.trim().startsWith('<') ||
    (response.headers?.get?.('content-type') || '').includes('text/html');

  if (isHtml) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new GatewayError({
      provider,
      code: 'GATEWAY_UNAVAILABLE',
      message: `Upstream gateway ${provider} returned HTML response instead of JSON`,
      httpStatus: 502,
      isRetryable: true,
      rawResponse: text.slice(0, 500),
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new GatewayError({
      provider,
      code: 'GATEWAY_UNAVAILABLE',
      message: `Failed to parse upstream ${provider} JSON: ${err.message}`,
      httpStatus: 502,
      isRetryable: true,
      rawResponse: text.slice(0, 500),
    });
  }
}
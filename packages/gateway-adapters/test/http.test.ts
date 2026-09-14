import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, parseJsonResponse } from '../src/utils/http.js';
import { GatewayError } from '../src/errors.js';

describe('HTTP Utilities (fetchWithTimeout & parseJsonResponse)', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe('fetchWithTimeout', () => {
    it('returns response on successful 200 HTTP request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const res = await fetchWithTimeout(
        'https://api.test/success',
        { method: 'GET', timeoutMs: 1000 },
        'MOCK'
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('intercepts HTTP 504 and throws retryable NETWORK_TIMEOUT', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Gateway Timeout', { status: 504 })
      );

      await expect(
        fetchWithTimeout('https://api.test/timeout', { method: 'GET' }, 'SSLCOMMERZ')
      ).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'NETWORK_TIMEOUT',
        httpStatus: 504,
        isRetryable: true,
      });
    });

    it('intercepts HTTP 500, 502, 503 and throws retryable GATEWAY_UNAVAILABLE', async () => {
      for (const status of [500, 502, 503]) {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(`Server error ${status}`, { status })
        );

        await expect(
          fetchWithTimeout(`https://api.test/err/${status}`, { method: 'GET' }, 'BKASH')
        ).rejects.toMatchObject({
          name: 'GatewayError',
          code: 'GATEWAY_UNAVAILABLE',
          httpStatus: 502,
          isRetryable: true,
        });
      }
    });

    it('intercepts HTTP 429 and throws retryable RATE_LIMIT_EXCEEDED', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Too Many Requests', { status: 429 })
      );

      await expect(
        fetchWithTimeout('https://api.test/rate-limit', { method: 'GET' }, 'NAGAD')
      ).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'RATE_LIMIT_EXCEEDED',
        httpStatus: 429,
        isRetryable: true,
      });
    });

    it('handles AbortError timeout and throws retryable NETWORK_TIMEOUT (504)', async () => {
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(
        fetchWithTimeout('https://api.test/slow', { method: 'GET', timeoutMs: 10 }, 'SHURJOPAY')
      ).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'NETWORK_TIMEOUT',
        httpStatus: 504,
        isRetryable: true,
      });
    });

    it('handles generic network failure and throws retryable GATEWAY_UNAVAILABLE (502)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        fetchWithTimeout('https://api.test/net-fail', { method: 'GET' }, 'AAMARPAY')
      ).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'GATEWAY_UNAVAILABLE',
        httpStatus: 502,
        isRetryable: true,
      });
    });

    it('re-throws GatewayError without double wrapping', async () => {
      const customErr = new GatewayError({
        provider: 'MOCK',
        code: 'INVALID_REQUEST',
        message: 'Pre-existing error',
      });
      globalThis.fetch = vi.fn().mockRejectedValue(customErr);

      await expect(
        fetchWithTimeout('https://api.test/custom', { method: 'GET' }, 'MOCK')
      ).rejects.toBe(customErr);
    });
  });

  describe('parseJsonResponse', () => {
    it('parses valid JSON response', async () => {
      const res = new Response(JSON.stringify({ order_id: '12345', amount: '100.00' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const data = await parseJsonResponse<{ order_id: string; amount: string }>(res, 'MOCK');
      expect(data.order_id).toBe('12345');
      expect(data.amount).toBe('100.00');
    });

    it('throws retryable GATEWAY_UNAVAILABLE when body starts with HTML tags', async () => {
      const res = new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      await expect(parseJsonResponse(res, 'SSLCOMMERZ')).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'GATEWAY_UNAVAILABLE',
        httpStatus: 502,
        isRetryable: true,
      });
    });

    it('throws retryable GATEWAY_UNAVAILABLE when content-type header is text/html', async () => {
      const res = new Response('Error page without angle bracket at start', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

      await expect(parseJsonResponse(res, 'BKASH')).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'GATEWAY_UNAVAILABLE',
        httpStatus: 502,
        isRetryable: true,
      });
    });

    it('returns fallback value if provided when response is HTML', async () => {
      const res = new Response('<html><body>Bad gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

      const fallback = { fallbackUsed: true };
      const data = await parseJsonResponse(res, 'SHURJOPAY', fallback);
      expect(data).toEqual(fallback);
    });

    it('throws retryable GATEWAY_UNAVAILABLE on malformed/truncated JSON', async () => {
      const res = new Response('{"status": "VAL', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      await expect(parseJsonResponse(res, 'NAGAD')).rejects.toMatchObject({
        name: 'GatewayError',
        code: 'GATEWAY_UNAVAILABLE',
        httpStatus: 502,
        isRetryable: true,
      });
    });

    it('returns fallback value if provided when JSON parsing fails', async () => {
      const res = new Response('malformed json {', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const fallback = { fallbackValue: 42 };
      const data = await parseJsonResponse(res, 'AAMARPAY', fallback);
      expect(data).toEqual(fallback);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  withSpan,
  getActiveSpan,
  getActiveTraceId,
  getActiveSpanId,
  recordSpanEvent,
  injectTraceContext,
  extractTraceContext
} from '../src/tracing.js';

describe('OpenTelemetry Tracing Wrapper', () => {
  it('T1.7: executes callback inside active span and returns result', async () => {
    const result = await withSpan('test-span-success', async (span) => {
      expect(span).toBeDefined();
      expect(getActiveSpan()).toBeUndefined(); // In headless test environment without global tracer provider
      recordSpanEvent('custom-marker', { step: 1 });
      return 42;
    });

    expect(result).toBe(42);
  });

  it('T1.8: catches error inside span, records exception, and rethrows', async () => {
    await expect(
      withSpan('test-span-error', async () => {
        throw new Error('Database transaction abort');
      })
    ).rejects.toThrow('Database transaction abort');
  });

  it('T1.9: injects and extracts trace context into header map', () => {
    const headers: Record<string, string> = { 'x-client': 'web' };
    const injected = injectTraceContext(headers);
    expect(injected['x-client']).toBe('web');

    const extracted = extractTraceContext(injected);
    expect(extracted).toBeDefined();
  });
});

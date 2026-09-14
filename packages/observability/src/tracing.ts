import {
  trace,
  context,
  propagation,
  type Span,
  SpanStatusCode,
  type SpanOptions,
  type Tracer,
  type Context
} from '@opentelemetry/api';

const TRACER_NAME = 'denaneya-platform';
const TRACER_VERSION = '1.0.0';

export function getTracer(name = TRACER_NAME, version = TRACER_VERSION): Tracer {
  return trace.getTracer(name, version);
}

export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

export function getActiveTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const traceId = span.spanContext().traceId;
  return traceId === '00000000000000000000000000000000' ? undefined : traceId;
}

export function getActiveSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const spanId = span.spanContext().spanId;
  return spanId === '0000000000000000' ? undefined : spanId;
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options || {}, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

export function recordSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

export function injectTraceContext(headers: Record<string, string>): Record<string, string> {
  const output = { ...headers };
  propagation.inject(context.active(), output, {
    set: (carrier, key, value) => {
      carrier[key] = value;
    },
  });
  return output;
}

export function extractTraceContext(headers: Record<string, string>): Context {
  return propagation.extract(context.active(), headers, {
    get: (carrier, key) => carrier[key],
    keys: (carrier) => Object.keys(carrier),
  });
}

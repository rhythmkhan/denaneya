import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogContext, LoggerOptions, LogSeverity, StructuredLogEntry, SerializedError } from './types.js';
import { getActiveTraceId, getActiveSpanId } from './tracing.js';

const SEVERITY_WEIGHTS: Record<LogSeverity, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const DEFAULT_REDACT_KEYS = new Set([
  'password',
  'secret',
  'apikey',
  'api_key',
  'token',
  'authorization',
  'cookie',
  'pin',
  'otp',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'master_encryption_key',
  'dek',
  'kek',
  'privatekey',
  'private_key',
]);

export const asyncLogStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return asyncLogStorage.getStore() || {};
}

export function withLogContext<T>(context: LogContext, fn: () => T): T {
  const current = asyncLogStorage.getStore() || {};
  return asyncLogStorage.run({ ...current, ...context }, fn);
}

/**
 * Standard JSON replacer for BigInt serialization defense.
 * Converts BigInt primitives to lossless string representations.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export class Logger {
  private service: string;
  private environment: string;
  private minLevel: LogSeverity;
  private enablePretty: boolean;
  private redactKeys: Set<string>;
  private sink: (line: string, level: LogSeverity) => void;
  private boundContext: LogContext;

  constructor(options: LoggerOptions = {}, boundContext: LogContext = {}) {
    this.service = options.service || process.env.SERVICE_NAME || 'denaneya-platform';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.minLevel = options.minLevel || (this.environment === 'production' ? 'info' : 'debug');
    this.enablePretty = options.enablePretty ?? (this.environment !== 'production');
    this.sink = options.sink || ((line, level) => {
      if (level === 'error' || level === 'fatal') {
        process.stderr.write(line + '\n');
      } else {
        process.stdout.write(line + '\n');
      }
    });
    this.redactKeys = new Set(
      (options.redactKeys || []).map(k => k.toLowerCase()).concat(Array.from(DEFAULT_REDACT_KEYS))
    );
    this.boundContext = boundContext;
  }

  public child(bindings: LogContext): Logger {
    return new Logger(
      {
        service: this.service,
        environment: this.environment,
        minLevel: this.minLevel,
        enablePretty: this.enablePretty,
        redactKeys: Array.from(this.redactKeys),
        sink: this.sink,
      },
      { ...this.boundContext, ...bindings }
    );
  }

  public trace(message: string, metadata?: Record<string, unknown>): void {
    this.log('trace', message, metadata);
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  public error(message: string, errorOrMeta?: Error | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (errorOrMeta instanceof Error) {
      this.log('error', message, metadata, errorOrMeta);
    } else {
      this.log('error', message, errorOrMeta);
    }
  }

  public fatal(message: string, errorOrMeta?: Error | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (errorOrMeta instanceof Error) {
      this.log('fatal', message, metadata, errorOrMeta);
    } else {
      this.log('fatal', message, errorOrMeta);
    }
  }

  private log(level: LogSeverity, message: string, metadata?: Record<string, unknown>, err?: Error): void {
    if (SEVERITY_WEIGHTS[level] < SEVERITY_WEIGHTS[this.minLevel]) {
      return;
    }

    const ambientContext = getLogContext();
    const effectiveContext = { ...ambientContext, ...this.boundContext };
    const traceId = effectiveContext.traceId || getActiveTraceId();
    const spanId = effectiveContext.spanId || getActiveSpanId();

    const entry: StructuredLogEntry = {
      ...effectiveContext,
      timestamp: new Date().toISOString(),
      level,
      message,
      service: (effectiveContext.service as string) || this.service,
      environment: (effectiveContext.environment as string) || this.environment,
      ...(traceId && { traceId }),
      ...(spanId && { spanId }),
    };

    if (err) {
      try {
        entry.error = this.serializeError(err);
      } catch (serializeErr) {
        let fallbackMessage = 'Failed to serialize error object';
        try {
          fallbackMessage = serializeErr instanceof Error ? serializeErr.message : String(serializeErr);
        } catch {
          fallbackMessage = 'Failed to serialize error object';
        }
        entry.error = {
          name: 'ErrorSerializationFailed',
          message: fallbackMessage,
        };
      }
    }

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        entry.metadata = this.sanitize(metadata) as Record<string, unknown>;
      } catch (sanitizeError) {
        entry.metadata = {
          _error: 'SanitizationFailed',
          _message: sanitizeError instanceof Error ? sanitizeError.message : String(sanitizeError),
        };
      }
    }

    if (this.enablePretty) {
      this.writePretty(entry);
    } else {
      this.sink(this.safeStringify(entry), level);
    }
  }

  /**
   * Serializes an Error instance safely:
   * - Traverses cause chains with cycle detection via active ancestor tracking (WeakSet)
   * - Bounds recursion with depth guard (maxDepth = 10, returning '[TruncatedError]')
   * - Protects every property access (name, message, stack, code, cause) with try/catch against throwing getters
   * - Sanitizes non-Error causes through this.sanitize()
   */
  private serializeError(
    err: Error,
    depth = 0,
    seen: WeakSet<object> = new WeakSet<object>(),
    maxDepth = 10
  ): SerializedError {
    if (!err || typeof err !== 'object') {
      return {
        name: 'Error',
        message: String(err ?? ''),
      };
    }

    let safeName = 'Error';
    try {
      safeName = typeof err.name === 'string' ? err.name : 'Error';
    } catch {
      safeName = 'Error';
    }

    if (seen.has(err)) {
      return {
        name: safeName,
        message: '[CircularError]',
      };
    }

    if (depth >= maxDepth) {
      return {
        name: safeName,
        message: '[TruncatedError]',
      };
    }

    seen.add(err);

    try {
      let message = '[UnreadableMessage]';
      try {
        message = typeof err.message === 'string' ? err.message : String(err.message ?? '');
      } catch {
        message = '[UnreadableMessage]';
      }

      let stack: string | undefined = undefined;
      try {
        stack = typeof err.stack === 'string' ? err.stack : undefined;
      } catch {
        stack = undefined;
      }

      let code: string | number | undefined = undefined;
      try {
        const rawCode = (err as unknown as { code?: unknown }).code;
        if (typeof rawCode === 'string' || typeof rawCode === 'number') {
          code = rawCode;
        }
      } catch {
        code = undefined;
      }

      let cause: unknown = undefined;
      try {
        const rawCause = (err as unknown as { cause?: unknown }).cause;
        if (rawCause !== undefined) {
          if (rawCause instanceof Error) {
            cause = this.serializeError(rawCause, depth + 1, seen, maxDepth);
          } else {
            cause = this.sanitize(rawCause);
          }
        }
      } catch {
        cause = '[UnreadableCause]';
      }

      const serialized: SerializedError = {
        name: safeName,
        message,
      };

      if (stack !== undefined) {
        serialized.stack = stack;
      }
      if (code !== undefined) {
        serialized.code = code;
      }
      if (cause !== undefined) {
        serialized.cause = cause;
      }

      return serialized;
    } finally {
      seen.delete(err);
    }
  }

  /**
   * Recursively sanitizes objects:
   * - Redacts sensitive security keys
   * - Converts BigInt to string (lossless integer minor units)
   * - Detects circular references via WeakSet active ancestor tracking (replaces with '[Circular]')
   * - Truncates excessively deep object trees (> 6 levels with '[Truncated]')
   * - Converts Dates to ISO strings, handles Sets, Maps, and Errors
   * - Defensively handles throwing property getters
   */
  private sanitize(
    obj: unknown,
    activeAncestors: WeakSet<object> = new WeakSet<object>(),
    depth = 0,
    maxDepth = 6
  ): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (depth >= maxDepth) {
      return '[Truncated]';
    }

    if (activeAncestors.has(obj)) {
      return '[Circular]';
    }

    activeAncestors.add(obj);

    try {
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      if (obj instanceof Error) {
        return this.serializeError(obj);
      }

      if (Array.isArray(obj)) {
        return obj.map(item => this.sanitize(item, activeAncestors, depth + 1, maxDepth));
      }

      if (obj instanceof Set) {
        return Array.from(obj).map(item => this.sanitize(item, activeAncestors, depth + 1, maxDepth));
      }

      if (obj instanceof Map) {
        const mapObj: Record<string, unknown> = {};
        for (const [k, v] of obj.entries()) {
          const keyStr = String(k);
          if (this.redactKeys.has(keyStr.toLowerCase())) {
            mapObj[keyStr] = '[REDACTED]';
          } else {
            mapObj[keyStr] = this.sanitize(v, activeAncestors, depth + 1, maxDepth);
          }
        }
        return mapObj;
      }

      const sanitized: Record<string, unknown> = {};
      for (const [key] of Object.entries(Object.getOwnPropertyDescriptors(obj))) {
        let value: unknown;
        try {
          value = (obj as Record<string, unknown>)[key];
        } catch {
          sanitized[key] = '[UnreadableProperty]';
          continue;
        }

        if (this.redactKeys.has(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value, activeAncestors, depth + 1, maxDepth);
        }
      }
      return sanitized;
    } finally {
      activeAncestors.delete(obj);
    }
  }

  /**
   * Safe JSON serializer that guarantees the logging pipeline will NEVER crash the process.
   * Employs jsonReplacer for BigInt handling and falls back gracefully upon unexpected serialization failures.
   */
  private safeStringify(data: unknown): string {
    try {
      return JSON.stringify(data, jsonReplacer);
    } catch (err) {
      try {
        return JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: '[LOG_SERIALIZATION_FAILED]',
          service: this.service,
          environment: this.environment,
          error: {
            name: err instanceof Error ? err.name : 'SerializationError',
            message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch {
        return `{"timestamp":"${new Date().toISOString()}","level":"error","message":"[LOG_SERIALIZATION_FAILED_FATAL]"}`;
      }
    }
  }

  private writePretty(entry: StructuredLogEntry): void {
    const levelColors: Record<LogSeverity, string> = {
      trace: '\x1b[90m',
      debug: '\x1b[34m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      fatal: '\x1b[35m',
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level] || '';
    const ctxParts: string[] = [];
    if (entry.correlationId) ctxParts.push(`corr=${entry.correlationId}`);
    if (entry.requestId) ctxParts.push(`req=${entry.requestId}`);
    if (entry.merchantId) ctxParts.push(`mrc=${entry.merchantId}`);
    if (entry.paymentId) ctxParts.push(`pay=${entry.paymentId}`);
    const ctxString = ctxParts.length > 0 ? ` [${ctxParts.join(' ')}]` : '';

    let out = `${entry.timestamp} ${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}${ctxString}`;
    if (entry.metadata) {
      out += `\n  Meta: ${this.safeStringify(entry.metadata)}`;
    }
    if (entry.error) {
      out += `\n  Error: ${entry.error.name}: ${entry.error.message}\n${entry.error.stack || ''}`;
    }
    this.sink(out, entry.level);
  }
}

export const logger = new Logger();

export type LogSeverity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  merchantId?: string;
  paymentId?: string;
  userId?: string;
  deviceId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
  environment?: string;
  [key: string]: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: unknown;
}

export interface StructuredLogEntry {
  timestamp: string; // ISO-8601 UTC
  level: LogSeverity;
  message: string;
  service: string;
  environment: string;
  correlationId?: string;
  requestId?: string;
  merchantId?: string;
  paymentId?: string;
  userId?: string;
  deviceId?: string;
  traceId?: string;
  spanId?: string;
  error?: SerializedError;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service?: string;
  environment?: string;
  minLevel?: LogSeverity;
  enablePretty?: boolean;
  redactKeys?: string[];
  sink?: (line: string, level: LogSeverity) => void;
}

export type HealthStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  timestamp: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface OverallHealth {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  components: Record<string, ComponentHealth>;
}

export interface HealthCheckOptions {
  isCritical?: boolean;
  timeoutMs?: number;
}

export type HealthCheckFn = () => Promise<{
  status?: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
}>;

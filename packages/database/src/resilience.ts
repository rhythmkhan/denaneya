/**
 * Resilient Connection Retry, Exponential Backoff, and Database Health Probe
 * for Neon Serverless PostgreSQL and In-Memory Fallback.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
  /** Initial delay before the first retry in milliseconds. Default: 100ms */
  initialDelayMs: number;
  /** Maximum delay cap between retries in milliseconds. Default: 3000ms */
  maxDelayMs: number;
  /** Exponential multiplier. Default: 2 */
  backoffFactor: number;
  /** Whether to apply random jitter (+/- 20%) to prevent thundering herds. Default: true */
  jitter: boolean;
  /** Callback fired on each retry attempt. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Custom filter to determine whether an error is transient and retryable. */
  isRetryable?: (error: unknown) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 3000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Common PostgreSQL and network transient error codes.
 */
const TRANSIENT_PG_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  // PostgreSQL error codes
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08P01', // protocol_violation
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '53400', // configuration_limit_exceeded
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

/**
 * Common transient error message fragments for Neon / PgBouncer / serverless Postgres.
 */
const TRANSIENT_MESSAGE_PATTERNS = [
  /connection\s+terminated/i,
  /connection\s+closed/i,
  /connection\s+refused/i,
  /connection\s+reset/i,
  /timeout/i,
  /timed\s+out/i,
  /wake\s*up/i,
  /compute\s+is\s+suspended/i,
  /endpoint\s+is\s+suspended/i,
  /endpoint\s+disabled/i,
  /neondberror/i,
  /websocket/i,
  /pool\s+is\s+(draining|closed)/i,
  /remaining\s+connection\s+slots\s+are\s+reserved/i,
  /server\s+closed\s+the\s+connection/i,
  /broken\s+pipe/i,
  /econnreset/i,
  /econnrefused/i,
  /slow\s+reconnect/i,
  /no\s+more\s+connections/i,
  /max_client_conn/i,
  /server\s+conn\s+crashed/i,
];

/**
 * Inspects an error to determine whether it is a transient connection or serverless wakeup error.
 */
export function isRetryableDatabaseError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Check code
    if (typeof err.code === 'string' && TRANSIENT_PG_ERROR_CODES.has(err.code.toUpperCase())) {
      return true;
    }

    // Check message
    const msg = typeof err.message === 'string' ? err.message : '';
    for (const pattern of TRANSIENT_MESSAGE_PATTERNS) {
      if (pattern.test(msg)) {
        return true;
      }
    }

    // Neon-specific error properties
    if (err.name === 'NeonDbError' || err.name === 'NeonHttpError') {
      const status = typeof err.status === 'number' ? err.status : 0;
      if (status === 503 || status === 504 || status === 429) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Executes an asynchronous operation with exponential backoff and jitter on transient errors.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > config.maxRetries) {
        throw error;
      }

      const retryCheck = config.isRetryable ?? isRetryableDatabaseError;
      if (!retryCheck(error)) {
        throw error;
      }

      // Calculate exponential backoff: initial * (factor ^ (attempt - 1))
      let delayMs = config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
      delayMs = Math.min(delayMs, config.maxDelayMs);

      // Add jitter: +/- 20%
      if (config.jitter) {
        const jitterMultiplier = 0.8 + Math.random() * 0.4;
        delayMs = Math.round(delayMs * jitterMultiplier);
      }

      if (config.onRetry) {
        config.onRetry(error, attempt, delayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Health Status categorization:
 * - 'UP': Fully operational, connected to PostgreSQL with low latency (<500ms).
 * - 'DEGRADED': Connected to PostgreSQL but high latency (>=500ms) or required connection retries.
 * - 'MOCK': Connected to resilient simulated in-memory storage (demo/test/fallback).
 * - 'DOWN': Critical failure, database is unreachable after all retries.
 */
export type DatabaseHealthStatus = 'UP' | 'DEGRADED' | 'MOCK' | 'DOWN';

export interface DatabaseHealthResult {
  status: DatabaseHealthStatus;
  latencyMs: number;
  timestamp: string;
  mode: 'neon-pooled' | 'direct' | 'mock';
  host?: string;
  message?: string;
  error?: string;
}

export interface HealthCheckOptions {
  /** Maximum acceptable latency in ms before status is marked DEGRADED. Default: 500ms */
  degradedThresholdMs?: number;
  /** Timeout in ms for the ping probe. Default: 5000ms */
  timeoutMs?: number;
  /** Number of retries for ping probe. Default: 1 */
  retries?: number;
}

/**
 * Probes a database client's connectivity and returns a standardized health assessment.
 */
export async function checkDatabaseHealth(
  client: any,
  options?: HealthCheckOptions
): Promise<DatabaseHealthResult> {
  const timestamp = new Date().toISOString();
  const degradedThreshold = options?.degradedThresholdMs ?? 500;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const retries = options?.retries ?? 1;

  // 1. If client is null, undefined, or flagged as mock/in-memory
  if (!client || client.isMock || client.mode === 'mock') {
    const start = Date.now();
    if (client && typeof client.execute === 'function') {
      try {
        await client.execute('SELECT 1');
      } catch {
        // in-memory client will not fail, but safe fallback
      }
    }
    const latencyMs = Date.now() - start;
    return {
      status: 'MOCK',
      latencyMs,
      timestamp,
      mode: 'mock',
      message: 'Running in simulated in-memory storage mode (DATABASE_URL unset or mock fallback enabled).',
    };
  }

  // 2. Real PostgreSQL client probe
  const mode = client.mode === 'direct' ? 'direct' : 'neon-pooled';
  const host = client.host || undefined;

  let attemptCount = 0;
  const start = Date.now();

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Database health ping timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    const pingPromise = retryWithBackoff(
      async () => {
        attemptCount++;
        // Execute ping query: SELECT 1
        if (typeof client.execute === 'function') {
          await client.execute('SELECT 1');
        } else if (client.$client && typeof client.$client.query === 'function') {
          await client.$client.query('SELECT 1');
        } else {
          throw new Error('Unsupported database client instance for ping check');
        }
      },
      {
        maxRetries: retries,
        initialDelayMs: 100,
        maxDelayMs: 1000,
      }
    );

    await Promise.race([pingPromise, timeoutPromise]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    });

    const latencyMs = Date.now() - start;

    const isDegraded = latencyMs >= degradedThreshold || attemptCount > 1;

    return {
      status: isDegraded ? 'DEGRADED' : 'UP',
      latencyMs,
      timestamp,
      mode,
      host,
      message: isDegraded
        ? `Database connected with elevated latency (${latencyMs}ms) or after ${attemptCount} attempts.`
        : `Database connection healthy (${latencyMs}ms).`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      status: 'DOWN',
      latencyMs,
      timestamp,
      mode,
      host,
      message: 'Database connection failed.',
      error: err?.message || String(err),
    };
  }
}

export { retryWithBackoff as withRetry };

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, type PoolConfig } from '@neondatabase/serverless';
import * as schema from './schema/index.js';
import { createInMemoryDbClient } from './in-memory.js';
import {
  checkDatabaseHealth,
  retryWithBackoff,
  type DatabaseHealthResult,
} from './resilience.js';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export interface DbPoolConfig {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface CreateDbClientOptions {
  /** Explicit connection string. Takes precedence over environment variables. */
  connectionString?: string;
  /** Direct compute URL (for migrations and DDL). */
  directUrl?: string;
  /** Pooled URL (for serverless edge and lambdas). */
  pooledUrl?: string;
  /** Whether to enforce pooled connection URL resolution. Default: true in serverless */
  pooled?: boolean;
  /** Resilient retry attempts on transient network drops. Default: 3 */
  maxRetries?: number;
  /**
   * Graceful fallback to resilient in-memory storage when DATABASE_URL is unset
   * or invalid in test/demo environments. Default: true.
   */
  fallbackToMemory?: boolean;
  /** Custom connection pool configurations */
  poolConfig?: DbPoolConfig;
}

/**
 * Validates whether a connection string possesses the correct PostgreSQL URI structure.
 */
export function validateConnectionString(url?: string | null): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed === 'undefined' || trimmed === 'null') {
    return false;
  }
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Checks if a PostgreSQL URL is routed through Neon's PgBouncer connection pooler.
 */
export function isNeonPooledUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes('-pooler') || url.includes(':6543') || url.includes('pooler=true');
}

/**
 * Transforms a Neon PostgreSQL connection URL into its direct compute unpooled variant.
 * Strips `-pooler` from host, switches port 6543 to 5432, and removes pooler params.
 */
export function toDirectNeonUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string' || !url.trim()) return undefined;
  const trimmed = url.trim();
  if (!validateConnectionString(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('-pooler')) {
      parsed.hostname = parsed.hostname.replace('-pooler', '');
    }
    if (parsed.port === '6543') {
      parsed.port = '5432';
    }
    parsed.searchParams.delete('pooler');
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Transforms a Neon PostgreSQL connection URL into its PgBouncer pooled variant.
 * Appends `-pooler` to the first host segment for neon.tech endpoints.
 */
export function toPooledNeonUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string' || !url.trim()) return undefined;
  const trimmed = url.trim();
  if (!validateConnectionString(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('.neon.tech') && !parsed.hostname.includes('-pooler')) {
      const parts = parsed.hostname.split('.');
      parts[0] = `${parts[0]}-pooler`;
      parsed.hostname = parts.join('.');
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Safely sanitizes database credentials from URL for logging and telemetry.
 */
export function sanitizeConnectionUrl(url?: string | null): string {
  if (!url) return 'unconfigured';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return 'invalid-url';
  }
}

/**
 * Extracts host from connection string.
 */
export function extractDatabaseHost(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the pooled database URL, prioritizing DATABASE_POOLED_URL then DATABASE_URL.
 */
export function getPooledUrl(): string | undefined {
  if (process.env.DATABASE_POOLED_URL?.trim()) {
    return process.env.DATABASE_POOLED_URL.trim();
  }
  const fallback = process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();
  if (!fallback) return undefined;
  if (!process.env.DATABASE_URL?.trim() && process.env.DIRECT_URL?.trim()) {
    return toPooledNeonUrl(fallback);
  }
  return fallback;
}

/**
 * Resolves the direct database compute URL, prioritizing DIRECT_URL then DATABASE_URL.
 * Automatically converts Neon pooled URLs to direct compute URLs to prevent PgBouncer DDL failures.
 */
export function getDirectUrl(): string | undefined {
  if (process.env.DIRECT_URL?.trim()) {
    return process.env.DIRECT_URL.trim();
  }
  const fallback = process.env.DATABASE_URL?.trim() || process.env.DATABASE_POOLED_URL?.trim();
  if (!fallback) return undefined;
  if (isNeonPooledUrl(fallback)) {
    return toDirectNeonUrl(fallback);
  }
  return fallback;
}

let cachedGlobalDb: DbClient | null = null;

/**
 * Resets global cached client instance (primarily for testing).
 */
export function resetGlobalDb(): void {
  cachedGlobalDb = null;
}

/**
 * Creates a production-grade Neon PostgreSQL serverless database client
 * with pooling, retry resilience, and in-memory fallback.
 */
export function createDbClient(optionsOrConnStr?: CreateDbClientOptions | string): DbClient {
  const opts: CreateDbClientOptions =
    typeof optionsOrConnStr === 'string'
      ? { connectionString: optionsOrConnStr }
      : optionsOrConnStr || {};

  const fallbackToMemory = opts.fallbackToMemory ?? true;
  const maxRetries = opts.maxRetries ?? 3;

  // Resolve target connection string
  let targetUrl = opts.connectionString;
  if (!targetUrl) {
    if (opts.pooled === false) {
      targetUrl = opts.directUrl || getDirectUrl();
    } else {
      targetUrl = opts.pooledUrl || getPooledUrl();
    }
  }

  // 1. If connection string is missing or invalid, execute graceful fallback
  if (!validateConnectionString(targetUrl)) {
    if (fallbackToMemory) {
      if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
        console.warn(
          `[DATABASE] Notice: DATABASE_URL is unset or invalid (${sanitizeConnectionUrl(
            targetUrl
          )}). Falling back to resilient in-memory simulated storage. App cold-start protected.`
        );
      }
      return createInMemoryDbClient();
    }
    throw new Error(
      `[DATABASE] Invalid or missing database connection string: ${sanitizeConnectionUrl(targetUrl)}`
    );
  }

  // 2. Configure production Neon Serverless Connection Pooler
  const isPooled = isNeonPooledUrl(targetUrl);
  const host = extractDatabaseHost(targetUrl);

  const poolOptions: PoolConfig = {
    connectionString: targetUrl,
    max:
      opts.poolConfig?.max ??
      (process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 10),
    idleTimeoutMillis:
      opts.poolConfig?.idleTimeoutMillis ??
      (process.env.DB_IDLE_TIMEOUT_MS ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) : 30_000),
    connectionTimeoutMillis:
      opts.poolConfig?.connectionTimeoutMillis ??
      (process.env.DB_CONNECT_TIMEOUT_MS ? parseInt(process.env.DB_CONNECT_TIMEOUT_MS, 10) : 10_000),
  };

  try {
    const pool = new Pool(poolOptions);

    // Decorate pool error listener to prevent unhandled process exit
    pool.on('error', (err: any) => {
      console.error('[DATABASE] Unexpected error on idle Neon pool client:', err?.message || err);
    });

    // Wrap pool.query with resilient exponential backoff retry on transient errors
    const originalPoolQuery = pool.query.bind(pool);
    pool.query = function (this: any, ...args: any[]): any {
      if (typeof args[args.length - 1] === 'function') {
        return (originalPoolQuery as any)(...args);
      }
      return retryWithBackoff(
        () => (originalPoolQuery as any)(...args),
        { maxRetries }
      );
    };

    // Wrap pool.connect with resilient exponential backoff retry on compute wakeups
    const originalPoolConnect = pool.connect.bind(pool);
    pool.connect = function (this: any, ...args: any[]): any {
      if (typeof args[0] === 'function') {
        return (originalPoolConnect as any)(...args);
      }
      return retryWithBackoff(
        async () => {
          const poolClient = await (originalPoolConnect as any)();
          const origClientQuery = poolClient.query.bind(poolClient);
          poolClient.query = function (this: any, ...clientArgs: any[]): any {
            if (typeof clientArgs[clientArgs.length - 1] === 'function') {
              return (origClientQuery as any)(...clientArgs);
            }
            return retryWithBackoff(
              () => (origClientQuery as any)(...clientArgs),
              { maxRetries }
            );
          };
          return poolClient;
        },
        { maxRetries }
      );
    };

    const client = drizzle(pool, { schema });

    // Attach diagnostic metadata and resilience utilities
    (client as any).isMock = false;
    (client as any).mode = isPooled ? 'neon-pooled' : 'direct';
    (client as any).host = host;
    (client as any).$client = pool;
    (client as any).maxRetries = maxRetries;
    (client as any).withRetry = <T>(op: () => Promise<T>) =>
      retryWithBackoff(op, { maxRetries });

    return client;
  } catch (err: any) {
    if (fallbackToMemory) {
      console.warn(
        `[DATABASE] Failed to initialize Neon connection pool (${err?.message}). Falling back to resilient in-memory storage.`
      );
      return createInMemoryDbClient();
    }
    throw err;
  }
}

/**
 * Creates a dedicated Direct URL client specifically for schema migrations and DDL tasks.
 */
export function createDirectDbClient(options?: CreateDbClientOptions): DbClient {
  return createDbClient({
    ...options,
    pooled: false,
    connectionString: options?.connectionString || options?.directUrl || getDirectUrl(),
  });
}

/**
 * Creates a dedicated Pooled URL client specifically for serverless Next.js edge and lambda handlers.
 */
export function createPooledDbClient(options?: CreateDbClientOptions): DbClient {
  return createDbClient({
    ...options,
    pooled: true,
    connectionString: options?.connectionString || options?.pooledUrl || getPooledUrl(),
  });
}

/**
 * Returns the global singleton DbClient instance. Never null.
 * Seamlessly transitions from in-memory fallback to live database if DATABASE_URL is set late.
 */
export function getDb(): DbClient {
  const currentUrl = getPooledUrl();
  const hasValidUrl = validateConnectionString(currentUrl);

  // If a mock client was previously cached on cold start, but now a valid DATABASE_URL is available, reconnect!
  if (cachedGlobalDb && (cachedGlobalDb as any).isMock && hasValidUrl) {
    cachedGlobalDb = null;
  }

  if (cachedGlobalDb) {
    return cachedGlobalDb;
  }
  cachedGlobalDb = createDbClient();
  return cachedGlobalDb;
}

/**
 * Default resilient database instance. Guaranteed non-null, cold-start resilient,
 * and dynamically routed to the active singleton.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    const active = getDb() as any;
    const val = active[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  },
  has(_target, prop) {
    return prop in (getDb() as any);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getDb() as any);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getDb() as any, prop);
  },
});

export {
  checkDatabaseHealth,
  retryWithBackoff,
  type DatabaseHealthResult,
};

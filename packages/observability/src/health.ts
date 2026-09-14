import type {
  HealthStatus,
  ComponentHealth,
  OverallHealth,
  HealthCheckOptions,
  HealthCheckFn
} from './types.js';

interface RegisteredCheck {
  name: string;
  checkFn: HealthCheckFn;
  isCritical: boolean;
  timeoutMs: number;
}

export class HealthCheckRegistry {
  private checks: Map<string, RegisteredCheck> = new Map();
  private startTime: number = Date.now();
  private version: string;

  constructor(version = '1.0.0') {
    this.version = version;
  }

  public register(name: string, checkFn: HealthCheckFn, options: HealthCheckOptions = {}): void {
    this.checks.set(name, {
      name,
      checkFn,
      isCritical: options.isCritical ?? true,
      timeoutMs: options.timeoutMs ?? 5000,
    });
  }

  public async run(): Promise<OverallHealth> {
    const timestamp = new Date().toISOString();
    const components: Record<string, ComponentHealth> = {};
    let hasDownCritical = false;
    let hasDegraded = false;

    const promises = Array.from(this.checks.values()).map(async (check) => {
      const start = Date.now();
      try {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<{ status: HealthStatus; message: string; details?: Record<string, unknown> }>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Check '${check.name}' timed out after ${check.timeoutMs}ms`)), check.timeoutMs);
        });

        const checkResult = await Promise.race([
          check.checkFn().finally(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }),
          timeoutPromise
        ]);
        const latencyMs = Date.now() - start;
        const status: HealthStatus = checkResult.status || 'UP';

        components[check.name] = {
          name: check.name,
          status,
          latencyMs,
          timestamp: new Date().toISOString(),
          message: checkResult.message,
          details: checkResult.details,
        };

        if (status === 'DOWN') {
          if (check.isCritical) hasDownCritical = true;
          else hasDegraded = true;
        } else if (status === 'DEGRADED') {
          hasDegraded = true;
        }
      } catch (err) {
        const latencyMs = Date.now() - start;
        components[check.name] = {
          name: check.name,
          status: 'DOWN',
          latencyMs,
          timestamp: new Date().toISOString(),
          message: err instanceof Error ? err.message : String(err),
        };

        if (check.isCritical) {
          hasDownCritical = true;
        } else {
          hasDegraded = true;
        }
      }
    });

    await Promise.all(promises);

    let status: HealthStatus = 'UP';
    if (hasDownCritical) {
      status = 'DOWN';
    } else if (hasDegraded) {
      status = 'DEGRADED';
    }

    return {
      status,
      timestamp,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.version,
      components,
    };
  }
}

export function getHealthHttpStatus(health: OverallHealth): number {
  switch (health.status) {
    case 'UP':
      return 200;
    case 'DEGRADED':
      return 200; // Accept traffic but surface warning
    case 'DOWN':
      return 503; // Service Unavailable
  }
}

// Built-in Check Helpers
export function createDatabaseHealthCheck(pingFn: () => Promise<boolean>): HealthCheckFn {
  return async () => {
    const isAlive = await pingFn();
    if (!isAlive) {
      return { status: 'DOWN', message: 'Database ping returned false' };
    }
    return { status: 'UP', message: 'Database connection active' };
  };
}

export function createMemoryHealthCheck(maxRssBytes = 1024 * 1024 * 1024): HealthCheckFn {
  return async () => {
    const mem = process.memoryUsage();
    const usedMb = Math.round(mem.rss / (1024 * 1024));
    const limitMb = Math.round(maxRssBytes / (1024 * 1024));

    if (mem.rss > maxRssBytes) {
      return {
        status: 'DEGRADED',
        message: `Memory RSS (${usedMb}MB) exceeds threshold (${limitMb}MB)`,
        details: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal }
      };
    }
    return {
      status: 'UP',
      details: { rssMb: usedMb, limitMb }
    };
  };
}

export const defaultHealthRegistry = new HealthCheckRegistry();

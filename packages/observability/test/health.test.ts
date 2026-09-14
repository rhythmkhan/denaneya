import { describe, it, expect } from 'vitest';
import {
  HealthCheckRegistry,
  getHealthHttpStatus,
  createDatabaseHealthCheck,
  createMemoryHealthCheck
} from '../src/health.js';

describe('HealthCheckRegistry', () => {
  it('T1.10: all UP checks produce overall status UP and HTTP 200', async () => {
    const registry = new HealthCheckRegistry('1.0.0');
    registry.register('db', async () => ({ status: 'UP' }));
    registry.register('redis', async () => ({ status: 'UP' }));

    const health = await registry.run();
    expect(health.status).toBe('UP');
    expect(health.components.db?.status).toBe('UP');
    expect(health.components.redis?.status).toBe('UP');
    expect(getHealthHttpStatus(health)).toBe(200);
  });

  it('T1.11: non-critical check failure yields DEGRADED status and HTTP 200', async () => {
    const registry = new HealthCheckRegistry('1.0.0');
    registry.register('db', async () => ({ status: 'UP' }), { isCritical: true });
    registry.register('optional-metrics', async () => ({ status: 'DOWN', message: 'Metrics endpoint unreachable' }), {
      isCritical: false,
    });

    const health = await registry.run();
    expect(health.status).toBe('DEGRADED');
    expect(health.components['optional-metrics']?.status).toBe('DOWN');
    expect(getHealthHttpStatus(health)).toBe(200);
  });

  it('T1.12: critical check failure yields DOWN status and HTTP 503', async () => {
    const registry = new HealthCheckRegistry('1.0.0');
    registry.register('db', async () => {
      throw new Error('Connection refused to Neon PostgreSQL');
    }, { isCritical: true });

    const health = await registry.run();
    expect(health.status).toBe('DOWN');
    expect(health.components.db?.status).toBe('DOWN');
    expect(health.components.db?.message).toContain('Connection refused');
    expect(getHealthHttpStatus(health)).toBe(503);
  });

  it('T1.13: timeout protection terminates hanging checks and marks them DOWN', async () => {
    const registry = new HealthCheckRegistry('1.0.0');
    registry.register('hanging-provider', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { status: 'UP' };
    }, { timeoutMs: 50, isCritical: true });

    const health = await registry.run();
    expect(health.status).toBe('DOWN');
    expect(health.components['hanging-provider']?.status).toBe('DOWN');
    expect(health.components['hanging-provider']?.message).toContain('timed out');
  });

  it('T1.14: built-in check helpers behave predictably', async () => {
    const dbCheckTrue = createDatabaseHealthCheck(async () => true);
    const dbCheckFalse = createDatabaseHealthCheck(async () => false);

    expect(await dbCheckTrue()).toEqual({ status: 'UP', message: 'Database connection active' });
    expect(await dbCheckFalse()).toEqual({ status: 'DOWN', message: 'Database ping returned false' });

    const memoryCheck = createMemoryHealthCheck(10 * 1024 * 1024 * 1024); // 10 GB limit
    const memResult = await memoryCheck();
    expect(memResult.status).toBe('UP');

    const memoryCheckExceeded = createMemoryHealthCheck(10); // 10 bytes limit
    const exceededResult = await memoryCheckExceeded();
    expect(exceededResult.status).toBe('DEGRADED');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as dbHealthGet } from '../../src/app/api/v1/health/db/route';
import * as dbModule from '@/lib/db';

describe('Database Health Check Endpoint (/api/v1/health/db)', () => {
  it('returns HTTP 200 with status MOCK when running under simulated in-memory storage', async () => {
    const req = new NextRequest('http://localhost/api/v1/health/db');
    const res = await dbHealthGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('MOCK');
    expect(body.mode).toBe('mock');
    expect(typeof body.latencyMs).toBe('number');
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
    expect(body.message).toContain('simulated in-memory storage mode');
  });

  it('returns HTTP 200 with status UP when live database is healthy', async () => {
    const spy = vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValueOnce({
      status: 'UP',
      latencyMs: 14,
      timestamp: new Date().toISOString(),
      mode: 'neon-pooled',
      host: 'ep-cool-db.ap-southeast-1.aws.neon.tech',
      message: 'Database connection healthy (14ms).',
    });

    const req = new NextRequest('http://localhost/api/v1/health/db');
    const res = await dbHealthGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('UP');
    expect(body.mode).toBe('neon-pooled');
    expect(body.host).toBe('ep-cool-db.ap-southeast-1.aws.neon.tech');
    expect(body.latencyMs).toBe(14);
    spy.mockRestore();
  });

  it('returns HTTP 200 with status DEGRADED when database latency is elevated or retried', async () => {
    const spy = vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValueOnce({
      status: 'DEGRADED',
      latencyMs: 620,
      timestamp: new Date().toISOString(),
      mode: 'neon-pooled',
      host: 'ep-slow-db.ap-southeast-1.aws.neon.tech',
      message: 'Database connected with elevated latency (620ms).',
    });

    const req = new NextRequest('http://localhost/api/v1/health/db');
    const res = await dbHealthGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('DEGRADED');
    expect(body.latencyMs).toBe(620);
    spy.mockRestore();
  });

  it('returns HTTP 503 Service Unavailable when database connection is DOWN', async () => {
    const spy = vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValueOnce({
      status: 'DOWN',
      latencyMs: 5002,
      timestamp: new Date().toISOString(),
      mode: 'neon-pooled',
      host: 'ep-dead-db.ap-southeast-1.aws.neon.tech',
      message: 'Database connection failed.',
      error: 'Connection timed out after 5000ms',
    });

    const req = new NextRequest('http://localhost/api/v1/health/db');
    const res = await dbHealthGet(req);

    expect(res.status).toBe(503);
    const body = await res.json();

    expect(body.status).toBe('DOWN');
    expect(body.error).toContain('Connection timed out');
    spy.mockRestore();
  });
});

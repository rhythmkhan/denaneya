import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as gatewayHealthGet } from '../../src/app/api/v1/gateways/health/route';
import { GatewayFactory } from '@denaneya/gateway-adapters';

describe('Gateway Health Aggregation & Adapter Verification', () => {
  it('GatewayFactory resolves genuine adapter instances conforming to GatewayAdapter', () => {
    const sslAdapter = GatewayFactory.getAdapter('SSLCOMMERZ', { sandbox: true } as any);
    expect(sslAdapter).toBeDefined();
    expect(sslAdapter.provider).toBe('SSLCOMMERZ');
    expect(typeof sslAdapter.initiatePayment).toBe('function');
    expect(typeof sslAdapter.verifyPayment).toBe('function');
    expect(typeof sslAdapter.healthCheck).toBe('function');

    const bkashAdapter = GatewayFactory.getAdapter('BKASH', { sandbox: true } as any);
    expect(bkashAdapter).toBeDefined();
    expect(bkashAdapter.provider).toBe('BKASH');
  });

  it('gateway health route produces HTTP 200 with aggregated status and monitored gateways', async () => {
    const req = new NextRequest('http://localhost/api/v1/gateways/health');
    const res = await gatewayHealthGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(['UP', 'DEGRADED']).toContain(body.status);
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();

    expect(body.gateways).toBeDefined();
    const providers = ['sslcommerz', 'shurjopay', 'aamarpay', 'bkash', 'nagad', 'mock'];
    for (const p of providers) {
      expect(body.gateways[p]).toBeDefined();
      expect(['UP', 'DEGRADED', 'DOWN']).toContain(body.gateways[p].status);
      expect(typeof body.gateways[p].latencyMs).toBe('number');
      expect(body.gateways[p].latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('individual gateway adapter health checks return UP or DEGRADED under mock conditions', async () => {
    const mockAdapter = GatewayFactory.getAdapter('MOCK', { sandbox: true } as any);
    const health = await mockAdapter.healthCheck();
    expect(health.status).toBe('UP');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

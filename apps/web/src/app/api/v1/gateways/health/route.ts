import { NextRequest } from 'next/server';
import { GatewayFactory, type GatewayProvider } from '@denaneya/gateway-adapters';
import { jsonResponse } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONITORED_GATEWAYS: GatewayProvider[] = [
  'SSLCOMMERZ',
  'SHURJOPAY',
  'AAMARPAY',
  'BKASH',
  'NAGAD',
  'MOCK',
];

export async function GET(_request: NextRequest) {
  const timestamp = new Date().toISOString();
  const results: Record<string, { status: 'UP' | 'DEGRADED' | 'DOWN'; latencyMs: number }> = {};

  let isAnyDown = false;
  let isAnyDegraded = false;

  await Promise.all(
    MONITORED_GATEWAYS.map(async (provider) => {
      try {
        const adapter = GatewayFactory.getAdapter(provider, { sandbox: true } as any);
        const health = await adapter.healthCheck();
        results[provider.toLowerCase()] = health;

        if (health.status === 'DOWN') isAnyDown = true;
        if (health.status === 'DEGRADED') isAnyDegraded = true;
      } catch {
        results[provider.toLowerCase()] = { status: 'DOWN', latencyMs: 0 };
        isAnyDown = true;
      }
    })
  );

  const overallStatus = isAnyDown ? 'DEGRADED' : isAnyDegraded ? 'DEGRADED' : 'UP';

  return jsonResponse({
    status: overallStatus,
    timestamp,
    gateways: results,
  });
}

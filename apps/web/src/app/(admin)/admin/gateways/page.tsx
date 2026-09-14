import { requireAdmin } from '@/lib/auth/rbac-guard';
import { GatewaysBoardClient } from './gateways-board-client';

export default async function AdminGatewaysPage() {
  await requireAdmin('platform:gateways_manage');

  const initialGateways = [
    {
      id: 'bkash',
      name: 'bKash Direct PGW',
      type: 'Mobile Financial Service (MFS)',
      status: 'UP' as const,
      latencyMs: 142,
      successRate: 99.8,
      mode: 'SANDBOX',
      lastChecked: new Date(),
    },
    {
      id: 'nagad',
      name: 'Nagad PGW (RSA-2048)',
      type: 'Mobile Financial Service (MFS)',
      status: 'UP' as const,
      latencyMs: 185,
      successRate: 99.2,
      mode: 'SANDBOX',
      lastChecked: new Date(),
    },
    {
      id: 'sslcommerz',
      name: 'SSLCOMMERZ Aggregator',
      type: 'Card & Multi-Channel Aggregator',
      status: 'UP' as const,
      latencyMs: 210,
      successRate: 98.9,
      mode: 'SANDBOX',
      lastChecked: new Date(),
    },
    {
      id: 'shurjopay',
      name: 'shurjoPay Gateway',
      type: 'Internet Merchant Gateway',
      status: 'UP' as const,
      latencyMs: 198,
      successRate: 99.1,
      mode: 'SANDBOX',
      lastChecked: new Date(),
    },
    {
      id: 'aamarpay',
      name: 'aamarPay Checkout',
      type: 'Payment Gateway',
      status: 'UP' as const,
      latencyMs: 224,
      successRate: 98.7,
      mode: 'SANDBOX',
      lastChecked: new Date(),
    },
  ];

  return <GatewaysBoardClient initialGateways={initialGateways} />;
}

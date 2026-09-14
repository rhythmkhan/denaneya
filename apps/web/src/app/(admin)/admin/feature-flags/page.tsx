import { requireAdmin } from '@/lib/auth/rbac-guard';
import { FeatureFlagsClient } from './feature-flags-client';

export default async function AdminFeatureFlagsPage() {
  await requireAdmin('platform:feature_flags_manage');

  const flags = [
    {
      key: 'REGULATED_FEATURES_ENABLED',
      name: 'Regulated Custodial & Settlement Pooling',
      description:
        'Software/Orchestration mode invariant. When false, platform strictly operates in non-custodial routing mode with zero custodial deposit holding, complying with Bangladesh Bank PSD circulars.',
      value: false,
      isLocked: true,
      regulatory: true,
    },
    {
      key: 'MAKER_CHECKER_ENFORCEMENT',
      name: 'Dual-Control Maker-Checker Enforcement',
      description:
        'Enforces maker_id <> checker_id invariant across high-risk fraud review queues. System security invariant.',
      value: true,
      isLocked: true,
      regulatory: true,
    },
    {
      key: 'SMS_COLLECTOR_AUTO_SETTLEMENT',
      name: 'Tier C SMS Collector Auto-Settlement',
      description:
        'Automatically settles open payments upon receipt of verified hardware-signed Android SMS notifications.',
      value: true,
      isLocked: false,
      regulatory: false,
    },
    {
      key: 'SANDBOX_SIMULATOR_ENABLED',
      name: 'Hosted Checkout Sandbox Simulator',
      description:
        'Permits test merchants to simulate instantaneous payment approvals and SMS generation on checkout.',
      value: true,
      isLocked: false,
      regulatory: false,
    },
    {
      key: 'MAINTENANCE_MODE',
      name: 'System Maintenance Lockout',
      description:
        'Pauses public checkout portals and blocks merchant mutation APIs for scheduled database maintenance.',
      value: false,
      isLocked: false,
      regulatory: false,
    },
  ];

  return <FeatureFlagsClient initialFlags={flags} />;
}

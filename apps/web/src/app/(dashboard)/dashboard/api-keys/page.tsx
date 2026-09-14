import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apiKeys } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { ApiKeysClient } from '@/components/dashboard/api-keys-client';

export default async function ApiKeysPage() {
  const { merchantId } = await requireMerchant('api_keys:read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.merchantId, merchantId))
      .orderBy(desc(apiKeys.createdAt));
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'key_demo_01',
        name: 'Default Sandbox Secret',
        keyPrefix: 'dn_test_sec_9a8b',
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['payments:read', 'payments:write', 'refunds:create'],
        lastUsedAt: new Date(),
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(Date.now() - 86400000 * 5),
      },
      {
        id: 'key_demo_02',
        name: 'Default Sandbox Public',
        keyPrefix: 'dn_test_pub_3f1e',
        type: 'PUBLISHABLE',
        environment: 'SANDBOX',
        scopes: ['payments:read'],
        lastUsedAt: new Date(Date.now() - 3600000),
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(Date.now() - 86400000 * 5),
      },
    ];
  }

  return <ApiKeysClient keys={rows} />;
}

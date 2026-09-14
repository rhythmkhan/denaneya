import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookSubscriptions } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { WebhooksClient } from '@/components/dashboard/webhooks-client';

export default async function WebhooksPage() {
  const { merchantId } = await requireMerchant('webhooks:read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.merchantId, merchantId))
      .orderBy(desc(webhookSubscriptions.createdAt));
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'whs_demo_01',
        url: 'https://backend.mybusiness.com.bd/api/webhooks/denaneya',
        events: ['payment.completed', 'refund.created', 'payment.failed'],
        status: 'ACTIVE',
        failureCount: 0,
        lastDeliveryAt: new Date(Date.now() - 1800000),
        createdAt: new Date(Date.now() - 86400000 * 14),
      },
    ];
  }

  return <WebhooksClient webhooks={rows} />;
}

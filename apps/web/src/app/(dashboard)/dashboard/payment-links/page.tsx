import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentLinks, merchants } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { PaymentLinksClient } from '@/components/dashboard/payment-links-client';

export default async function PaymentLinksPage() {
  const { merchantId } = await requireMerchant('payment_links:read');

  let links: any[] = [];
  let merchantName = 'Merchant';

  if (db) {
    links = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.merchantId, merchantId))
      .orderBy(desc(paymentLinks.createdAt));

    const [m] = await db
      .select({ name: merchants.businessName })
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    if (m?.name) merchantName = m.name;
  }

  if (links.length === 0) {
    links = [
      {
        id: 'plk_demo_01',
        title: 'Eid Mega Sale 2026',
        slug: 'eid-mega-sale-2026',
        amountPaisa: 150000n,
        type: 'MULTI_USE',
        status: 'ACTIVE',
        usedCount: 14,
        maxUses: 100,
        createdAt: new Date(),
      },
      {
        id: 'plk_demo_02',
        title: 'Software Consulting Retainer',
        slug: 'retainer-consulting',
        amountPaisa: null,
        type: 'SINGLE_USE',
        status: 'ACTIVE',
        usedCount: 0,
        maxUses: 1,
        createdAt: new Date(Date.now() - 86400000),
      },
    ];
  }

  return (
    <PaymentLinksClient
      links={links}
      merchantId={merchantId}
      merchantName={merchantName}
    />
  );
}

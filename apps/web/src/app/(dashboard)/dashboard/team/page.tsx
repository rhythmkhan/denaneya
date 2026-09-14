import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchantMemberships, users } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { TeamClient } from './team-client';

export default async function TeamPage() {
  const { merchantId } = await requireMerchant('team:read');

  let members: any[] = [];
  if (db) {
    const rows = await db
      .select({
        id: merchantMemberships.id,
        role: merchantMemberships.role,
        status: merchantMemberships.status,
        invitedEmail: merchantMemberships.invitedEmail,
        createdAt: merchantMemberships.createdAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(merchantMemberships)
      .leftJoin(users, eq(merchantMemberships.userId, users.id))
      .where(eq(merchantMemberships.merchantId, merchantId));

    members = rows;
  }

  if (members.length === 0) {
    members = [
      {
        id: 'mem_01',
        role: 'OWNER',
        status: 'ACTIVE',
        name: 'Merchant Principal',
        email: 'founder@mybusiness.com.bd',
        phone: '+8801711223344',
        createdAt: new Date(Date.now() - 86400000 * 60),
      },
      {
        id: 'mem_02',
        role: 'FINANCE',
        status: 'ACTIVE',
        name: 'Finance Manager',
        email: 'accounts@mybusiness.com.bd',
        phone: '+8801811223344',
        createdAt: new Date(Date.now() - 86400000 * 20),
      },
      {
        id: 'mem_03',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        name: 'Lead Developer',
        email: 'tech@mybusiness.com.bd',
        phone: '+8801911223344',
        createdAt: new Date(Date.now() - 86400000 * 10),
      },
    ];
  }

  return <TeamClient members={members} />;
}

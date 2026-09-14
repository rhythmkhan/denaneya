'use server';

import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchants, auditLogs } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { ensureMerchantAccounts } from '@denaneya/ledger';
import { revalidatePath } from 'next/cache';

export async function adminApproveKycAction(merchantId: string) {
  const admin = await requireAdmin('platform:merchants_manage');

  if (db) {
    await db.transaction(async (tx) => {
      await tx
        .update(merchants)
        .set({
          kycStatus: 'VERIFIED',
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      // Ensure double-entry ledger accounts are provisioned
      await ensureMerchantAccounts(tx, merchantId);

      // Audit Log
      const auditId = 'aud_' + crypto.randomBytes(12).toString('hex');
      const prevLog = await tx.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(1);
      const prevHash = prevLog[0]?.currentHash || '0000000000000000000000000000000000000000000000000000000000000000';
      const now = new Date();
      const payloadStr = JSON.stringify({ merchantId, action: 'KYC_APPROVED' });
      const currentHash = crypto.createHash('sha256').update(auditId + now.toISOString() + admin.id + 'merchant.kyc_approved' + payloadStr + prevHash).digest('hex');

      await tx.insert(auditLogs).values({
        id: auditId,
        merchantId,
        actorId: admin.id,
        actorType: 'USER',
        action: 'merchant.kyc_approved',
        resourceType: 'merchant',
        resourceId: merchantId,
        previousHash: prevHash,
        currentHash,
        payload: { action: 'KYC_APPROVED' },
        timestamp: now,
      });
    });
  }

  revalidatePath('/admin/merchants');
  revalidatePath(`/admin/merchants/${merchantId}`);
  return { success: true };
}

export async function adminRejectKycAction(merchantId: string, reason: string) {
  const admin = await requireAdmin('platform:merchants_manage');

  if (db) {
    await db.transaction(async (tx) => {
      await tx
        .update(merchants)
        .set({
          kycStatus: 'REJECTED',
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      const auditId = 'aud_' + crypto.randomBytes(12).toString('hex');
      const prevLog = await tx.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(1);
      const prevHash = prevLog[0]?.currentHash || '0000000000000000000000000000000000000000000000000000000000000000';
      const now = new Date();
      const payloadStr = JSON.stringify({ merchantId, action: 'KYC_REJECTED', reason });
      const currentHash = crypto.createHash('sha256').update(auditId + now.toISOString() + admin.id + 'merchant.kyc_rejected' + payloadStr + prevHash).digest('hex');

      await tx.insert(auditLogs).values({
        id: auditId,
        merchantId,
        actorId: admin.id,
        actorType: 'USER',
        action: 'merchant.kyc_rejected',
        resourceType: 'merchant',
        resourceId: merchantId,
        previousHash: prevHash,
        currentHash,
        payload: { action: 'KYC_REJECTED', reason },
        timestamp: now,
      });
    });
  }

  revalidatePath('/admin/merchants');
  revalidatePath(`/admin/merchants/${merchantId}`);
  return { success: true };
}
